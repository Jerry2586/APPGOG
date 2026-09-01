import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRenderer } from 'vue';
import { api } from './api';
import { useMediaLibrary } from './media-client';

vi.mock('./api', () => ({ api: { get: vi.fn(), defaults: { baseURL: 'https://api.example.com/api/v1' } } }));
const renderer = createRenderer<object, object>({
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  setText() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null,
  insert() {}, remove() {}, patchProp() {}
});
const cleanups: Array<() => void> = [];
function mount() {
  vi.stubGlobal('location', { origin: 'https://www.example.com' });
  let library!: ReturnType<typeof useMediaLibrary>;
  const app = renderer.createApp({ setup() { library = useMediaLibrary(); return () => null; } });
  app.mount({}); cleanups.push(() => app.unmount()); return library;
}
const response = (id: string, total = 1) => ({ data: { total, items: [{ id, publicUrl: `/api/v1/public/media/${id}` }] } });
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('media list request lifecycle', () => {
  it('ignores an older response after a newer filter request completed', async () => {
    const library = mount();
    let finishOld!: (value: any) => void;
    vi.mocked(api.get).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    const old = library.load();
    vi.mocked(api.get).mockResolvedValueOnce(response('latest', 122));
    library.search.value = 'new filter'; await library.load(2);
    finishOld(response('stale')); await old;
    expect(library.items.value[0].id).toBe('latest');
    expect(library.items.value[0].publicUrl).toBe('https://api.example.com/api/v1/public/media/latest');
    expect(library.page.value).toBe(2); expect(library.pageCount.value).toBe(5);
    expect(library.loading.value).toBe(false);
  });

  it('shows errors and supports retry without stale results', async () => {
    const library = mount();
    vi.mocked(api.get).mockRejectedValueOnce({ response: { data: { message: ['服务暂时不可用', '稍后重试'] } } });
    expect(await library.load()).toBe(false);
    expect(library.error.value).toBe('服务暂时不可用；稍后重试');
    expect(library.loading.value).toBe(false);
    vi.mocked(api.get).mockResolvedValueOnce(response('retry'));
    expect(await library.load()).toBe(true); expect(library.error.value).toBe('');
    expect(library.items.value[0].id).toBe('retry');
  });

  it('returns to the previous last page when archive removes the last item', async () => {
    const library = mount();
    vi.mocked(api.get).mockResolvedValueOnce({ data: { total: 30, items: [] } }).mockResolvedValueOnce(response('last', 30));
    await library.load(2);
    expect(library.page.value).toBe(1); expect(library.items.value[0].id).toBe('last');
    expect(library.loading.value).toBe(false);
  });

  it('does not apply responses to an unmounted component', async () => {
    const library = mount(); let finish!: (value: any) => void;
    vi.mocked(api.get).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = library.load(); cleanups.pop()!(); finish(response('late')); await pending;
    expect(library.items.value).toEqual([]);
  });
});
