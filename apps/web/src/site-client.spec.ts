import { describe, it, expect } from 'vitest';
import { pendingPublication, siteMetadata, siteSlug } from './site-client';
describe('stage12 public route and authoring helpers', () => {
  it.each([[undefined, 'home'], ['', 'home'], [[], 'home'], [['nodes', 'detail'], 'nodes/detail'], ['/nodes/detail/', 'nodes/detail']])('normalizes %j to %s', (value, expected) => expect(siteSlug(value)).toBe(expected));
  it('collects nested review blockers and omits cleared checks', () => {
    expect(pendingPublication([{ id: 'g', type: 'grid', props: {}, children: [{ id: 'h', type: 'hero', props: { title: '节点', publicationRequirement: ' 核实资料 ' }, children: [] }] }])).toEqual([{ id: 'h', title: '节点', message: '核实资料' }]);
    expect(pendingPublication([{ id: 'h', type: 'hero', props: { publicationRequirement: ' ' }, children: [] }])).toEqual([]);
  });
  it('clears stale SEO on missing/changed pages and preserves keywords', () => {
    expect(siteMetadata({ seoTitle: '标题', seoKeywords: '资料', ogImage: '/image.webp' }).keywords).toBe('资料');
    expect(siteMetadata(undefined, true)).toEqual({ title: '页面未找到 · APPGOG', description: '', keywords: '', image: '', robots: 'noindex, nofollow' });
    expect(siteMetadata().robots).toBe('index, follow');
  });
});
