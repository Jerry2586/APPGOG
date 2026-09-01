import DOMPurify from 'dompurify';
import { Marked } from 'marked';
const markdown = new Marked({ breaks: true, renderer: { html: ({text}) => text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') } });
export type CmsCategory = { id: string; name: string; slug: string; parentId: string | null; scope: string; description?: string; sort: number; revision: number };
export function categoryOptions(nodes: CmsCategory[], excludedId?: string) {
  const children = new Map<string, CmsCategory[]>();
  for (const node of nodes) { const key = node.parentId || ''; children.set(key, [...(children.get(key) || []), node]); }
  for (const siblings of children.values()) siblings.sort((a,b)=>a.sort-b.sort || a.id.localeCompare(b.id));
  const result: Array<CmsCategory & { depth: number }> = [], visited = new Set<string>();
  const stack = (children.get('') || []).slice().reverse().map(node=>({node,depth:0}));
  while (stack.length) {
    const {node,depth} = stack.pop()!; if (visited.has(node.id) || node.id === excludedId) continue;
    visited.add(node.id); result.push({...node,depth});
    stack.push(...(children.get(node.id)||[]).slice().reverse().map(child=>({node:child,depth:depth+1})));
  }
  return result;
}
export function safeCmsHtml(body: string, format: string) {
  const html = format === 'RICH_TEXT' ? body : markdown.parse(body || '', { async: false });
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ['iframe','style','form','input','button','video','audio','svg','math'], FORBID_ATTR: ['style'], ALLOW_DATA_ATTR: false });
}
export function emptyContent(type: 'ARTICLE' | 'FAQ' | 'VIDEO' = 'ARTICLE') {
  return { type, format: 'MARKDOWN', title: '', slug: '', summary: '', body: '', faqQuestion: '', faqAnswer: '', coverUrl: '', videoUrl: '', categoryId: '', ragEnabled: false, seoTitle: '', seoDescription: '', seoKeywords: '', ogImage: '' };
}
export function contentPayload(form: any) {
  const payload: Record<string, any> = {};
  for (const key of Object.keys(emptyContent())) payload[key] = form[key] ?? (key === 'ragEnabled' ? false : '');
  if (form.id) payload.baseRevision = form.revision;
  return payload;
}
