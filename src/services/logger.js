/**
 * Logger — writes to in-memory app state and to disk.
 * Call setLogDispatch(dispatch) once at app startup.
 */
import { appendLog } from './storage.js';
import { LogLevel } from '../constants.js';

let _dispatch = null;

export function setLogDispatch(dispatch) {
  _dispatch = dispatch;
}

async function log(level, message, { env, db } = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    env: env ?? null,
    db: db ?? null,
    message,
  };
  appendLog(entry).catch(() => {}); // non-blocking disk write
  _dispatch?.({ type: 'APPEND_LOG', entry });
}

export const logger = {
  info:  (msg, ctx) => log(LogLevel.INFO,  msg, ctx),
  warn:  (msg, ctx) => log(LogLevel.WARN,  msg, ctx),
  error: (msg, ctx) => log(LogLevel.ERROR, msg, ctx),
};
