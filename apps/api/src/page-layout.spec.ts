import { PageLayoutValidationError, assertLockedGlobalBlocks, normalizePageSlug, validatePageLayout } from './page-layout';

const block = (id: string, type = 'hero', children: unknown[] = [], props: Record<string, unknown> = {}) => ({ id, type, props, children });

describe('page layout schema', () => {
  it('accepts registered recursive grid layouts', () => {
    expect(validatePageLayout([block('grid-1', 'grid', [block('hero-1')], { columns: 2 })])).toHaveLength(1);
  });

  it('rejects unknown components and duplicate IDs', () => {
    expect(() => validatePageLayout([block('x', 'unknown')])).toThrow(PageLayoutValidationError);
    expect(() => validatePageLayout([block('x'), block('x')])).toThrow(/ID 重复/);
  });

  it('rejects children on non-container components and duplicate global blocks', () => {
    expect(() => validatePageLayout([block('hero', 'hero', [block('child')])])).toThrow(/不是容器/);
    expect(() => validatePageLayout([block('h1', 'header'), block('h2', 'header')])).toThrow(/最多一个/);
  });

  it('rejects unsafe URLs, invalid columns and unsupported schema versions', () => {
    expect(() => validatePageLayout([block('button', 'button', [], { url: 'javascript:alert(1)' })])).toThrow(/HTTP\/HTTPS/);
    expect(() => validatePageLayout([block('button', 'button', [], { url: '//evil.example' })])).toThrow(/协议相对/);
    expect(() => validatePageLayout([block('grid', 'grid', [], { columns: 5 })])).toThrow(/1–4/);
    expect(() => validatePageLayout([], 2)).toThrow(/Schema/);
  });

  it('accepts cross-realm JSON records but rejects class instances', () => {
    const crossRealm = require('node:vm').runInNewContext('({id:"cross",type:"hero",props:{},children:[]})');
    expect(validatePageLayout([crossRealm])).toHaveLength(1);
    class ForgedBlock { id = 'forged'; type = 'hero'; props = {}; children: unknown[] = []; }
    expect(() => validatePageLayout([new ForgedBlock()])).toThrow(/结构无效/);
  });

  it('protects locked global header and footer identities', () => {
    expect(() => assertLockedGlobalBlocks([block('header-1', 'header')], [])).toThrow(/锁定/);
    expect(() => assertLockedGlobalBlocks([block('header-1', 'header')], [block('header-1', 'header')])).not.toThrow();
  });

  it('normalizes nested routes and rejects reserved or ambiguous routes', () => {
    expect(normalizePageSlug('/Help/Windows/')).toBe('help/windows');
    expect(() => normalizePageSlug('admin/users')).toThrow(/保留/);
    expect(() => normalizePageSlug('help//windows')).toThrow(/连续斜杠/);
  });
});
