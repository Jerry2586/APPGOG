import { readFileSync } from 'node:fs';

const baseline = readFileSync(new URL('../docs/01-REQUIREMENTS-BASELINE.md', import.meta.url), 'utf8');
const acceptance = readFileSync(new URL('../docs/14-DEPLOYMENT-AND-ACCEPTANCE.md', import.meta.url), 'utf8');
const pattern = /^\| ((?:DEC|BND|PAGE|CMP|CMS|SHOP|AI|THEME|MKT|PLG|SITE|NFR)-\d{3}) \|/gm;
const ids = [...baseline.matchAll(pattern)].map(match => match[1]);
const rows = [...acceptance.matchAll(/^\| ((?:DEC|BND|PAGE|CMP|CMS|SHOP|AI|THEME|MKT|PLG|SITE|NFR)-\d{3}) \| (通过|条件通过) \|/gm)].map(match => ({ id: match[1], status: match[2] }));
const failures = [];
if (ids.length !== 115) failures.push(`冻结基线需求数应为 115，实际 ${ids.length}`);
for (const id of ids) {
  const matches = rows.filter(row => row.id === id);
  if (matches.length !== 1) failures.push(`${id} 在阶段十四签收表中出现 ${matches.length} 次`);
}
for (const row of rows) if (!ids.includes(row.id)) failures.push(`签收表包含未知需求 ${row.id}`);
for (const id of ['DEC-007', 'CMS-008', 'NFR-007', 'NFR-009']) {
  if (!rows.some(row => row.id === id && row.status === '条件通过')) failures.push(`${id} 必须诚实保留正式环境条件验收`);
}
for (const phrase of ['没有“第十五阶段”', '当前工作站未安装 Docker', '不得宣称“生产上线完成”', 'APPGOG 与 Xboard 继续完全隔离', 'APPGOG_RESTORE_CONFIRM=APPGOG_RESTORE']) {
  if (!acceptance.includes(phrase)) failures.push(`阶段十四文档缺少关键结论：${phrase}`);
}
if (failures.length) {
  console.error('APPGOG 逐项签收检查失败：\n' + failures.map(item => `- ${item}`).join('\n'));
  process.exit(1);
}
console.log(`APPGOG 逐项签收检查通过：${rows.length} 项冻结需求均有唯一结论，其中 ${rows.filter(row => row.status === '条件通过').length} 项保留正式环境条件验收。`);
