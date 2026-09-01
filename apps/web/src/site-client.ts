import type { Block } from './types';

export function siteSlug(value: unknown) {
  return (Array.isArray(value) ? value.join('/') : String(value || '')).replace(/^\/+|\/+$/g, '') || 'home';
}
export function pendingPublication(layout: Block[]): { id: string; title: string; message: string }[] {
  return layout.flatMap(block => [
    ...(typeof block.props.publicationRequirement === 'string' && block.props.publicationRequirement.trim()
      ? [{ id: block.id, title: String(block.props.title || block.type), message: block.props.publicationRequirement.trim() }] : []),
    ...pendingPublication(block.children)
  ]);
}

export function siteMetadata(page?: Record<string, any>, missing = false) {
  return { title: missing ? '页面未找到 · APPGOG' : page?.seoTitle || page?.name || 'APPGOG',
    description: page?.seoDescription || '', keywords: page?.seoKeywords || '', image: page?.ogImage || '',
    robots: missing ? 'noindex, nofollow' : 'index, follow' };
}
