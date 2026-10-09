import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const envPath = path.join(root, '.env');
const envText = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
const host = /^HOST=(.*)$/m.exec(envText)?.[1]?.trim() || '127.0.0.1';
const port = Number(/^PORT=(.*)$/m.exec(envText)?.[1]?.trim() || 4000);

if (host !== '127.0.0.1') {
  throw new Error('Refusing remote setup: set HOST=127.0.0.1 in .env first.');
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Invalid PORT in .env.');
}

const windowsInstall = 'C:\\Program Files\\Tailscale\\tailscale.exe';
const tailscale = process.platform === 'win32' && existsSync(windowsInstall) ? windowsInstall : 'tailscale';
function run(args, options = {}) {
  try {
    return execFileSync(tailscale, args, { encoding: 'utf8', ...options });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('Tailscale is not installed. Install it from https://tailscale.com/download/windows, sign in, then retry.');
    }
    throw error;
  }
}

try {
  const status = JSON.parse(run(['status', '--json']));
  if (status.BackendState !== 'Running') {
    throw new Error('Tailscale is not connected. Sign in on this PC and connect it to your tailnet first.');
  }
  const dnsName = status.Self?.DNSName?.replace(/\.$/, '');
  if (!dnsName) throw new Error('Tailscale did not report a DNS name for this PC.');
  const serveOrigin = `https://${dnsName}`;
  const configuredOrigins = (process.env.FRONTEND_ORIGIN || /^FRONTEND_ORIGIN=(.*)$/m.exec(envText)?.[1] || '')
    .split(',').map((origin) => origin.trim());
  if (!configuredOrigins.includes(serveOrigin)) {
    throw new Error(`Add ${serveOrigin} to FRONTEND_ORIGIN in .env, restart the CarBooking server, then retry. Without it, the browser cannot load the app through Tailscale Serve.`);
  }

  const health = await fetch(`http://127.0.0.1:${port}/api/health`).catch(() => null);
  if (!health?.ok) throw new Error(`Start the CarBooking server on 127.0.0.1:${port} before enabling remote access.`);

  // Serve is private to the tailnet. Never use Funnel, which is publicly reachable.
  run(['serve', '--bg', String(port)], { stdio: 'inherit' });
  const serveStatus = run(['serve', 'status']);
  process.stdout.write(`${serveStatus}\n`);
  const serveConfig = JSON.parse(run(['serve', 'status', '--json']));
  const hostPort = `${dnsName}:443`;
  const proxy = serveConfig.Web?.[hostPort]?.Handlers?.['/']?.Proxy;
  if (proxy !== `http://127.0.0.1:${port}` || !serveStatus.includes(`${serveOrigin} (tailnet only)`)) {
    throw new Error('Tailscale did not confirm a private HTTPS proxy to this app. Check `tailscale serve status` before sharing the URL.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
