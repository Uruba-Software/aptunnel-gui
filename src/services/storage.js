/**
 * Storage service — reads/writes ~/.aptunnel-gui/ files.
 * All writes are atomic: write to temp file, then rename.
 */
import { readFile, writeFile, mkdir, rename, unlink, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import os from 'node:os';
import {
  APP_DIR, SETTINGS_FILE, CACHE_DIR, LOGS_DIR, DEFAULT_SETTINGS,
  APTUNNEL_DIR, APTUNNEL_CONFIG_FILE,
} from '../constants.js';

// ---------- Path helpers ----------

export const appDir  = () => join(os.homedir(), APP_DIR);
export const settingsPath = () => join(appDir(), SETTINGS_FILE);
export const cachePath    = (env, db) => join(appDir(), CACHE_DIR, env, `${db}.json`);
export const logsDir      = () => join(appDir(), LOGS_DIR);
export const todayLogPath = () => join(logsDir(), `${new Date().toISOString().slice(0, 10)}.log`);
export const aptunnelDir  = () => join(os.homedir(), APTUNNEL_DIR);
export const aptunnelConfigPath = () => join(aptunnelDir(), APTUNNEL_CONFIG_FILE);

async function ensureDir(p) { await mkdir(p, { recursive: true }); }

async function atomicWrite(filePath, content) {
  const tmp = `${filePath}.tmp`;
  await ensureDir(dirname(filePath));
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, filePath);
}

// ---------- Settings ----------

export async function loadSettings() {
  try {
    const raw = await readFile(settingsPath(), 'utf8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings) {
  await atomicWrite(settingsPath(), JSON.stringify(settings, null, 2));
}

// ---------- Cache ----------

export async function loadCache(envAlias, dbAlias) {
  try {
    const raw = await readFile(cachePath(envAlias, dbAlias), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveCache(envAlias, dbAlias, data) {
  const payload = { ...data, savedAt: new Date().toISOString() };
  await atomicWrite(cachePath(envAlias, dbAlias), JSON.stringify(payload, null, 2));
}

export async function clearAllCache() {
  const dir = join(appDir(), CACHE_DIR);
  if (!existsSync(dir)) return;
  // Remove recursively by re-creating the dir
  const { rm } = await import('node:fs/promises');
  await rm(dir, { recursive: true, force: true });
}

// ---------- Logs ----------

export async function appendLog(entry) {
  const line = JSON.stringify(entry) + '\n';
  const logPath = todayLogPath();
  await ensureDir(logsDir());
  await writeFile(logPath, line, { flag: 'a', encoding: 'utf8' });
}

export async function readLogFile(date) {
  const logPath = join(logsDir(), `${date}.log`);
  try {
    const raw = await readFile(logPath, 'utf8');
    return raw.split('\n').filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

/** List all available log dates (YYYY-MM-DD strings), newest first. */
export async function listLogDates() {
  const dir = logsDir();
  if (!existsSync(dir)) return [];
  const files = await readdir(dir).catch(() => []);
  return files
    .filter(f => f.endsWith('.log'))
    .map(f => f.replace('.log', ''))
    .sort()
    .reverse();
}

export async function clearLogs() {
  const dir = logsDir();
  if (!existsSync(dir)) return;
  const files = await readdir(dir).catch(() => []);
  for (const f of files) {
    if (f.endsWith('.log')) await unlink(join(dir, f)).catch(() => {});
  }
}

export async function pruneOldLogs(retentionDays) {
  const dir = logsDir();
  if (!existsSync(dir)) return;
  const files = await readdir(dir).catch(() => []);
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const file of files) {
    const ts = new Date(file.replace('.log', '')).getTime();
    if (!isNaN(ts) && ts < cutoff) await unlink(join(dir, file)).catch(() => {});
  }
}

/** Export log entries for a given date to a file. */
export async function exportLogs(date, destPath) {
  const logPath = join(logsDir(), `${date}.log`);
  const raw = await readFile(logPath, 'utf8').catch(() => '');
  await writeFile(destPath, raw, 'utf8');
}

// ---------- aptunnel config ----------

/**
 * Check if aptunnel config.yaml exists and is non-empty.
 */
export async function aptunnelConfigExists() {
  try {
    const raw = await readFile(aptunnelConfigPath(), 'utf8');
    return raw.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Read and parse aptunnel config YAML.
 * @returns {Promise<object|null>}
 */
export async function loadAptunnelConfig() {
  try {
    const raw = await readFile(aptunnelConfigPath(), 'utf8');
    const { parse } = await import('yaml');
    return parse(raw);
  } catch {
    return null;
  }
}

/**
 * Build the env/DB list from aptunnel config YAML.
 * Returns array of { envKey, envAlias, dbs: [{ dbKey, dbAlias, port, type }] }
 */
export function parseEnvsFromConfig(config) {
  if (!config?.environments) return [];
  return Object.entries(config.environments).map(([envKey, env]) => ({
    envKey,
    envAlias: env.alias ?? envKey,
    dbs: Object.entries(env.databases ?? {}).map(([dbKey, db]) => ({
      dbKey,
      dbAlias: db.alias ?? dbKey,
      port: db.port,
      type: db.type ?? 'postgresql',
    })),
  }));
}
