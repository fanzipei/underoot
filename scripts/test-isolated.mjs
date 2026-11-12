/** Run the integration suite with a disposable database, never the live service. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'latexstudio-test-'));
const reservation = net.createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const env = {
  ...process.env,
  HOST: '127.0.0.1', PORT: String(port), BASE_URL: `http://127.0.0.1:${port}`,
  LATEXSTUDIO_DATA: data, LATEXSTUDIO_DISABLE_DEMO: '0',
  LATEXSTUDIO_REQUIRE_APPROVAL: '1', LATEXSTUDIO_REGISTER_MAX: '0',
  LATEXSTUDIO_SECURE_COOKIE: '0', LATEXSTUDIO_HSTS: '0',
  LATEXSTUDIO_ADMIN_EMAIL: 'admin@latex.studio', ADMIN_EMAIL: 'admin@latex.studio',
  LATEXSTUDIO_ADMIN_PASSWORD: crypto.randomBytes(24).toString('base64url'),
};
const research = process.argv.includes('--research');
const platform = process.argv.includes('--platform');
const publishing = process.argv.includes('--publishing');
if (research || platform || publishing) env.LATEXSTUDIO_AI_ALLOW_LOCAL = '1'; // Disposable mock API only, never changes production config.
env.ADMIN_PASSWORD = env.LATEXSTUDIO_ADMIN_PASSWORD;
const log = fs.openSync(path.join(data, 'server.log'), 'w', 0o600);
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
  cwd: root, env, windowsHide: true, stdio: ['ignore', log, log],
});
server.on('error', (error) => console.error(error.message));
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('测试服务启动失败');
    try {
      const response = await fetch(`${env.BASE_URL}/api/auth/config`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) { ready = true; break; }
    } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('测试服务启动超时');
  const suite = spawn(process.execPath, [publishing ? 'scripts/publishing-test.mjs' : platform ? 'scripts/platform-test.mjs' : research ? 'scripts/research-test.mjs' : 'scripts/smoke-test.mjs'], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
  const [code] = await once(suite, 'exit');
  process.exitCode = code ?? 1;
} finally {
  if (server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    await exited;
  }
  fs.closeSync(log);
  fs.rmSync(data, { recursive: true, force: true });
}
