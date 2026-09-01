import type { PageBlock, PageLayout } from '@appgog/contracts';
import { COMPONENT_TYPES, ComponentPropsValidationError, validateComponentProps } from './component-registry';

export const MAX_PAGE_TREE_DEPTH = 10;
export const MAX_PAGE_BLOCKS = 500;
const MAX_LAYOUT_BYTES = 256 * 1024;
const MAX_PROP_KEYS = 40;
const MAX_STRING_LENGTH = 10_000;
const PAGE_LAYOUT_SCHEMA_VERSION = 1;
const BLOCK_TYPES = new Set<string>(COMPONENT_TYPES);
const RESERVED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export class PageLayoutValidationError extends Error {}

function fail(message: string): never {
  throw new PageLayoutValidationError(message);
}

function plainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  // JSON can originate in a different JS realm (HTTP parser / worker / test VM).
  // Accept that realm's Object.prototype, but not class instances or custom chains.
  return prototype === null || prototype === Object.prototype || (
    Object.getPrototypeOf(prototype) === null &&
    Object.prototype.hasOwnProperty.call(prototype, 'constructor') &&
    typeof prototype.constructor === 'function' &&
    Function.prototype.toString.call(prototype.constructor) === Function.prototype.toString.call(Object)
  );
}

export function safePageUrl(value: string, label = '链接') {
  if (/[\\\u0000-\u0020]/.test(value)) fail(`${label}不能包含反斜杠、空白或控制字符`);
  if (value === '#' || value.startsWith('#')) return value;
  if (value.startsWith('/')) {
    if (value.startsWith('//')) fail(`${label}不能使用协议相对外部地址`);
    return value;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail(`${label}必须是站内路径或 HTTP/HTTPS URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    fail(`${label}必须是无身份信息的 HTTP/HTTPS URL`);
  }
  if (url.search || url.hash) fail(`${label}不能包含查询参数或片段`);
  return url.toString();
}

function validateValue(value: unknown, path: string, depth = 0): void {
  if (depth > 8) fail(`${path} 属性嵌套过深`);
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) fail(`${path} 文本过长`);
    return;
  }
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${path} 必须是有限数字`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 100) fail(`${path} 数组过长`);
    value.forEach((item, index) => validateValue(item, `${path}[${index}]`, depth + 1));
    return;
  }
  if (!plainObject(value)) fail(`${path} 属性类型无效`);
  const entries = Object.entries(value);
  if (entries.length > MAX_PROP_KEYS) fail(`${path} 属性数量过多`);
  for (const [key, item] of entries) {
    if (RESERVED_KEYS.has(key)) fail(`${path} 包含危险字段`);
    validateValue(item, `${path}.${key}`, depth + 1);
  }
}

function validateUrlProps(block: PageBlock, path: string) {
  for (const key of ['url', 'imageUrl', 'coverUrl']) {
    const value = block.props[key];
    if (typeof value === 'string' && value.trim()) safePageUrl(value.trim(), `${path}.${key}`);
  }
  const images = block.props.images;
  if (typeof images === 'string') {
    images.split(/\r?\n/).map(item => item.trim()).filter(Boolean)
      .forEach((item, index) => safePageUrl(item, `${path}.images[${index}]`));
  }
}

export function validatePageLayout(input: unknown, schemaVersion: number = PAGE_LAYOUT_SCHEMA_VERSION): PageLayout {
  if (schemaVersion !== PAGE_LAYOUT_SCHEMA_VERSION) fail(`不支持的页面 Schema 版本：${schemaVersion}`);
  if (!Array.isArray(input)) fail('页面布局必须是组件数组');
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > MAX_LAYOUT_BYTES) fail('页面布局不能超过 256 KiB');

  const ids = new Set<string>();
  const globalTypes = new Set<string>();
  let count = 0;

  const visit = (blocks: unknown[], depth: number, parentType?: string): PageBlock[] => {
    if (depth > MAX_PAGE_TREE_DEPTH) fail(`组件嵌套不能超过 ${MAX_PAGE_TREE_DEPTH} 层`);
    return blocks.map((candidate, index) => {
      const path = `layout${'.children'.repeat(depth - 1)}[${index}]`;
      if (!plainObject(candidate)) fail(`${path} 组件结构无效`);
      const unknownKeys = Object.keys(candidate).filter(key => !['id', 'type', 'props', 'children'].includes(key));
      if (unknownKeys.length) fail(`${path} 包含未声明字段：${unknownKeys.join(', ')}`);
      const { id, type, props, children } = candidate;
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) fail(`${path}.id 无效`);
      if (ids.has(id)) fail(`组件 ID 重复：${id}`);
      ids.add(id);
      if (typeof type !== 'string' || !BLOCK_TYPES.has(type)) fail(`${path}.type 未注册：${String(type)}`);
      if (!plainObject(props)) fail(`${path}.props 必须是对象`);
      if (!Array.isArray(children)) fail(`${path}.children 必须是数组`);
      count += 1;
      if (count > MAX_PAGE_BLOCKS) fail(`单页组件不能超过 ${MAX_PAGE_BLOCKS} 个`);

      if (['header', 'footer'].includes(type)) {
        if (depth !== 1 || parentType) fail(`${type} 只能放在页面顶层`);
        if (globalTypes.has(type)) fail(`每个页面最多一个 ${type}`);
        globalTypes.add(type);
      }
      if (type !== 'grid' && children.length) fail(`${type} 不是容器，不能包含子组件`);
      if (type !== 'footer' && props.columns !== undefined && (!Number.isInteger(props.columns) || Number(props.columns) < 1 || Number(props.columns) > 4)) {
        fail(`${path}.props.columns 必须是 1–4 的整数`);
      }
      if (props.limit !== undefined && (!Number.isInteger(props.limit) || Number(props.limit) < 1 || Number(props.limit) > 50)) {
        fail(`${path}.props.limit 必须是 1–50 的整数`);
      }
      validateValue(props, `${path}.props`);
      try {
        validateComponentProps(type, props);
      } catch (error) {
        if (error instanceof ComponentPropsValidationError) fail(`${path}: ${error.message}`);
        throw error;
      }
      const block = candidate as unknown as PageBlock;
      validateUrlProps(block, path);
      return { id, type: type as PageBlock['type'], props, children: visit(children, depth + 1, type) };
    });
  };

  return visit(input, 1);
}

export function assertLockedGlobalBlocks(previous: unknown, next: unknown) {
  const previousLayout = validatePageLayout(previous);
  const nextLayout = validatePageLayout(next);
  for (const type of ['header', 'footer'] as const) {
    const locked = previousLayout.find(block => block.type === type);
    if (locked && !nextLayout.some(block => block.type === type && block.id === locked.id)) {
      fail(`已锁定的 ${type} 不能删除或替换`);
    }
  }
}

export function normalizePageSlug(value: string) {
  const slug = value.trim().replace(/^\/+|\/+$/g, '').toLowerCase();
  if (!slug || slug.length > 200 || !/^[a-z0-9](?:[a-z0-9_-]|\/(?!\/))*[a-z0-9_-]$|^[a-z0-9]$/.test(slug)) {
    fail('路由必须是 1–200 位小写字母、数字、/、_或 -，不能有连续斜杠');
  }
  const first = slug.split('/')[0];
  if (['admin', 'api', 'content'].includes(first)) fail(`路由前缀 ${first} 为系统保留路由`);
  return slug;
}
