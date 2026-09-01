import { describe, expect, it } from 'vitest';
import { LayoutHistory } from './layout-history';
import { reactive } from 'vue';

describe('LayoutHistory', () => {
  it('snapshots reactive JSON layouts without DataCloneError or shared references', () => {
    const layout = reactive([{ id: 'product', props: { categoryId: '', gallery: ['first'] } }]);
    const history = new LayoutHistory<typeof layout>();
    history.reset(layout);
    layout[0].props.categoryId = 'devices';
    history.record(layout);
    layout[0].props.gallery.push('second');
    expect(history.undo()?.[0].props).toEqual({ categoryId: '', gallery: ['first'] });
    expect(history.redo()?.[0].props).toEqual({ categoryId: 'devices', gallery: ['first'] });
  });
  it('supports immutable undo and redo snapshots', () => {
    const history = new LayoutHistory<{ value: number }>();
    history.reset({ value: 1 });
    history.record({ value: 2 });
    const previous = history.undo();
    expect(previous).toEqual({ value: 1 });
    if (previous) previous.value = 99;
    expect(history.redo()).toEqual({ value: 2 });
  });

  it('drops the redo branch after a new edit', () => {
    const history = new LayoutHistory<number[]>();
    history.reset([1]);
    history.record([1, 2]);
    history.undo();
    history.record([3]);
    expect(history.canRedo).toBe(false);
    expect(history.undo()).toEqual([1]);
  });
});
