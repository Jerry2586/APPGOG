import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync, renameSync, rmSync, accessSync, constants, statfsSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { totalmem } from 'node:os';

const installerDirectory = dirname(fileURLToPath(import.meta.url));
export const projectDirectory = resolve(installerDirectory, '..', '..');
const statePath = join(projectDirectory, '.appgog-install-state.json');
const environmentPath = join(projectDirectory, '.env');
const panels = new Set(['bt', '1panel', 'aapanel', 'docker', 'ssh']);
const staticTypes = new Map([['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.svg', 'image/svg+xml']]);
const staticFiles = new Set(['index.html', 'style.css', 'app.js']);

const clean = value => typeof value === 'string' ? value.trim() : '';
const oneLine = (value, max, field) => {
  const result = clean(value);
  if (!result || result.length > max || /[\r\n\0]/.test(result)) throw new Error(`${field} 无效`);
  return result;
};
const optionalLine = (value, max, field) => {
  const result = clean(value);
  if (result.length > max || /[\r\n\0]/.test(result)) throw new Error(`${field} 无效`);
  return result;
};

export function safeOrigin(value) {
  const source = oneLine(value, 300, '站点地址');
  const url = new URL(source);
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if ((!local && url.protocol !== 'https:') || (local && !['http:', 'https:'].includes(url.protocol)) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error('正式站点必须使用不含路径、凭据、查询参数或片段的 HTTPS Origin');
  return url.origin;
}

export function safeOutboundUrl(value, label) {
  const source = optionalLine(value, 2000, label);
  if (!source) return '';
  const url = new URL(source);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || /(?:^|\/)(?:api|oauth|sso|callback)(?:\/|$)/i.test(url.pathname)) throw new Error(`${label} 必须是无凭据、无参数、无 API/SSO 路径的普通 HTTP/HTTPS 页面 URL`);
  return url.toString();
}

function strongPassword(value, email) {
  const password = oneLine(value, 200, '管理员密码');
  const classes = [/[a-z]/.test(password), /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length;
  if (password.length < 16 || classes < 3 || password.toLowerCase().includes(email.split('@')[0].toLowerCase())) throw new Error('管理员密码至少 16 位、包含至少三类字符，且不能包含邮箱账号');
  return password;
}

export function validateInstallConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('安装配置格式错误');
  const panel = clean(input.panel).toLowerCase();
  if (!panels.has(panel)) throw new Error('不支持的面板类型');
  const origin = safeOrigin(input.origin);
  const email = oneLine(input.adminEmail, 254, '管理员邮箱').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('管理员邮箱格式错误');
  const webPort = Number(input.webPort ?? 8080);
  if (!Number.isInteger(webPort) || webPort < 1024 || webPort > 65535 || webPort === 3000 || webPort === 5432 || webPort === 6379) throw new Error('Web 端口必须为 1024–65535 且不能占用 3000/5432/6379');
  const externalAi = input.externalAi === true;
  const aiKey = optionalLine(input.aiKey, 500, 'AI Key');
  if (externalAi && aiKey.length < 20) throw new Error('启用外部 AI 时必须填写服务端 AI Key');
  const aiBaseUrl = externalAi ? safeOutboundUrl(input.aiBaseUrl || 'https://api.openai.com/v1', 'AI 服务地址') : 'https://api.openai.com/v1';
  if (externalAi && new URL(aiBaseUrl).protocol !== 'https:') throw new Error('AI 服务地址必须使用 HTTPS');
  return {
    panel,
    origin,
    webPort,
    adminEmail: email,
    adminDisplayName: oneLine(input.adminDisplayName || 'APPGOG 管理员', 100, '管理员名称'),
    adminPassword: strongPassword(input.adminPassword, email),
    xboard: {
      login: safeOutboundUrl(input.xboard?.login, 'Xboard 登录地址'),
      register: safeOutboundUrl(input.xboard?.register, 'Xboard 注册地址'),
      purchase: safeOutboundUrl(input.xboard?.purchase, 'Xboard 购买地址'),
      dashboard: safeOutboundUrl(input.xboard?.dashboard, 'Xboard 面板地址'),
      ticket: safeOutboundUrl(input.xboard?.ticket, 'Xboard 工单地址'),
      affiliate: safeOutboundUrl(input.xboard?.affiliate, 'Xboard 联盟地址')
    },
    externalAi,
    aiBaseUrl,
    aiKey
  };
}

const quoted = value => JSON.stringify(String(value));
export function renderEnvironment(config, secrets = {}) {
  const databasePassword = secrets.databasePassword || randomBytes(30).toString('base64url');
  const jwtSecret = secrets.jwtSecret || randomBytes(48).toString('base64url');
  return [
    '# 由 APPGOG 一次性安装向导生成；禁止提交到版本库。',
    'APPGOG_INSTALL_MANAGED=true',
    `APPGOG_PANEL=${config.panel}`,
    `APPGOG_WEB_PORT=${config.webPort}`,
    `APPGOG_DB_PASSWORD=${databasePassword}`,
    `JWT_SECRET=${jwtSecret}`,
    'ADMIN_REFRESH_TTL_DAYS=7',
    `APP_ORIGIN=${config.origin}`,
    `ADMIN_ORIGIN=${config.origin}`,
    `ADMIN_EMAIL=${config.adminEmail}`,
    `ADMIN_DISPLAY_NAME=${quoted(config.adminDisplayName)}`,
    `ADMIN_INITIAL_PASSWORD=${quoted(config.adminPassword)}`,
    `XBOARD_LOGIN_URL=${config.xboard.login}`,
    `XBOARD_REGISTER_URL=${config.xboard.register}`,
    `XBOARD_PURCHASE_URL=${config.xboard.purchase}`,
    `XBOARD_DASHBOARD_URL=${config.xboard.dashboard}`,
    `XBOARD_TICKET_URL=${config.xboard.ticket}`,
    `XBOARD_AFFILIATE_URL=${config.xboard.affiliate}`,
    `OPENAI_BASE_URL=${config.aiBaseUrl}`,
    `OPENAI_API_KEY=${quoted(config.aiKey)}`,
    'OPENAI_CHAT_MODEL=gpt-4.1-mini',
    'OPENAI_EMBEDDING_MODEL=text-embedding-3-small',
    `AI_EXTERNAL_ENABLED=${config.externalAi}`,
    'AI_DAILY_MODEL_CALL_LIMIT=200',
    'AI_WORKER_ENABLED=true',
    'AI_TRUSTED_PROXY_IPS=',
    ''
  ].join('\n');
}

function readState() {
  try { return JSON.parse(readFileSync(statePath, 'utf8')); } catch { return null; }
}

function writeState(value) {
  const temporary = `${statePath}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  if (existsSync(statePath)) rmSync(statePath, { force: true });
  renameSync(temporary, statePath);
}

function commandResult(command, args, timeout = 15_000) {
  const result = spawnSync(command, args, { cwd: projectDirectory, encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024, shell: false });
  return { ok: !result.error && result.status === 0, status: result.status, output: `${result.stdout || ''}\n${result.stderr || ''}`.trim().slice(-32_000), error: result.error?.message || '' };
}

export function preflight(dryRun = false) {
  let writable = true;
  try { accessSync(projectDirectory, constants.W_OK); } catch { writable = false; }
  const docker = dryRun ? { ok: true, output: 'Docker 26.1（演示）' } : commandResult('docker', ['--version']);
  const compose = dryRun ? { ok: true, output: 'Docker Compose v2.27（演示）' } : commandResult('docker', ['compose', 'version']);
  let diskGiB = 0;
  try { const disk = statfsSync(projectDirectory); diskGiB = Math.floor(Number(disk.bavail) * Number(disk.bsize) / 1024 ** 3); } catch {}
  const checks = [
    { id: 'project', label: 'APPGOG 项目结构', ok: ['package.json', 'docker-compose.yml', 'Dockerfile.api', 'Dockerfile.web'].every(file => existsSync(join(projectDirectory, file))), detail: projectDirectory },
    { id: 'write', label: '目录写入权限', ok: writable, detail: writable ? '可安全创建 .env 和安装状态' : '当前用户无法写入项目目录' },
    { id: 'node', label: 'Node.js 运行时', ok: Number(process.versions.node.split('.')[0]) >= 22, detail: `Node ${process.versions.node}` },
    { id: 'docker', label: 'Docker Engine', ok: docker.ok, detail: docker.ok ? docker.output : '未找到 Docker；请先在面板应用商店安装' },
    { id: 'compose', label: 'Docker Compose v2', ok: compose.ok, detail: compose.ok ? compose.output : '需要 docker compose v2' },
    { id: 'memory', label: '服务器内存', ok: dryRun || totalmem() >= 2 * 1024 ** 3, detail: `${(totalmem() / 1024 ** 3).toFixed(1)} GiB（建议至少 2 GiB）` },
    { id: 'disk', label: '可用磁盘', ok: dryRun || diskGiB >= 8, detail: `${diskGiB} GiB（建议至少 8 GiB）` }
  ];
  return { ok: checks.every(check => check.ok), checks, dryRun };
}

function parseArguments(argv) {
  const result = { host: '127.0.0.1', port: 3099, token: process.env.APPGOG_INSTALL_TOKEN || '', dryRun: false, allowRemote: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--host') result.host = argv[++i] || '';
    else if (argv[i] === '--port') result.port = Number(argv[++i]);
    else if (argv[i] === '--token') result.token = argv[++i] || '';
    else if (argv[i] === '--dry-run') result.dryRun = true;
    else if (argv[i] === '--allow-remote') result.allowRemote = true;
    else throw new Error(`未知参数：${argv[i]}`);
  }
  if (!['127.0.0.1', '::1', '0.0.0.0'].includes(result.host) || !Number.isInteger(result.port) || result.port < 1024 || result.port > 65535) throw new Error('监听地址或端口无效');
  if (result.host === '0.0.0.0' && !result.allowRemote) throw new Error('远程监听必须显式添加 --allow-remote');
  if (result.token && result.token.length < 20) throw new Error('安装 Token 至少 20 位');
  return result;
}

function fixedTimeToken(expected, received) {
  const a = Buffer.from(expected), b = Buffer.from(received || '');
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error('请求内容超过 64 KiB');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function sameSite(request) {
  if (request.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = request.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === request.headers.host; } catch { return false; }
}

function sanitizeLog(value, secrets) {
  let result = value;
  for (const secret of secrets.filter(item => item.length >= 8)) result = result.split(secret).join('[REDACTED]');
  return result.replace(/((?:password|secret|token|api[_-]?key))\s*[=:]\s*\S+/gi, '$1=[REDACTED]');
}

function environmentSecrets() {
  if (!existsSync(environmentPath)) return [];
  return readFileSync(environmentPath, 'utf8').split(/\r?\n/).filter(line => /(?:PASSWORD|SECRET|API_KEY)=/.test(line)).map(line => line.slice(line.indexOf('=') + 1).replace(/^['"]|['"]$/g, ''));
}

function deploy(dryRun) {
  const steps = [
    ['验证 Compose', ['compose', 'config', '--quiet'], 30_000],
    ['构建镜像', ['compose', 'build', '--pull'], 30 * 60_000],
    ['启动服务', ['compose', 'up', '-d'], 10 * 60_000],
    ['检查 API', ['compose', 'exec', '-T', 'api', 'wget', '--no-verbose', '--tries=10', '--spider', 'http://localhost:3000/api/v1/health/ready'], 120_000],
    ['读取状态', ['compose', 'ps'], 30_000]
  ];
  if (dryRun) return steps.map(([name]) => ({ name, ok: true, output: '演示模式：固定命令验证通过，未写入服务器或启动容器。' }));
  const secrets = environmentSecrets();
  const results = [];
  for (const [name, args, timeout] of steps) {
    const result = commandResult('docker', args, timeout);
    results.push({ name, ok: result.ok, output: sanitizeLog(result.output || result.error, secrets) });
    if (!result.ok) throw Object.assign(new Error(`${name}失败`), { results });
  }
  return results;
}

export function createInstaller(options) {
  const token = options.token || randomBytes(24).toString('base64url');
  let busy = false;
  let dryConfigured = false;
  let dryCompleted = false;
  const server = createServer(async (request, response) => {
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('x-frame-options', 'DENY');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('content-security-policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname.startsWith('/install/api/')) {
        if (!sameSite(request)) return json(response, 403, { error: '拒绝跨站安装请求' });
        const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, '') || request.headers['x-appgog-install-token'];
        if (!fixedTimeToken(token, Array.isArray(supplied) ? supplied[0] : supplied)) return json(response, 401, { error: '安装 Token 无效' });
        const saved = readState();
        const installed = options.dryRun ? dryCompleted : saved?.status === 'completed';
        const configured = options.dryRun ? dryConfigured : saved?.status === 'configured' && existsSync(environmentPath);
        if (url.pathname === '/install/api/session' && request.method === 'GET') return json(response, 200, { installed, configured, state: saved ? { status: saved.status, panel: saved.panel, origin: saved.origin, webPort: saved.webPort, updatedAt: saved.updatedAt } : null, preflight: preflight(options.dryRun), supportedPanels: [...panels] });
        if (installed) return json(response, 409, { error: 'APPGOG 已完成安装，向导已锁定' });
        if (url.pathname === '/install/api/configure' && request.method === 'POST') {
          if (busy) return json(response, 409, { error: '安装任务正在执行' });
          if (!preflight(options.dryRun).ok) return json(response, 412, { error: '服务器预检未通过' });
          const config = validateInstallConfig(await body(request));
          if (!options.dryRun) {
            if (existsSync(environmentPath) || existsSync(statePath)) return json(response, 409, { error: '检测到已有 .env 或安装状态，拒绝覆盖' });
            const temporary = `${environmentPath}.${process.pid}.tmp`;
            try { writeFileSync(temporary, renderEnvironment(config), { encoding: 'utf8', mode: 0o600, flag: 'wx' }); renameSync(temporary, environmentPath); }
            catch (error) { rmSync(temporary, { force: true }); throw error; }
            writeState({ status: 'configured', panel: config.panel, origin: config.origin, webPort: config.webPort, updatedAt: new Date().toISOString() });
          } else dryConfigured = true;
          return json(response, 200, { configured: true, summary: { panel: config.panel, origin: config.origin, webPort: config.webPort, adminEmail: config.adminEmail, externalAi: config.externalAi, outboundLinks: Object.values(config.xboard).filter(Boolean).length } });
        }
        if (url.pathname === '/install/api/deploy' && request.method === 'POST') {
          if (!configured) return json(response, 409, { error: '请先验证并保存配置' });
          if (busy) return json(response, 409, { error: '安装任务正在执行' });
          busy = true;
          try {
            const results = deploy(options.dryRun);
            const current = options.dryRun ? { panel: 'docker', origin: 'https://example.com', webPort: 8080 } : readState();
            if (options.dryRun) dryCompleted = true;
            else writeState({ ...current, status: 'completed', updatedAt: new Date().toISOString(), version: '1.0.0' });
            return json(response, 200, { installed: true, results });
          } catch (error) {
            return json(response, 500, { error: error.message || '安装失败', results: error.results || [] });
          } finally { busy = false; }
        }
        return json(response, 404, { error: '安装接口不存在' });
      }
      const path = url.pathname === '/install' || url.pathname === '/install/' ? 'index.html' : url.pathname.replace(/^\/install\//, '');
      if (!staticFiles.has(path)) { response.writeHead(404); return response.end('Not found'); }
      const file = join(installerDirectory, path);
      if (!existsSync(file) || !staticTypes.has(extname(file))) { response.writeHead(404); return response.end('Not found'); }
      response.writeHead(200, { 'content-type': staticTypes.get(extname(file)), 'cache-control': 'no-store' });
      response.end(readFileSync(file));
    } catch (error) { json(response, 400, { error: error instanceof Error ? error.message : '请求失败' }); }
  });
  return { server, token };
}

export function startInstaller(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const { server, token } = createInstaller(options);
  server.listen(options.port, options.host, () => {
    console.log(`APPGOG 安装向导：http://${options.host === '0.0.0.0' ? '服务器IP' : options.host}:${options.port}/install/`);
    console.log(`一次性安装 Token：${token}`);
    console.log(options.dryRun ? '当前为演示模式，不写入 .env、不运行 Docker。' : '安装完成后按 Ctrl+C 关闭向导；完成锁会阻止再次安装。');
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startInstaller();
