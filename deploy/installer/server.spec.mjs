import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstaller, renderEnvironment, safeOrigin, safeOutboundUrl, validateInstallConfig } from './server.mjs';

const valid = (panel = 'bt') => ({
  panel,
  origin: 'https://www.example.com',
  webPort: 8080,
  adminEmail: 'admin@example.com',
  adminDisplayName: 'APPGOG 管理员',
  adminPassword: 'Correct-Horse-2026!',
  xboard: { login: 'https://panel.example.com/login', register: '', purchase: 'https://panel.example.com/buy', dashboard: '', ticket: '', affiliate: '' },
  externalAi: false,
  aiBaseUrl: '',
  aiKey: ''
});

test('accepts every supported panel through one isolated Docker contract', () => {
  for (const panel of ['bt', '1panel', 'aapanel', 'docker', 'ssh']) assert.equal(validateInstallConfig(valid(panel)).panel, panel);
});

test('requires HTTPS origins outside loopback and plain outbound page URLs', () => {
  assert.equal(safeOrigin('http://127.0.0.1:8080'), 'http://127.0.0.1:8080');
  assert.throws(() => safeOrigin('http://example.com'));
  for (const url of ['https://panel.example.com/api/user', 'https://panel.example.com/sso', 'https://panel.example.com/callback', 'https://panel.example.com/login?token=secret']) assert.throws(() => safeOutboundUrl(url, 'Xboard'));
  assert.throws(() => validateInstallConfig({ ...valid(), externalAi: true, aiBaseUrl: 'http://models.example.com/v1', aiKey: 'provider-key-1234567890' }));
});

test('generates server-only secrets without any Xboard token or database bridge', () => {
  const config = validateInstallConfig(valid());
  const env = renderEnvironment(config, { databasePassword: 'Db-Secret-1234567890', jwtSecret: 'Jwt-Secret-123456789012345678901234567890' });
  assert.match(env, /APPGOG_DB_PASSWORD=Db-Secret/);
  assert.match(env, /JWT_SECRET=Jwt-Secret/);
  assert.match(env, /XBOARD_LOGIN_URL=https:\/\/panel\.example\.com\/login/);
  assert.doesNotMatch(env, /XBOARD_(?:TOKEN|API|DB|DATABASE|SESSION|SECRET)/);
  assert.doesNotMatch(env, /DATABASE_URL=.*xboard/i);
});

test('protects the full dry-run workflow with the installation token and completion lock', async t => {
  const token = 'installer-token-123456789012345';
  const { server } = createInstaller({ token, dryRun: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const call = (path, init = {}, supplied = token) => fetch(`${origin}/install/api/${path}`, { ...init, headers: { authorization: `Bearer ${supplied}`, 'content-type': 'application/json', ...init.headers } });
  assert.equal((await call('session', {}, 'wrong-token-that-is-long-enough')).status, 401);
  const session = await (await call('session')).json();
  assert.equal(session.preflight.ok, true);
  assert.equal((await fetch(`${origin}/install/server.mjs`)).status, 404);
  assert.equal((await call('configure', { method: 'POST', body: JSON.stringify(valid('1panel')) })).status, 200);
  const deployed = await (await call('deploy', { method: 'POST', body: '{}' })).json();
  assert.equal(deployed.installed, true);
  assert.equal(deployed.results.length, 5);
  assert.equal((await call('configure', { method: 'POST', body: JSON.stringify(valid()) })).status, 409);
});
