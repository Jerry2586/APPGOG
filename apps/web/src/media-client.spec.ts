import { describe, expect, it } from 'vitest';
import { appendMediaValue, resolveMediaUrl } from './media-client';
describe('media selection contract', () => {
  it('resolves media against the API origin for split-domain deployment', () => {
    expect(resolveMediaUrl('/api/v1/public/media/abc', 'https://api.example.com/api/v1', 'https://www.example.com')).toBe('https://api.example.com/api/v1/public/media/abc');
    expect(resolveMediaUrl('/api/v1/public/media/abc', '/api/v1', 'https://www.example.com')).toBe('https://www.example.com/api/v1/public/media/abc');
    expect(() => resolveMediaUrl('//evil.example/a', '/api/v1', 'https://site.example')).toThrow();
  });
  it('preserves legacy URL text when adding a selected image', () => {
    expect(appendMediaValue('/old.png\n/second.png', 'images', 'url-list', { publicUrl: '/new.png' })).toEqual(['/old.png', '/second.png', '/new.png']);
  });
  it('preserves alternative text and enforces the server slide limit', () => {
    expect(appendMediaValue([], 'slides', 'json', { publicUrl: '/new.png', altText: '产品照片' })).toEqual([{ imageUrl: '/new.png', alt: '产品照片' }]);
    expect(() => appendMediaValue(Array(30).fill({}), 'slides', 'json', { publicUrl: '/new.png' })).toThrow('30');
  });
});
