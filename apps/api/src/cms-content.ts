import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import MarkdownIt = require('markdown-it');
import sanitizeHtml = require('sanitize-html');
import type { CmsWriteDto } from './cms.dto';

const markdown = new MarkdownIt({ html: false, linkify: false, breaks: true });
export function cmsUrl(value: string | null | undefined, video = false): string | null {
  const input = value?.trim(); if (!input) return null;
  if (/[\u0000-\u0020\u007f\\]/.test(input)) throw new BadRequestException('图片/视频地址含非法字符');
  if (!video && /^\/(?!\/)/.test(input)) return input;
  let url: URL; try { url = new URL(input); } catch { throw new BadRequestException('地址必须是 HTTP/HTTPS URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new BadRequestException('地址必须是无身份凭据的 HTTP/HTTPS URL');
  if (video && !/\.m3u8$/i.test(url.pathname)) throw new BadRequestException('视频必须是 m3u8 直链');
  return url.href;
}
export function cleanCmsHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: ['p','br','h1','h2','h3','h4','h5','h6','strong','b','em','i','u','s','blockquote','pre','code','ol','ul','li','a','img','hr','table','thead','tbody','tr','td','th'],
    allowedAttributes: { a: ['href','title','target','rel'], img: ['src','alt','title'], ol: ['start'], code: ['class'] },
    allowedClasses: { code: [/^language-[a-z0-9-]+$/] },
    allowedSchemes: ['http','https'], allowProtocolRelative: false,
    transformTags: { a: (_tag, attributes) => ({ tagName: 'a', attribs: { ...attributes, target: '_blank', rel: 'noopener noreferrer' } }) },
    exclusiveFilter: frame => {
      if (frame.tag !== 'img' && frame.tag !== 'a') return false;
      const value = frame.attribs[frame.tag === 'img' ? 'src' : 'href'];
      if (!value) return frame.tag === 'img';
      try { cmsUrl(value); return false; } catch { return true; }
    }
  });
}
export function renderCmsBody(body: string, format: string) {
  return cleanCmsHtml(format === 'RICH_TEXT' ? body : markdown.render(body));
}
export function contentText(html: string) { return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim(); }
export function cmsSlug(value: string) {
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)*$/.test(slug)) throw new BadRequestException('slug 仅允许字母、数字、_、- 和非空路径段');
  return slug;
}
export function normalizeCms(input: CmsWriteDto) {
  const title = input.title.trim(); if (!title) throw new BadRequestException('标题不能为空');
  const body = input.format === 'RICH_TEXT' ? cleanCmsHtml(input.body) : input.body;
  const faqAnswer = input.format === 'RICH_TEXT' ? cleanCmsHtml(input.faqAnswer) : input.faqAnswer;
  return { type: input.type, format: input.format, title, slug: cmsSlug(input.slug), summary: input.summary.trim() || null,
    body, faqQuestion: input.faqQuestion.trim() || null, faqAnswer: faqAnswer || null,
    coverUrl: cmsUrl(input.coverUrl), videoUrl: cmsUrl(input.videoUrl, true), categoryId: input.categoryId || null,
    ragEnabled: input.ragEnabled, seoTitle: input.seoTitle.trim() || null, seoDescription: input.seoDescription.trim() || null,
    seoKeywords: input.seoKeywords.trim() || null, ogImage: cmsUrl(input.ogImage) };
}
export function cmsSnapshot(doc: any, publishing = false) {
  const publicUrl = (value: string | null | undefined, video = false) => {
    try { return cmsUrl(value, video); }
    catch (error) { if (publishing) throw error; return null; }
  };
  const source = { type: doc.type, format: doc.format, title: doc.title, slug: doc.slug, summary: doc.summary,
    body: doc.body || '', faqQuestion: doc.faqQuestion, faqAnswer: doc.faqAnswer, coverUrl: publicUrl(doc.coverUrl),
    videoUrl: publicUrl(doc.videoUrl, true), categoryId: doc.categoryId, seoTitle: doc.seoTitle,
    seoDescription: doc.seoDescription, seoKeywords: doc.seoKeywords, ogImage: publicUrl(doc.ogImage) };
  const renderedBody = renderCmsBody(source.body, source.format), renderedAnswer = renderCmsBody(source.faqAnswer || '', source.format);
  if (publishing) {
    if (source.type === 'FAQ' && (!source.faqQuestion?.trim() || !contentText(renderedAnswer))) throw new BadRequestException('发布 FAQ 必须填写问题和有效答案');
    if (source.type === 'VIDEO' && !source.videoUrl) throw new BadRequestException('发布视频必须填写 m3u8 地址');
    if (source.type === 'ARTICLE' && !contentText(renderedBody) && !renderedBody.includes('<img ')) throw new BadRequestException('发布文章必须填写正文');
  }
  const searchText = [source.title, source.summary, source.faqQuestion, contentText(renderedBody), contentText(renderedAnswer)].filter(Boolean).join('\n');
  return { snapshot: source, html: renderedBody, faqHtml: renderedAnswer, searchText,
    hash: createHash('sha256').update(JSON.stringify(source)).digest('hex') };
}
export type CategoryNode = { id: string; parentId: string | null; scope: string };
export function validateCategoryParent(nodes: CategoryNode[], id: string | undefined, parentId: string | null, scope: string) {
  const map = new Map(nodes.map(node => [node.id, node])); const seen = new Set<string>(); let parent = parentId;
  while (parent) {
    if (parent === id || seen.has(parent)) throw new BadRequestException('分类不能移动到自身或后代，禁止循环');
    seen.add(parent); const node = map.get(parent);
    if (!node || node.scope !== scope) throw new BadRequestException('父分类不存在或跨越分类域');
    parent = node.parentId;
  }
}
export function descendantIds(nodes: CategoryNode[], root: string) {
  const output: string[] = [], queue = [root], seen = new Set<string>();
  const children = new Map<string, string[]>();
  for (const node of nodes) if (node.parentId) children.set(node.parentId, [...(children.get(node.parentId) || []), node.id]);
  while (queue.length) { const id = queue.pop()!; if (seen.has(id)) continue; seen.add(id); output.push(id); queue.push(...(children.get(id) || [])); }
  return output;
}
