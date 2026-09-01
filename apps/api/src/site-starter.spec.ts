import { siteStarterPages, publicationRequirements } from './site-starter';
import { safePageUrl, validatePageLayout } from './page-layout';
import type { PageBlock } from '@appgog/contracts';

const flatten = (blocks: PageBlock[]): PageBlock[] => blocks.flatMap(b => [b, ...flatten(b.children)]);
describe('stage12 official website authoring recipes', () => {
  it('covers all 16 SITE requirements with 21 editable, unique routes', () => {
    const pages = siteStarterPages(); expect(pages).toHaveLength(21);
    expect(new Set(pages.map(p => p.slug)).size).toBe(21);
    for (let i = 1; i <= 16; i++) expect(pages.some(p => p.requirement === `SITE-${String(i).padStart(3, '0')}`)).toBe(true);
  });
  it.each(siteStarterPages())('$slug: valid tree, SEO, one H1, locked header/footer and release checks', page => {
    expect(validatePageLayout(page.layout)).toEqual(page.layout);
    expect(page.seoTitle).toContain('APPGOG'); expect(page.seoDescription).toBeTruthy();
    expect(flatten(page.layout).filter(b => b.props.headingLevel === 'h1')).toHaveLength(1);
    expect(page.layout[0].type).toBe('header'); expect(page.layout.at(-1)!.type).toBe('footer');
    expect(publicationRequirements(page.layout).length).toBeGreaterThan(0);
  });
  it('has no dangling internal navigation within the starter set', () => {
    const pages = siteStarterPages(), routes = new Set(['/', ...pages.map(p => '/' + p.slug)]);
    for (const page of pages) for (const match of JSON.stringify(page.layout).matchAll(/"(?:url|backUrl|homeUrl)":"(\/[^"#?]*)"/g)) expect(routes.has(match[1])).toBe(true);
  });
  it('binds help and shop to existing real CMS/catalog components', () => {
    const pages = siteStarterPages();
    expect(pages.find(p => p.slug === 'help')!.layout.map(b => b.type)).toEqual(expect.arrayContaining(['ai', 'categories', 'contents', 'faq']));
    expect(pages.find(p => p.slug === 'shop')!.layout.map(b => b.type)).toEqual(expect.arrayContaining(['products', 'cart', 'categories']));
    expect(JSON.stringify(pages.find(p => p.slug === 'downloads'))).toMatch(/Windows[\s\S]*macOS[\s\S]*Linux[\s\S]*iOS[\s\S]*Android/);
  });
  it('never seeds invented external destinations or publishes placeholder business facts', () => {
    const serialized = JSON.stringify(siteStarterPages());
    expect(serialized).not.toMatch(/https?:\/\//);
    expect(serialized).not.toMatch(/5000|60\+|10Gbps|99\.99|vip@appgog|appgog_vip_bot/);
  });
  it('explicit node parent navigation works independently of browser history', () => {
    expect(siteStarterPages().find(p => p.slug === 'nodes/detail')!.layout[1].props.backUrl).toBe('/nodes');
  });
  it('footer columns are structured arrays, while grid columns remain integers', () => {
    const footer = siteStarterPages()[0].layout.at(-1)!;
    expect(() => validatePageLayout([footer])).not.toThrow();
    expect(() => validatePageLayout([{ ...footer, props: { columns: 3 } }])).toThrow();
    expect(() => validatePageLayout([{ id: 'g', type: 'grid', props: { columns: [] }, children: [] }])).toThrow();
  });
  it.each(['/\\evil.invalid', 'https://good.invalid/\npath', '//evil.invalid', 'https://good.invalid/?token=secret'])('rejects unsafe SEO/redirect paths %s', url => {
    expect(() => safePageUrl(url)).toThrow();
  });
});
