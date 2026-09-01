import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const root = new URL('../apps/web/dist/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('.vite/manifest.json', root), 'utf8'));
const entry = Object.values(manifest).find(item => item.isEntry);
if (!entry) throw new Error('Vite manifest 缺少公开入口');

const critical = new Set([entry.file, ...(entry.css ?? [])]);
const visit = key => {
  const item = manifest[key];
  if (!item) throw new Error(`Vite manifest 缺少静态依赖 ${key}`);
  critical.add(item.file);
  for (const css of item.css ?? []) critical.add(css);
  for (const child of item.imports ?? []) visit(child);
};
for (const key of entry.imports ?? []) visit(key);

let raw = 0;
let gzip = 0;
for (const file of critical) {
  const url = new URL(file, root);
  const bytes = readFileSync(url);
  raw += statSync(url).size;
  gzip += gzipSync(bytes).length;
}
const failures = [];
if (raw > 400 * 1024) failures.push(`公开首屏静态依赖 ${Math.ceil(raw / 1024)} KiB，超过 400 KiB`);
if (gzip > 180 * 1024) failures.push(`公开首屏 gzip ${Math.ceil(gzip / 1024)} KiB，超过 180 KiB`);
const main = readFileSync(new URL('../apps/web/src/main.ts', import.meta.url), 'utf8');
const video = readFileSync(new URL('../apps/web/src/components/VideoPlayer.vue', import.meta.url), 'utf8');
const effect = readFileSync(new URL('../apps/web/src/components/blocks/EffectBlock.vue', import.meta.url), 'utf8');
if (/^import ElementPlus/m.test(main) || !/location\.pathname\.startsWith\('\/admin'\)[\s\S]*import\('element-plus'\)/.test(main)) failures.push('Element Plus 未与公开页面首屏隔离');
if (!/import\('hls\.js'\)/.test(video)) failures.push('HLS 播放库不是按需加载');
if (!/prefers-reduced-motion[\s\S]*hardwareConcurrency/.test(effect)) failures.push('视觉效果缺少减少动画或低性能降级');
if (!(entry.dynamicImports ?? []).some(key => key.includes('_index-'))) failures.push('管理组件库未出现在异步入口');

if (failures.length) {
  console.error('APPGOG 性能预算失败：\n' + failures.map(item => `- ${item}`).join('\n'));
  process.exit(1);
}
console.log(`APPGOG 性能预算通过：公开首屏 ${Math.ceil(raw / 1024)} KiB 原始 / ${Math.ceil(gzip / 1024)} KiB gzip；后台组件库与 HLS 均按需加载。`);
