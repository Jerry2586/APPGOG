import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const compose = read('docker-compose.yml');
const apiImage = read('Dockerfile.api');
const webImage = read('Dockerfile.web');
const nginx = read('deploy/nginx.conf');
const dockerEnv = read('.env.docker.example');
const backup = read('deploy/backup.sh');
const restore = read('deploy/restore.sh');
const drill = read('deploy/backup-restore-drill.sh');
const failures = [];
const required = (text, pattern, message) => { if (!pattern.test(text)) failures.push(message); };
const forbidden = (text, pattern, message) => { if (pattern.test(text)) failures.push(message); };
const service = name => compose.match(new RegExp(`^  ${name}:\\r?\\n[\\s\\S]*?(?=^  [a-z][a-z0-9_-]*:\\r?\\n|^volumes:)`, 'm'))?.[0] ?? '';

for (const name of ['init', 'api', 'web', 'postgres', 'redis']) {
  if (!service(name)) failures.push(`Compose 缺少 ${name} 服务`);
}
required(service('init'), /prisma migrate deploy[\s\S]*dist\/prisma\/seed\.js/, '部署初始化未按迁移后种子的固定顺序执行');
for (const [pattern, message] of [[/3000:3000/, 'API 未固定公开 3000 端口'], [/health\/ready/, 'API 容器未使用数据库就绪检查'], [/service_completed_successfully/, 'API 未等待迁移与种子初始化完成']]) required(service('api'), pattern, message);
required(compose, /DATABASE_URL:\s*"postgresql:\/\/appgog:\$\{APPGOG_DB_PASSWORD:[^}]+\}@postgres:5432\/appgog"/, '容器数据库地址未固定到独立 postgres 服务或未强制密码');
required(compose, /JWT_SECRET:\s*"\$\{JWT_SECRET:\?/, 'Compose 未拒绝缺失的 JWT_SECRET');
required(compose, /appgog_private:[\s\S]*internal:\s*true/, '数据库网络不是内部私有网络');
forbidden(service('postgres'), /^    ports:/m, 'PostgreSQL 不得暴露宿主机端口');
forbidden(service('redis'), /^    ports:/m, 'Redis 不得暴露宿主机端口');
forbidden(compose, /\b(?:xboard|x-board)\b/i, 'APPGOG Compose 不得连接或编排 Xboard');
forbidden(compose, /POSTGRES_PASSWORD:\s*appgog\b/, 'Compose 仍使用弱默认数据库密码');
required(apiImage, /USER node[\s\S]*CMD \["node","apps\/api\/dist\/src\/main\.js"\]/, 'API 运行镜像未使用非 root 用户或启动入口错误');
required(webImage, /nginx:1\.27-alpine[\s\S]*deploy\/nginx\.conf/, 'Web 运行镜像或反向代理配置未固定');
for (const header of ['X-Content-Type-Options', 'Content-Security-Policy', 'Permissions-Policy', 'X-Frame-Options']) required(nginx, new RegExp(header), `Nginx 缺少 ${header} 安全头`);
required(nginx, /location \/assets\/[\s\S]*immutable/, '哈希静态资源未设置长期不可变缓存');
required(nginx, /X-Request-ID \$request_id/, '反向代理未生成请求关联 ID');
for (const key of ['APPGOG_DB_PASSWORD=', 'JWT_SECRET=', 'ADMIN_INITIAL_PASSWORD=']) required(dockerEnv, new RegExp(`^${key}$`, 'm'), `Docker 环境模板缺少空白敏感项 ${key}`);
forbidden(dockerEnv, /(?:JWT_SECRET|APPGOG_DB_PASSWORD|ADMIN_INITIAL_PASSWORD)=.+/m, 'Docker 环境模板不得包含示例或真实密钥');
required(backup, /pg_dump[\s\S]*--format=custom[\s\S]*sha256sum/, '备份脚本缺少自定义格式导出或校验和');
required(restore, /APPGOG_RESTORE_CONFIRM[\s\S]*pre-restore-[\s\S]*pg_restore[\s\S]*--clean --if-exists[\s\S]*health\/ready/, '恢复脚本缺少显式确认、恢复前快照、清理恢复或就绪复核');
for (const pattern of [/appgog_restore_drill/, /createdb/, /pg_restore/, /dropdb/]) required(drill, pattern, '非破坏性恢复演练未使用完整的独立临时数据库流程');

if (failures.length) {
  console.error('APPGOG 部署与恢复检查失败：\n' + failures.map(item => `- ${item}`).join('\n'));
  process.exit(1);
}
console.log('APPGOG 部署检查通过：容器内地址、迁移初始化、私有网络、非 root、就绪探针、安全代理和备份恢复入口完整。');
