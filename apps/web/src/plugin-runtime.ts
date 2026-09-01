export type Snippet = { id: string; revision: number; position: 'HEAD' | 'BODY_END'; code: string; delayMs: number };
export function createPluginRuntime(options: { run: (snippet: Snippet) => void | Promise<void>; reload: () => void; isPublic: () => boolean }) {
  const waiting = new Map<string, { key: string; timer: ReturnType<typeof setTimeout> }>();
  const executed = new Map<string, string>();
  let stopped = false, reloading = false;
  const key = (s: Snippet) => `${s.id}:${s.revision}:${s.position}:${s.delayMs}:${s.code}`;
  function cancel() { for (const entry of waiting.values()) clearTimeout(entry.timer); waiting.clear(); }
  function sync(snippets: Snippet[]) {
    if (stopped || !options.isPublic()) { cancel(); return; }
    const allowed = snippets.filter(s => s && typeof s.code === 'string' && s.code.length <= 100000 && ['HEAD', 'BODY_END'].includes(s.position) && Number.isFinite(s.delayMs));
    const current = new Map(allowed.map(s => [s.id, key(s)]));
    // Removing a script tag cannot undo timers/listeners/requests already executed.
    // A fresh document is required when live plugin code is disabled or replaced.
    if (!reloading && [...executed].some(([id, old]) => current.get(id) !== old)) { reloading = true; cancel(); options.reload(); return; }
    for (const [id, entry] of waiting) if (current.get(id) !== entry.key) { clearTimeout(entry.timer); waiting.delete(id); }
    for (const snippet of allowed) {
      if (waiting.has(snippet.id) || executed.has(snippet.id)) continue;
      const entry = { key: key(snippet), timer: setTimeout(() => {
        waiting.delete(snippet.id);
        if (stopped || !options.isPublic()) return;
        executed.set(snippet.id, entry.key);
        try { Promise.resolve(options.run(snippet)).catch(() => console.warn('APPGOG 插件执行失败，请检查配置和浏览器策略')); } catch { console.warn('APPGOG 插件执行失败，请检查配置和浏览器策略'); }
      }, Math.max(3000, Math.min(60000, snippet.delayMs))) };
      waiting.set(snippet.id, entry);
    }
  }
  return { sync, cancel, stop: () => { stopped = true; cancel(); }, hasExecuted: () => executed.size > 0 };
}
export async function injectTrustedSnippet(snippet: Snippet) {
  const host = snippet.position === 'HEAD' ? document.head : document.body;
  // Detached template is inert. HTML and scripts are not inserted before the timer.
  const template = document.createElement('template');
  template.innerHTML = snippet.code;
  const scripts = Array.from(template.content.querySelectorAll('script')).map(old => {
    const marker = document.createComment('APPGOG plugin script'); old.replaceWith(marker);
    return { old, marker };
  });
  host.append(template.content);
  for (const { old, marker } of scripts) {
    const script = document.createElement('script');
    for (const attribute of Array.from(old.attributes)) script.setAttribute(attribute.name, attribute.value);
    if (!old.hasAttribute('async')) script.async = false;
    script.textContent = old.textContent;
    script.dataset.appgogPlugin = snippet.id;
    const external = script.hasAttribute('src') || script.type === 'module';
    if (external && !old.hasAttribute('async')) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { script.remove(); reject(new Error('插件资源加载超时')); }, 15000);
        script.addEventListener('load', () => { clearTimeout(timeout); resolve(); }, { once: true });
        script.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('插件资源加载失败')); }, { once: true });
        marker.replaceWith(script);
      });
    } else {
      script.addEventListener('error', () => console.warn('APPGOG 插件资源加载失败'), { once: true });
      marker.replaceWith(script);
    }
  }
}
