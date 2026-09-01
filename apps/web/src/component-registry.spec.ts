import { describe, expect, it } from 'vitest';
import { componentRenderers, rendererTypes } from './component-registry';
import { reactive } from 'vue';
import { newBlock } from './types';

const expected = ['grid', 'hero', 'carousel', 'button', 'header', 'footer', 'breadcrumb', 'products', 'cart', 'categories', 'contents', 'faq', 'ai', 'sale', 'popup', 'countdown', 'particles', 'globe'];

describe('component renderer registry', () => {
  it('clones reactive component defaults used by the page editor palette', () => {
    const defaults = reactive({ categoryId: '', items: [{ label: 'original' }] });
    const block = newBlock('products', defaults);
    block.props.items[0].label = 'changed';
    expect(defaults.items[0].label).toBe('original');
    expect(block.type).toBe('products');
    expect(block.children).toEqual([]);
  });
  it('maps every version 1 component to one renderer', () => {
    expect(new Set(rendererTypes)).toEqual(new Set(expected));
    for (const type of expected) expect(componentRenderers[type]).toBeTruthy();
  });
});
