/**
 * aptunnel CLI integration.
 * All tunnel operations go through here — never re-implement aptunnel logic.
 */
import { execa } from 'execa';
import { TUNNEL_OUTPUT_FIELD_RE } from '../constants.js';

// ---------- Version ----------

/**
 * Get installed aptunnel version string (e.g. "1.2.3").
 * Returns null if not installed.
 */
export async function getAptunnelVersion() {
  try {
    const { stdout } = await execa('aptunnel', ['--version']);
    const match = stdout.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/** Install or update aptunnel globally via npm. */
export async function installAptunnel() {
  await execa('npm', ['install', '-g', 'aptunnel']);
}

// ---------- Auth & Init ----------

/**
 * Spawn aptunnel init — returns execa child process (stream stdout/stderr via .all).
 */
export function spawnInit() {
  return execa('aptunnel', ['init'], { all: true });
}

/**
 * Spawn aptunnel login — returns execa child process.
 */
export function spawnLogin() {
  return execa('aptunnel', ['login'], { all: true, stdin: 'inherit' });
}

// ---------- Config ----------

/**
 * Get the aptunnel config file path.
 * @returns {Promise<string>}
 */
export async function getConfigPath() {
  try {
    const { stdout } = await execa('aptunnel', ['config', '--path']);
    return stdout.trim();
  } catch {
    // fallback to default path
    const os = await import('node:os');
    const path = await import('node:path');
    return path.join(os.homedir(), '.aptunnel', 'config.yaml');
  }
}

/**
 * Get full config including sensitive fields.
 * @returns {Promise<string>} raw YAML string
 */
export async function getRawConfig() {
  const { stdout } = await execa('aptunnel', ['config', '--raw']);
  return stdout;
}

// ---------- Status ----------

/**
 * Run aptunnel status.
 * Returns raw stdout — caller is responsible for parsing.
 * aptunnel status output format is not yet confirmed; we parse the config directly
 * for env/db structure and check process list for active tunnels.
 * @returns {Promise<string>}
 */
export async function getStatusRaw() {
  const { stdout } = await execa('aptunnel', ['status']);
  return stdout;
}

/**
 * Parse aptunnel status output lines into a map of alias → isActive.
 * Format (best-effort, adjust once aptunnel source confirmed):
 *   prod-postgres  UP   :5432
 *   prod-redis     DOWN
 * @param {string} raw
 * @returns {Record<string, boolean>}
 */
export function parseStatusOutput(raw) {
  const result = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Match: "alias  UP|DOWN  ..."
    const m = trimmed.match(/^(\S+)\s+(UP|DOWN|CONN(?:ECTING)?)/i);
    if (m) {
      result[m[1]] = m[2].toUpperCase().startsWith('UP') || m[2].toUpperCase() === 'CONN';
    }
  }
  return result;
}

// ---------- Tunnel operations ----------

/**
 * Open a single tunnel by DB alias.
 * @param {string} dbAlias
 * @returns {Promise<TunnelInfo>}
 */
export async function openTunnel(dbAlias) {
  const { stdout } = await execa('aptunnel', [dbAlias]);
  return parseTunnelOutput(stdout);
}

/**
 * Close a single tunnel by DB alias.
 * @param {string} dbAlias
 */
export async function closeTunnel(dbAlias) {
  await execa('aptunnel', [dbAlias, '--close']);
}

/**
 * Open all tunnels, optionally filtered to an env alias.
 * @param {string} [envAlias]
 */
export async function openAll(envAlias) {
  const args = ['all'];
  if (envAlias) args.push(`--env=${envAlias}`);
  await execa('aptunnel', args);
}

/**
 * Close all tunnels, optionally filtered to an env alias.
 * @param {string} [envAlias]
 */
export async function closeAll(envAlias) {
  const args = ['all', '--close'];
  if (envAlias) args.push(`--env=${envAlias}`);
  await execa('aptunnel', args);
}

// ---------- Output parsing ----------

/**
 * Parse aptunnel tunnel open stdout into a TunnelInfo object.
 *
 * Expected format:
 *   ✔ dev-db tunnel opened
 *     Port:      55554
 *     Host:      localhost.aptible.in
 *     User:      aptible
 *     Password:  xxxxxxxxxx
 *     URL:       postgresql://aptible:...
 *     PID:       12345
 *
 * @param {string} stdout
 * @returns {TunnelInfo}
 *
 * @typedef {Object} TunnelInfo
 * @property {number|null} port
 * @property {string|null} host
 * @property {string|null} user
 * @property {string|null} password
 * @property {string|null} url
 * @property {number|null} pid
 */
export function parseTunnelOutput(stdout) {
  const info = { port: null, host: null, user: null, password: null, url: null, pid: null };
  for (const line of stdout.split('\n')) {
    const m = line.match(TUNNEL_OUTPUT_FIELD_RE);
    if (!m) continue;
    const [, key, value] = m;
    switch (key) {
      case 'Port':     info.port = parseInt(value, 10); break;
      case 'Host':     info.host = value.trim(); break;
      case 'User':     info.user = value.trim(); break;
      case 'Password': info.password = value.trim(); break;
      case 'URL':      info.url = value.trim(); break;
      case 'PID':      info.pid = parseInt(value, 10); break;
    }
  }
  return info;
}

// ---------- Port availability check ----------

/**
 * Check if a TCP port is available on localhost.
 * @param {number} port
 * @returns {Promise<boolean>} true if available
 */
export async function isPortAvailable(port) {
  const net = await import('node:net');
  return new Promise((resolve) => {
    const server = net.default.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => { server.close(); resolve(true); });
    server.listen(port, '127.0.0.1');
  });
}
