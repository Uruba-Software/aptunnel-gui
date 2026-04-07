#!/usr/bin/env node

// src/index.js
import React13 from "react";
import { render } from "ink";

// src/App.js
import React12, { useReducer, useEffect as useEffect9, useRef as useRef6 } from "react";
import { useApp, useInput as useInput8 } from "ink";

// src/constants.js
var MIN_APTUNNEL_VERSION = "1.1.0";
var APP_VERSION = "0.1.0";
var DEFAULT_POLL_INTERVAL = 5;
var APP_DIR = ".aptunnel-gui";
var SETTINGS_FILE = "settings.json";
var CACHE_DIR = "cache";
var LOGS_DIR = "logs";
var APTUNNEL_DIR = ".aptunnel";
var APTUNNEL_CONFIG_FILE = "config.yaml";
var DEFAULT_NAME_MAX_LENGTH = 18;
var Status = Object.freeze({
  IDLE: "idle",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  DISCONNECTING: "disconnecting",
  FAILED: "failed",
  LOADING: "loading",
  LOADED: "loaded",
  ERROR: "error"
});
var Screen = Object.freeze({
  INIT_WIZARD: "InitWizard",
  DASHBOARD: "Dashboard",
  DB_DETAIL: "DbDetail",
  CONFIG_EDITOR: "ConfigEditor",
  SETTINGS: "Settings",
  LOGS: "Logs"
});
var AutoOpenTunnel = Object.freeze({
  ASK: "ask",
  ALWAYS: "always",
  NEVER: "never"
});
var DEFAULT_SETTINGS = {
  pollingInterval: DEFAULT_POLL_INTERVAL,
  autoOpenTunnel: AutoOpenTunnel.ASK,
  backgroundPreload: true,
  logRetention: 30,
  theme: "dark",
  nameMaxLength: DEFAULT_NAME_MAX_LENGTH,
  // hidden items — stored here to persist across sessions
  hiddenEnvs: [],
  // array of env alias strings
  hiddenDbs: []
  // array of "envAlias/dbAlias" strings
};
var LogLevel = Object.freeze({
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR"
});
var DbType = Object.freeze({
  POSTGRES: "postgresql",
  MYSQL: "mysql",
  REDIS: "redis",
  ELASTICSEARCH: "elasticsearch"
});
var DB_DRIVER_PACKAGES = {
  [DbType.POSTGRES]: "pg",
  [DbType.MYSQL]: "mysql2",
  [DbType.REDIS]: "ioredis",
  [DbType.ELASTICSEARCH]: "@elastic/elasticsearch"
};
var TUNNEL_OUTPUT_FIELD_RE = /^\s+(Port|Host|User|Password|URL|PID):\s+(.+)$/;

// src/state/appReducer.js
var initialState = {
  // Screen stack — each entry: { name: Screen.X, params: {} }
  screenStack: [{ name: Screen.DASHBOARD, params: {} }],
  shouldExit: false,
  // Loaded from ~/.aptunnel-gui/settings.json on startup
  settings: DEFAULT_SETTINGS,
  // Envs parsed from aptunnel config YAML
  // [{ envKey, envAlias, dbs: [{ dbKey, dbAlias, port, type }] }]
  envs: [],
  // Per-DB operational state — keyed by "envAlias/dbAlias"
  // { tunnel: Status, tunnelInfo: TunnelInfo|null, schemaLoad: Status,
  //   schema: object|null, error: string|null, lastSeen: ISO|null,
  //   credentialsVisible: boolean, preloadStatus: Status }
  dbStates: {},
  // Last time status was polled
  lastPolled: null,
  // Whether startup init check is done
  initialized: false,
  // Background preload: { total, completed, current: "envAlias/dbAlias"|null }
  preload: { total: 0, completed: 0, current: null },
  // In-memory log entries (newest first, max 1000)
  logs: [],
  // Port editor modal: null = closed, or { dbKey, step, newPort, error, saving }
  portEditor: null,
  // Dashboard: which envs are expanded (set of envAlias strings)
  expandedEnvs: /* @__PURE__ */ new Set()
};
function appReducer(state, action) {
  switch (action.type) {
    // ── Navigation ──────────────────────────────────────────────────────────
    case "PUSH_SCREEN":
      return { ...state, screenStack: [...state.screenStack, { name: action.screen, params: action.params ?? {} }] };
    case "POP_SCREEN":
      return state.screenStack.length <= 1 ? state : { ...state, screenStack: state.screenStack.slice(0, -1) };
    case "REPLACE_SCREEN": {
      const stack = [...state.screenStack];
      stack[stack.length - 1] = { name: action.screen, params: action.params ?? {} };
      return { ...state, screenStack: stack };
    }
    case "EXIT":
      return { ...state, shouldExit: true };
    // ── Settings ─────────────────────────────────────────────────────────────
    case "SET_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.settings } };
    // ── Envs & DB list ───────────────────────────────────────────────────────
    case "SET_ENVS":
      return { ...state, envs: action.envs, lastPolled: (/* @__PURE__ */ new Date()).toISOString() };
    // ── Per-DB tunnel status ─────────────────────────────────────────────────
    case "SET_DB_TUNNEL_STATUS": {
      const prev = state.dbStates[action.dbKey] ?? {};
      return {
        ...state,
        dbStates: {
          ...state.dbStates,
          [action.dbKey]: {
            ...prev,
            tunnel: action.status,
            tunnelInfo: action.tunnelInfo ?? prev.tunnelInfo ?? null,
            lastSeen: action.status === Status.CONNECTED ? (/* @__PURE__ */ new Date()).toISOString() : prev.lastSeen ?? null
          }
        }
      };
    }
    // ── Per-DB schema load ───────────────────────────────────────────────────
    case "SET_DB_SCHEMA_STATUS": {
      const prev = state.dbStates[action.dbKey] ?? {};
      return {
        ...state,
        dbStates: {
          ...state.dbStates,
          [action.dbKey]: {
            ...prev,
            schemaLoad: action.status,
            schema: action.schema !== void 0 ? action.schema : prev.schema
          }
        }
      };
    }
    case "SET_DB_ERROR": {
      const prev = state.dbStates[action.dbKey] ?? {};
      return {
        ...state,
        dbStates: { ...state.dbStates, [action.dbKey]: { ...prev, error: action.error } }
      };
    }
    // ── Credentials visibility ───────────────────────────────────────────────
    case "TOGGLE_CREDENTIALS": {
      const prev = state.dbStates[action.dbKey] ?? {};
      return {
        ...state,
        dbStates: {
          ...state.dbStates,
          [action.dbKey]: { ...prev, credentialsVisible: !prev.credentialsVisible }
        }
      };
    }
    // ── Hide / show ──────────────────────────────────────────────────────────
    case "HIDE_ENV": {
      const hidden = [...state.settings.hiddenEnvs ?? []];
      if (!hidden.includes(action.envAlias)) hidden.push(action.envAlias);
      return { ...state, settings: { ...state.settings, hiddenEnvs: hidden } };
    }
    case "SHOW_ENV": {
      const hidden = (state.settings.hiddenEnvs ?? []).filter((e) => e !== action.envAlias);
      return { ...state, settings: { ...state.settings, hiddenEnvs: hidden } };
    }
    case "HIDE_DB": {
      const hidden = [...state.settings.hiddenDbs ?? []];
      if (!hidden.includes(action.dbKey)) hidden.push(action.dbKey);
      return { ...state, settings: { ...state.settings, hiddenDbs: hidden } };
    }
    case "SHOW_DB": {
      const hidden = (state.settings.hiddenDbs ?? []).filter((k) => k !== action.dbKey);
      return { ...state, settings: { ...state.settings, hiddenDbs: hidden } };
    }
    // ── Dashboard accordion ──────────────────────────────────────────────────
    case "TOGGLE_ENV_EXPANDED": {
      const next = new Set(state.expandedEnvs);
      if (next.has(action.envAlias)) next.delete(action.envAlias);
      else next.add(action.envAlias);
      return { ...state, expandedEnvs: next };
    }
    case "EXPAND_ENV": {
      const next = new Set(state.expandedEnvs);
      next.add(action.envAlias);
      return { ...state, expandedEnvs: next };
    }
    // ── Port editor modal ────────────────────────────────────────────────────
    case "OPEN_PORT_EDITOR":
      return { ...state, portEditor: { dbKey: action.dbKey, dbAlias: action.dbAlias, step: 1, newPort: "", error: null, saving: false } };
    case "CLOSE_PORT_EDITOR":
      return { ...state, portEditor: null };
    case "SET_PORT_EDITOR":
      return { ...state, portEditor: state.portEditor ? { ...state.portEditor, ...action.patch } : null };
    // ── Initialization ───────────────────────────────────────────────────────
    case "SET_INITIALIZED":
      return { ...state, initialized: action.value };
    // ── Background preload ───────────────────────────────────────────────────
    case "SET_PRELOAD":
      return { ...state, preload: { ...state.preload, ...action.preload } };
    case "SET_DB_PRELOAD_STATUS": {
      const prev = state.dbStates[action.dbKey] ?? {};
      return {
        ...state,
        dbStates: { ...state.dbStates, [action.dbKey]: { ...prev, preloadStatus: action.status } }
      };
    }
    // ── Logs ─────────────────────────────────────────────────────────────────
    case "APPEND_LOG":
      return { ...state, logs: [action.entry, ...state.logs].slice(0, 1e3) };
    case "CLEAR_LOGS":
      return { ...state, logs: [] };
    default:
      return state;
  }
}

// src/state/AppContext.js
import { createContext, useContext } from "react";
var AppContext = createContext(null);
function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppContext.Provider");
  return ctx;
}

// src/services/storage.js
import { readFile, writeFile, mkdir, rename, unlink, readdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import os from "os";
var appDir = () => join(os.homedir(), APP_DIR);
var settingsPath = () => join(appDir(), SETTINGS_FILE);
var cachePath = (env, db) => join(appDir(), CACHE_DIR, env, `${db}.json`);
var logsDir = () => join(appDir(), LOGS_DIR);
var todayLogPath = () => join(logsDir(), `${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.log`);
var aptunnelDir = () => join(os.homedir(), APTUNNEL_DIR);
var aptunnelConfigPath = () => join(aptunnelDir(), APTUNNEL_CONFIG_FILE);
async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}
async function atomicWrite(filePath, content) {
  const tmp = `${filePath}.tmp`;
  await ensureDir(dirname(filePath));
  await writeFile(tmp, content, "utf8");
  await rename(tmp, filePath);
}
async function loadSettings() {
  try {
    const raw = await readFile(settingsPath(), "utf8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
async function saveSettings(settings) {
  await atomicWrite(settingsPath(), JSON.stringify(settings, null, 2));
}
async function loadCache(envAlias, dbAlias) {
  try {
    const raw = await readFile(cachePath(envAlias, dbAlias), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function saveCache(envAlias, dbAlias, data) {
  const payload = { ...data, savedAt: (/* @__PURE__ */ new Date()).toISOString() };
  await atomicWrite(cachePath(envAlias, dbAlias), JSON.stringify(payload, null, 2));
}
async function clearAllCache() {
  const dir = join(appDir(), CACHE_DIR);
  if (!existsSync(dir)) return;
  const { rm } = await import("fs/promises");
  await rm(dir, { recursive: true, force: true });
}
async function appendLog(entry) {
  const line = JSON.stringify(entry) + "\n";
  const logPath = todayLogPath();
  await ensureDir(logsDir());
  await writeFile(logPath, line, { flag: "a", encoding: "utf8" });
}
async function readLogFile(date) {
  const logPath = join(logsDir(), `${date}.log`);
  try {
    const raw = await readFile(logPath, "utf8");
    return raw.split("\n").filter(Boolean).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}
async function listLogDates() {
  const dir = logsDir();
  if (!existsSync(dir)) return [];
  const files = await readdir(dir).catch(() => []);
  return files.filter((f) => f.endsWith(".log")).map((f) => f.replace(".log", "")).sort().reverse();
}
async function clearLogs() {
  const dir = logsDir();
  if (!existsSync(dir)) return;
  const files = await readdir(dir).catch(() => []);
  for (const f of files) {
    if (f.endsWith(".log")) await unlink(join(dir, f)).catch(() => {
    });
  }
}
async function exportLogs(date, destPath) {
  const logPath = join(logsDir(), `${date}.log`);
  const raw = await readFile(logPath, "utf8").catch(() => "");
  await writeFile(destPath, raw, "utf8");
}
async function aptunnelConfigExists() {
  try {
    const raw = await readFile(aptunnelConfigPath(), "utf8");
    return raw.trim().length > 0;
  } catch {
    return false;
  }
}
async function loadAptunnelConfig() {
  try {
    const raw = await readFile(aptunnelConfigPath(), "utf8");
    const { parse } = await import("yaml");
    return parse(raw);
  } catch {
    return null;
  }
}
function parseEnvsFromConfig(config) {
  if (!config?.environments) return [];
  return Object.entries(config.environments).map(([envKey, env]) => ({
    envKey,
    envAlias: env.alias ?? envKey,
    dbs: Object.entries(env.databases ?? {}).map(([dbKey, db]) => ({
      dbKey,
      dbAlias: db.alias ?? dbKey,
      port: db.port,
      type: db.type ?? "postgresql"
    }))
  }));
}

// src/services/logger.js
var _dispatch = null;
function setLogDispatch(dispatch2) {
  _dispatch = dispatch2;
}
async function log(level, message, { env, db } = {}) {
  const entry = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    level,
    env: env ?? null,
    db: db ?? null,
    message
  };
  appendLog(entry).catch(() => {
  });
  _dispatch?.({ type: "APPEND_LOG", entry });
}
var logger = {
  info: (msg, ctx) => log(LogLevel.INFO, msg, ctx),
  warn: (msg, ctx) => log(LogLevel.WARN, msg, ctx),
  error: (msg, ctx) => log(LogLevel.ERROR, msg, ctx)
};

// src/screens/InitWizard.js
import React2, { useState, useEffect, useRef } from "react";
import { Box as Box2, Text as Text2, useInput } from "ink";
import TextInput from "ink-text-input";

// src/components/ProgressBar.js
import React from "react";
import { Box, Text } from "ink";
import { jsx, jsxs } from "react/jsx-runtime";
function ProgressBar({ current, total, width = 20, label = true }) {
  const pct = total > 0 ? Math.min(1, current / total) : 0;
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(empty);
  return /* @__PURE__ */ jsxs(Box, { gap: 1, children: [
    /* @__PURE__ */ jsx(Text, { color: "green", children: bar }),
    label && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      current,
      "/",
      total
    ] })
  ] });
}

// src/hooks/useNavigation.js
import { useCallback } from "react";
function useNavigation() {
  const { dispatch: dispatch2 } = useAppContext();
  const push = useCallback((screen, params) => dispatch2({ type: "PUSH_SCREEN", screen, params }), [dispatch2]);
  const pop = useCallback(() => dispatch2({ type: "POP_SCREEN" }), [dispatch2]);
  const replace = useCallback((screen, params) => dispatch2({ type: "REPLACE_SCREEN", screen, params }), [dispatch2]);
  const quit = useCallback(() => dispatch2({ type: "EXIT" }), [dispatch2]);
  const goTo = {
    dashboard: (p) => push(Screen.DASHBOARD, p),
    dbDetail: (p) => push(Screen.DB_DETAIL, p),
    settings: () => push(Screen.SETTINGS, {}),
    logs: () => push(Screen.LOGS, {}),
    configEditor: () => push(Screen.CONFIG_EDITOR, {}),
    initWizard: () => replace(Screen.INIT_WIZARD, {})
  };
  return { push, pop, replace, quit, goTo };
}

// src/services/versionCheck.js
import semver from "semver";

// src/services/aptunnel.js
import { execa } from "execa";
async function getAptunnelVersion() {
  try {
    const { stdout } = await execa("aptunnel", ["--version"]);
    const match = stdout.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
async function installAptunnel() {
  await execa("npm", ["install", "-g", "aptunnel"]);
}
function spawnInit() {
  return execa("aptunnel", ["init"], { all: true });
}
function spawnLogin() {
  return execa("aptunnel", ["login"], { all: true, stdin: "inherit" });
}
async function getRawConfig() {
  const { stdout } = await execa("aptunnel", ["config", "--raw"]);
  return stdout;
}
async function getStatusRaw() {
  const { stdout } = await execa("aptunnel", ["status"]);
  return stdout;
}
function parseStatusOutput(raw) {
  const result = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^(\S+)\s+(UP|DOWN|CONN(?:ECTING)?)/i);
    if (m) {
      result[m[1]] = m[2].toUpperCase().startsWith("UP") || m[2].toUpperCase() === "CONN";
    }
  }
  return result;
}
async function openTunnel(dbAlias) {
  const { stdout } = await execa("aptunnel", [dbAlias]);
  return parseTunnelOutput(stdout);
}
async function closeTunnel(dbAlias) {
  await execa("aptunnel", [dbAlias, "--close"]);
}
async function openAll(envAlias) {
  const args = ["all"];
  if (envAlias) args.push(`--env=${envAlias}`);
  await execa("aptunnel", args);
}
async function closeAll(envAlias) {
  const args = ["all", "--close"];
  if (envAlias) args.push(`--env=${envAlias}`);
  await execa("aptunnel", args);
}
function parseTunnelOutput(stdout) {
  const info = { port: null, host: null, user: null, password: null, url: null, pid: null };
  for (const line of stdout.split("\n")) {
    const m = line.match(TUNNEL_OUTPUT_FIELD_RE);
    if (!m) continue;
    const [, key, value] = m;
    switch (key) {
      case "Port":
        info.port = parseInt(value, 10);
        break;
      case "Host":
        info.host = value.trim();
        break;
      case "User":
        info.user = value.trim();
        break;
      case "Password":
        info.password = value.trim();
        break;
      case "URL":
        info.url = value.trim();
        break;
      case "PID":
        info.pid = parseInt(value, 10);
        break;
    }
  }
  return info;
}
async function isPortAvailable(port) {
  const net = await import("net");
  return new Promise((resolve) => {
    const server = net.default.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port, "127.0.0.1");
  });
}

// src/services/versionCheck.js
async function ensureAptunnel(onProgress) {
  onProgress?.("Checking aptunnel installation\u2026");
  const version = await getAptunnelVersion();
  if (!version) {
    onProgress?.("aptunnel not found \u2014 installing\u2026");
    await installAptunnel();
    const v = await getAptunnelVersion();
    onProgress?.(`aptunnel installed (${v})`);
    return { status: "installed", version: v ?? "?" };
  }
  if (!semver.gte(version, MIN_APTUNNEL_VERSION)) {
    onProgress?.(`aptunnel ${version} is outdated (need >=${MIN_APTUNNEL_VERSION}) \u2014 updating\u2026`);
    await installAptunnel();
    const v = await getAptunnelVersion();
    onProgress?.(`aptunnel updated to ${v}`);
    return { status: "updated", version: v ?? "?" };
  }
  onProgress?.(`aptunnel ${version} \u2713`);
  return { status: "ok", version };
}

// src/screens/InitWizard.js
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var TOTAL_STEPS = 7;
function StepRow({ num, currentStep, label, detail, error }) {
  const done = num < currentStep;
  const active = num === currentStep;
  const future = num > currentStep;
  return /* @__PURE__ */ jsxs2(Box2, { gap: 1, children: [
    done && /* @__PURE__ */ jsx2(Text2, { color: "green", children: "\u2714" }),
    active && /* @__PURE__ */ jsx2(Text2, { color: "yellow", children: "\u25B6" }),
    future && /* @__PURE__ */ jsx2(Text2, { dimColor: true, children: "\u25CB" }),
    /* @__PURE__ */ jsxs2(Text2, { dimColor: future, bold: active, children: [
      num,
      ". ",
      label
    ] }),
    detail && /* @__PURE__ */ jsx2(Text2, { dimColor: true, color: error ? "red" : void 0, children: detail })
  ] });
}
function InitWizard() {
  const { state, dispatch: dispatch2 } = useAppContext();
  const { replace } = useNavigation();
  const [step, setStep] = useState(1);
  const [stepDetails, setStepDetails] = useState({});
  const [stepErrors, setStepErrors] = useState({});
  const [skipConfirm, setSkipConfirm] = useState(false);
  const [driverList, setDriverList] = useState([]);
  const [driverProgress, setDriverProgress] = useState({});
  const [done, setDone] = useState(false);
  const running = useRef(false);
  const setDetail = (s, d) => setStepDetails((prev) => ({ ...prev, [s]: d }));
  const setError = (s, e) => setStepErrors((prev) => ({ ...prev, [s]: e }));
  useInput((input, key) => {
    if (step === 2 && skipConfirm) {
      if (input === "y" || input === "Y" || key.return) {
        setSkipConfirm(false);
        runFromStep(6);
      } else if (input === "n" || input === "N") {
        setSkipConfirm(false);
        runFromStep(3);
      }
    }
    if (done && key.return) {
      dispatch2({ type: "SET_INITIALIZED", value: true });
      replace(Screen.DASHBOARD);
    }
  });
  useEffect(() => {
    if (!running.current) {
      running.current = true;
      runFromStep(1);
    }
  }, []);
  async function runFromStep(fromStep) {
    setStep(fromStep);
    try {
      if (fromStep <= 1) {
        setStep(1);
        await ensureAptunnel((msg) => setDetail(1, msg));
        setDetail(1, "OK");
      }
      if (fromStep <= 2) {
        setStep(2);
        const exists = await aptunnelConfigExists();
        if (exists) {
          setDetail(2, "Existing config found. Skip init? [Y/n]");
          setSkipConfirm(true);
          return;
        }
        setDetail(2, "No config found");
      }
      if (fromStep <= 3) {
        setStep(3);
        setDetail(3, "Launching aptunnel login\u2026");
        try {
          const proc = spawnLogin();
          let output = "";
          proc.all?.on("data", (d) => {
            output += d.toString();
          });
          await proc;
          const emailMatch = output.match(/authenticated as\s+([\S]+)/i);
          setDetail(3, emailMatch ? `authenticated as ${emailMatch[1]}` : "authenticated");
          logger.info(`aptunnel login completed`);
        } catch (err) {
          setError(3, err.message);
          logger.error(`aptunnel login failed: ${err.message}`);
          setDetail(3, "skipped (may already be authenticated)");
        }
      }
      if (fromStep <= 4) {
        setStep(4);
        setDetail(4, "Running aptunnel init\u2026");
        try {
          const proc = spawnInit();
          let output = "";
          proc.all?.on("data", (chunk) => {
            output += chunk.toString();
            const lines = output.split("\n").filter((l) => l.trim());
            if (lines.length) setDetail(4, lines[lines.length - 1].trim().slice(0, 60));
          });
          await proc;
          setDetail(4, "init complete");
          logger.info("aptunnel init completed");
        } catch (err) {
          setError(4, err.message);
          logger.error(`aptunnel init failed: ${err.message}`);
          setDetail(4, `error: ${err.message.slice(0, 50)}`);
        }
      }
      if (fromStep <= 5) {
        setStep(5);
        const config = await loadAptunnelConfig();
        const envs = config ? parseEnvsFromConfig(config) : [];
        const summary = envs.map((e) => `${e.envAlias}(${e.dbs.length})`).join(", ") || "none";
        setDetail(5, `envs: ${summary}`);
        dispatch2({ type: "SET_ENVS", envs });
        logger.info(`Loaded ${envs.length} environments from config`);
      }
      if (fromStep <= 6) {
        setStep(6);
        const config = await loadAptunnelConfig();
        const envs = config ? parseEnvsFromConfig(config) : [];
        const types = /* @__PURE__ */ new Set();
        for (const env of envs) for (const db of env.dbs) types.add(db.type);
        const needed = [...types].map((t) => DB_DRIVER_PACKAGES[t]).filter(Boolean);
        const unique = [...new Set(needed)];
        setDriverList(unique);
        setDetail(6, unique.length ? `will install: ${unique.join(", ")}` : "no drivers needed");
      }
      if (fromStep <= 7) {
        setStep(7);
        if (driverList.length === 0) {
          setDetail(7, "no drivers to install");
        } else {
          for (const pkg of driverList) {
            setDriverProgress((prev) => ({ ...prev, [pkg]: "installing" }));
            try {
              const { execa: execa2 } = await import("execa");
              await execa2("npm", ["install", pkg]);
              setDriverProgress((prev) => ({ ...prev, [pkg]: "done" }));
              logger.info(`Driver installed: ${pkg}`);
            } catch (err) {
              setDriverProgress((prev) => ({ ...prev, [pkg]: "failed" }));
              logger.error(`Driver install failed: ${pkg} \u2014 ${err.message}`);
            }
          }
          setDetail(7, "drivers installed");
        }
      }
      setDone(true);
    } catch (err) {
      logger.error(`Init wizard error: ${err.message}`);
    }
  }
  const labels = [
    "aptunnel check",
    "config check",
    "aptible login",
    "fetch envs + DBs",
    "assign aliases & ports",
    "detect DB types",
    "install drivers"
  ];
  return /* @__PURE__ */ jsxs2(Box2, { flexDirection: "column", paddingX: 2, paddingY: 1, gap: 0, children: [
    /* @__PURE__ */ jsx2(Text2, { bold: true, color: "cyan", children: " aptunnel-gui \u2014 Setup Wizard" }),
    /* @__PURE__ */ jsx2(Text2, { children: " " }),
    labels.map((label, i) => {
      const n = i + 1;
      return /* @__PURE__ */ jsx2(
        StepRow,
        {
          num: n,
          currentStep: step,
          label,
          detail: stepDetails[n],
          error: !!stepErrors[n]
        },
        n
      );
    }),
    step === 2 && skipConfirm && /* @__PURE__ */ jsx2(Box2, { marginLeft: 3, marginTop: 1, children: /* @__PURE__ */ jsx2(Text2, { color: "yellow", children: "Existing config found. Skip init? [Y/n] " }) }),
    step === 7 && driverList.length > 0 && /* @__PURE__ */ jsx2(Box2, { flexDirection: "column", marginLeft: 3, marginTop: 1, gap: 0, children: driverList.map((pkg) => /* @__PURE__ */ jsxs2(Box2, { gap: 1, children: [
      driverProgress[pkg] === "done" && /* @__PURE__ */ jsx2(Text2, { color: "green", children: "\u2714" }),
      driverProgress[pkg] === "failed" && /* @__PURE__ */ jsx2(Text2, { color: "red", children: "\u2716" }),
      driverProgress[pkg] === "installing" && /* @__PURE__ */ jsx2(Text2, { color: "yellow", children: "\u2026" }),
      !driverProgress[pkg] && /* @__PURE__ */ jsx2(Text2, { dimColor: true, children: "\u25CB" }),
      /* @__PURE__ */ jsx2(Text2, { children: pkg })
    ] }, pkg)) }),
    /* @__PURE__ */ jsx2(Text2, { children: " " }),
    /* @__PURE__ */ jsx2(ProgressBar, { current: done ? TOTAL_STEPS : Math.min(step - 1, TOTAL_STEPS), total: TOTAL_STEPS, width: 24 }),
    done && /* @__PURE__ */ jsxs2(Box2, { flexDirection: "column", marginTop: 1, gap: 0, children: [
      /* @__PURE__ */ jsx2(Text2, { color: "green", bold: true, children: "\u2714 Setup complete!" }),
      /* @__PURE__ */ jsx2(Text2, { dimColor: true, children: "[Enter] Launch Dashboard" })
    ] })
  ] });
}

// src/screens/Dashboard.js
import React7, { useState as useState4, useMemo, useCallback as useCallback4, useEffect as useEffect5, useRef as useRef4 } from "react";
import { Box as Box6, Text as Text7, useInput as useInput3, useStdout as useStdout2 } from "ink";

// src/components/AppLayout.js
import React3, { useCallback as useCallback2 } from "react";
import { Box as Box3, Text as Text3, useStdout } from "ink";

// src/hooks/useMouse.js
import { useEffect as useEffect2 } from "react";
var regions = [];
var rawHandlers = /* @__PURE__ */ new Set();
var SGR_RE = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
var VT200_RE = /\x1b\[M([\x20-\xff])([\x20-\xff])([\x20-\xff])/;
var _buf = "";
function parseAndDispatch(chunk) {
  const incoming = Buffer.isBuffer(chunk) ? chunk.toString("binary") : String(chunk);
  _buf += incoming;
  SGR_RE.lastIndex = 0;
  let m;
  while ((m = SGR_RE.exec(_buf)) !== null) {
    const btn = parseInt(m[1]);
    const x = parseInt(m[2]);
    const y = parseInt(m[3]);
    const released = m[4] === "m";
    const event = { x, y, button: btn & 3, type: released ? "mouseup" : "mousedown" };
    dispatch(event);
  }
  const vt = _buf.match(VT200_RE);
  if (vt) {
    const btn = vt[1].charCodeAt(0) - 32;
    const x = vt[2].charCodeAt(0) - 32;
    const y = vt[3].charCodeAt(0) - 32;
    dispatch({ x, y, button: btn & 3, type: "mousedown" });
  }
  if (_buf.length > 256) _buf = _buf.slice(-256);
}
function dispatch(event) {
  for (const h of rawHandlers) h(event);
  if (event.type === "mousedown") {
    for (let i = regions.length - 1; i >= 0; i--) {
      const r = regions[i];
      if (event.x >= r.x1 && event.x <= r.x2 && event.y >= r.y1 && event.y <= r.y2) {
        r.cb(event);
        break;
      }
    }
  }
}
var enabled = false;
function enableMouse() {
  if (enabled) return;
  enabled = true;
  process.stdout.write("\x1B[?1000h");
  process.stdout.write("\x1B[?1006h");
}
function disableMouse() {
  if (!enabled) return;
  enabled = false;
  process.stdout.write("\x1B[?1000l");
  process.stdout.write("\x1B[?1006l");
}
var _stdinAttached = false;
function attachStdinListener() {
  if (_stdinAttached) return;
  _stdinAttached = true;
  const s = process.stdin;
  if (s.readable) {
    s.on("data", parseAndDispatch);
  } else {
    s.once("readable", () => s.on("data", parseAndDispatch));
  }
}
attachStdinListener();
function useMouse(handler) {
  useEffect2(() => {
    enableMouse();
    rawHandlers.add(handler);
    return () => {
      rawHandlers.delete(handler);
      if (rawHandlers.size === 0) disableMouse();
    };
  }, [handler]);
}
process.on("exit", disableMouse);
process.on("SIGINT", () => {
  disableMouse();
  process.exit(0);
});

// src/components/AppLayout.js
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function countTunnels(envs, dbStates) {
  let total = 0, up = 0;
  for (const env of envs ?? []) {
    for (const db of env.dbs ?? []) {
      total++;
      const key = `${env.envAlias}/${db.dbAlias}`;
      if (dbStates[key]?.tunnel === Status.CONNECTED) up++;
    }
  }
  return { up, total };
}
function AppLayout({ children, footer, mouseHandler }) {
  const { state } = useAppContext();
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
  const { up, total } = countTunnels(state.envs, state.dbStates);
  const envName = state.settings.defaultEnv ?? state.envs?.[0]?.envAlias ?? "\u2014";
  const version = `aptunnel-gui v${APP_VERSION}`;
  const headerLeft = ` aptunnel-gui  \u2502  env: ${envName}  \u2502  ${up}/${total} tunnels up`;
  const rightWidth = version.length + 1;
  const leftMaxWidth = Math.max(0, cols - rightWidth - 2);
  const leftText = headerLeft.length > leftMaxWidth ? headerLeft.slice(0, leftMaxWidth - 1) + "\u2026" : headerLeft.padEnd(leftMaxWidth);
  const divider = "\u2500".repeat(cols);
  const footerText = footer ?? "[\u2191\u2193] navigate  [Enter] select  [Ctrl+C] quit";
  const footerMax = cols - 2;
  const footerDisplay = footerText.length > footerMax ? footerText.slice(0, footerMax - 1) + "\u2026" : footerText;
  const noop = useCallback2(() => {
  }, []);
  useMouse(mouseHandler ?? noop);
  return /* @__PURE__ */ jsxs3(Box3, { flexDirection: "column", width: cols, children: [
    /* @__PURE__ */ jsxs3(Box3, { width: cols, flexDirection: "row", children: [
      /* @__PURE__ */ jsx3(Text3, { bold: true, children: leftText }),
      /* @__PURE__ */ jsxs3(Text3, { dimColor: true, children: [
        version,
        " "
      ] })
    ] }),
    /* @__PURE__ */ jsx3(Text3, { dimColor: true, children: divider }),
    /* @__PURE__ */ jsx3(Box3, { flexDirection: "column", flexGrow: 1, children }),
    /* @__PURE__ */ jsx3(Text3, { dimColor: true, children: divider }),
    /* @__PURE__ */ jsx3(Box3, { width: cols, paddingLeft: 1, children: /* @__PURE__ */ jsx3(Text3, { dimColor: true, children: footerDisplay }) })
  ] });
}

// src/components/StatusBadge.js
import React4 from "react";
import { Text as Text4 } from "ink";
import { jsx as jsx4 } from "react/jsx-runtime";
var BADGE_MAP = {
  [Status.CONNECTED]: { label: " UP   ", color: "green", bold: true },
  [Status.IDLE]: { label: " DOWN ", color: "red", bold: false },
  [Status.CONNECTING]: { label: " CONN ", color: "yellow", bold: false },
  [Status.DISCONNECTING]: { label: " DISC ", color: "yellow", bold: false },
  [Status.FAILED]: { label: " FAIL ", color: "red", bold: true },
  [Status.ERROR]: { label: " ERR  ", color: "red", bold: true },
  [Status.LOADING]: { label: " LOAD ", color: "cyan", bold: false }
};
function StatusBadge({ status }) {
  const def = BADGE_MAP[status] ?? { label: ` ${(status ?? "?").toUpperCase().padEnd(4)} `, color: "gray", bold: false };
  return /* @__PURE__ */ jsx4(Text4, { color: def.color, bold: def.bold, inverse: true, children: def.label });
}
function StatusDot({ status }) {
  const colorMap = {
    [Status.CONNECTED]: "green",
    [Status.IDLE]: "red",
    [Status.CONNECTING]: "yellow",
    [Status.DISCONNECTING]: "yellow",
    [Status.FAILED]: "red",
    [Status.ERROR]: "red"
  };
  const color = colorMap[status] ?? "gray";
  return /* @__PURE__ */ jsx4(Text4, { color, children: "\u25CF" });
}

// src/components/MarqueeText.js
import React5, { useState as useState2, useEffect as useEffect3, useRef as useRef2 } from "react";
import { Box as Box4, Text as Text5 } from "ink";
import { jsx as jsx5 } from "react/jsx-runtime";
var SCROLL_INTERVAL_MS = 140;
var PAUSE_TICKS = 8;
function MarqueeText({ text, width, isActive, color, bold, dimColor }) {
  const [offset, setOffset] = useState2(0);
  const pauseRef = useRef2(0);
  const dirRef = useRef2(1);
  useEffect3(() => {
    if (!isActive || text.length <= width) {
      setOffset(0);
      pauseRef.current = 0;
      dirRef.current = 1;
      return;
    }
    const maxOffset = text.length - width;
    const timer = setInterval(() => {
      if (pauseRef.current > 0) {
        pauseRef.current--;
        return;
      }
      setOffset((prev) => {
        const next = prev + dirRef.current;
        if (next >= maxOffset) {
          dirRef.current = -1;
          pauseRef.current = PAUSE_TICKS;
          return maxOffset;
        }
        if (next <= 0) {
          dirRef.current = 1;
          pauseRef.current = PAUSE_TICKS;
          return 0;
        }
        return next;
      });
    }, SCROLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isActive, text, width]);
  const visible = text.length <= width ? text.padEnd(width) : text.slice(offset, offset + width);
  return /* @__PURE__ */ jsx5(Box4, { width, overflow: "hidden", children: /* @__PURE__ */ jsx5(Text5, { color, bold, dimColor, children: visible }) });
}

// src/components/PortEditor.js
import React6, { useState as useState3 } from "react";
import { Box as Box5, Text as Text6, useInput as useInput2 } from "ink";
import TextInput2 from "ink-text-input";
import { jsx as jsx6, jsxs as jsxs4 } from "react/jsx-runtime";
function StepIcon({ done, active }) {
  if (done) return /* @__PURE__ */ jsx6(Text6, { color: "green", children: "\u2714" });
  if (active) return /* @__PURE__ */ jsx6(Text6, { color: "yellow", children: "\u25B6" });
  return /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "\u25CB" });
}
function PortEditor() {
  const { state, dispatch: dispatch2 } = useAppContext();
  const pe = state.portEditor;
  const [portInput, setPortInput] = useState3("");
  const [checking, setChecking] = useState3(false);
  const [portOk, setPortOk] = useState3(false);
  const [portError, setPortError] = useState3(null);
  const [reconnecting, setReconnecting] = useState3(false);
  const [reconnected, setReconnected] = useState3(false);
  const [reconnectError, setReconnectError] = useState3(null);
  const [saved, setSaved] = useState3(false);
  const [done, setDone] = useState3(false);
  const step = pe?.step ?? 1;
  useInput2((input, key) => {
    if (!pe) return;
    if (key.escape) {
      dispatch2({ type: "CLOSE_PORT_EDITOR" });
      return;
    }
    if (step === 2 && !reconnecting) {
      if (input === "y" || input === "Y" || key.return) handleReconnect();
      if (input === "n" || input === "N") dispatch2({ type: "CLOSE_PORT_EDITOR" });
    }
    if (step === 3 && !reconnecting) {
      if (input === "y" || input === "Y") handleSave(true);
      if (input === "n" || input === "N") handleSave(false);
      if (key.return) handleSave(false);
    }
    if (done && key.return) dispatch2({ type: "CLOSE_PORT_EDITOR" });
  });
  if (!pe) return null;
  async function handleCheckPort() {
    const port2 = parseInt(portInput, 10);
    if (isNaN(port2) || port2 < 1 || port2 > 65535) {
      setPortError("Invalid port number");
      return;
    }
    setChecking(true);
    setPortError(null);
    const available = await isPortAvailable(port2).catch(() => false);
    setChecking(false);
    if (!available) {
      setPortError("Port is already in use");
      return;
    }
    setPortOk(true);
    dispatch2({ type: "SET_PORT_EDITOR", patch: { step: 2, newPort: String(port2) } });
  }
  async function handleReconnect() {
    setReconnecting(true);
    setReconnectError(null);
    try {
      const dbKey = pe.dbKey;
      dispatch2({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.DISCONNECTING });
      await closeTunnel(pe.dbAlias);
      dispatch2({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.CONNECTING });
      const info = await openTunnel(pe.dbAlias);
      dispatch2({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.CONNECTED, tunnelInfo: info });
      logger.info(`Port changed: ${pe.dbAlias} reconnected on port ${pe.newPort}`, { db: pe.dbAlias });
      setReconnected(true);
      dispatch2({ type: "SET_PORT_EDITOR", patch: { step: 3 } });
    } catch (err) {
      setReconnectError(err.message);
      dispatch2({ type: "SET_DB_TUNNEL_STATUS", dbKey: pe.dbKey, status: Status.FAILED });
      logger.error(`Port change reconnect failed: ${err.message}`, { db: pe.dbAlias });
    } finally {
      setReconnecting(false);
    }
  }
  async function handleSave(persist) {
    if (persist) {
      const portOverrides = { ...state.settings.portOverrides ?? {}, [pe.dbKey]: parseInt(pe.newPort, 10) };
      const newSettings = { ...state.settings, portOverrides };
      dispatch2({ type: "SET_SETTINGS", settings: newSettings });
      await saveSettings(newSettings).catch(() => {
      });
      setSaved(true);
    }
    setDone(true);
    dispatch2({ type: "SET_PORT_EDITOR", patch: { step: 4 } });
  }
  const port = parseInt(portInput || pe.newPort || "0", 10);
  return /* @__PURE__ */ jsxs4(Box5, { flexDirection: "column", borderStyle: "round", borderColor: "cyan", paddingX: 2, paddingY: 1, width: 52, children: [
    /* @__PURE__ */ jsx6(Text6, { bold: true, color: "cyan", children: " Edit tunnel port" }),
    /* @__PURE__ */ jsxs4(Text6, { dimColor: true, children: [
      " DB: ",
      pe.dbAlias
    ] }),
    /* @__PURE__ */ jsx6(Text6, { children: " " }),
    /* @__PURE__ */ jsxs4(Box5, { gap: 1, children: [
      /* @__PURE__ */ jsx6(StepIcon, { done: step > 1, active: step === 1 }),
      /* @__PURE__ */ jsx6(Text6, { children: "Step 1 \u2014 enter new port" })
    ] }),
    step === 1 && /* @__PURE__ */ jsxs4(Box5, { flexDirection: "column", marginLeft: 2, marginTop: 1, gap: 1, children: [
      /* @__PURE__ */ jsxs4(Box5, { gap: 1, children: [
        /* @__PURE__ */ jsx6(Text6, { children: "New port: " }),
        /* @__PURE__ */ jsx6(
          TextInput2,
          {
            value: portInput,
            onChange: setPortInput,
            onSubmit: handleCheckPort,
            placeholder: "e.g. 5433"
          }
        )
      ] }),
      checking && /* @__PURE__ */ jsx6(Text6, { color: "yellow", children: "Checking availability\u2026" }),
      portError && /* @__PURE__ */ jsxs4(Text6, { color: "red", children: [
        "\u2716 ",
        portError
      ] }),
      /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "[Enter] check & continue  [Esc] cancel" })
    ] }),
    step > 1 && /* @__PURE__ */ jsx6(Box5, { marginLeft: 2, children: /* @__PURE__ */ jsxs4(Text6, { color: "green", dimColor: true, children: [
      "port ",
      pe.newPort,
      " is available"
    ] }) }),
    /* @__PURE__ */ jsx6(Text6, { children: " " }),
    /* @__PURE__ */ jsxs4(Box5, { gap: 1, children: [
      /* @__PURE__ */ jsx6(StepIcon, { done: step > 2, active: step === 2 }),
      /* @__PURE__ */ jsx6(Text6, { dimColor: step < 2, children: "Step 2 \u2014 confirm reconnect" })
    ] }),
    step === 2 && /* @__PURE__ */ jsxs4(Box5, { flexDirection: "column", marginLeft: 2, marginTop: 1, gap: 1, children: [
      /* @__PURE__ */ jsx6(Text6, { color: "yellow", children: "\u26A0  Tunnel will be closed and reopened on new port." }),
      /* @__PURE__ */ jsxs4(Text6, { children: [
        "Reconnect ",
        pe.dbAlias,
        " on port ",
        pe.newPort,
        "?"
      ] }),
      reconnecting && /* @__PURE__ */ jsx6(Text6, { color: "yellow", children: "Reconnecting\u2026" }),
      reconnectError && /* @__PURE__ */ jsxs4(Text6, { color: "red", children: [
        "\u2716 ",
        reconnectError
      ] }),
      !reconnecting && /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "[Y] Yes, reconnect  [N] Cancel" })
    ] }),
    step > 2 && /* @__PURE__ */ jsx6(Box5, { marginLeft: 2, children: /* @__PURE__ */ jsxs4(Text6, { color: "green", dimColor: true, children: [
      "tunnel reconnected on port ",
      pe.newPort
    ] }) }),
    /* @__PURE__ */ jsx6(Text6, { children: " " }),
    /* @__PURE__ */ jsxs4(Box5, { gap: 1, children: [
      /* @__PURE__ */ jsx6(StepIcon, { done: step > 3, active: step === 3 }),
      /* @__PURE__ */ jsx6(Text6, { dimColor: step < 3, children: "Step 3 \u2014 persist setting?" })
    ] }),
    step === 3 && /* @__PURE__ */ jsxs4(Box5, { flexDirection: "column", marginLeft: 2, marginTop: 1, gap: 1, children: [
      /* @__PURE__ */ jsxs4(Text6, { children: [
        "Always open ",
        pe.dbAlias,
        " on port ",
        pe.newPort,
        "?"
      ] }),
      /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "[Y] Yes, save as default  [N] Just this session" })
    ] }),
    step === 4 && /* @__PURE__ */ jsxs4(Box5, { flexDirection: "column", marginTop: 1, gap: 0, children: [
      /* @__PURE__ */ jsxs4(Text6, { color: "green", children: [
        "\u2714 Port updated to ",
        pe.newPort
      ] }),
      /* @__PURE__ */ jsx6(Text6, { color: "green", children: "\u2714 Tunnel reconnected" }),
      saved && /* @__PURE__ */ jsx6(Text6, { color: "green", children: "\u2714 Saved as default port" }),
      /* @__PURE__ */ jsx6(Text6, { children: " " }),
      /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "[Enter] close" })
    ] })
  ] });
}

// src/hooks/usePolling.js
import { useEffect as useEffect4, useRef as useRef3, useCallback as useCallback3 } from "react";
function usePolling(enabled2 = true) {
  const { state, dispatch: dispatch2 } = useAppContext();
  const intervalRef = useRef3(null);
  const prevTunnelStates = useRef3({});
  const poll = useCallback3(async () => {
    try {
      const config = await loadAptunnelConfig();
      if (!config) return;
      const envs = parseEnvsFromConfig(config);
      dispatch2({ type: "SET_ENVS", envs });
      const raw = await getStatusRaw().catch(() => null);
      const tunnelStates = raw ? parseStatusOutput(raw) : {};
      for (const env of envs) {
        for (const db of env.dbs) {
          const key = `${env.envAlias}/${db.dbAlias}`;
          const isUp = tunnelStates[db.dbAlias] ?? tunnelStates[db.dbKey] ?? false;
          const newStatus = isUp ? Status.CONNECTED : Status.IDLE;
          if (prevTunnelStates.current[key] !== newStatus) {
            dispatch2({ type: "SET_DB_TUNNEL_STATUS", dbKey: key, status: newStatus });
            prevTunnelStates.current[key] = newStatus;
          }
        }
      }
    } catch (err) {
      logger.error(`Status poll failed: ${err.message}`);
    }
  }, [dispatch2]);
  useEffect4(() => {
    if (!enabled2) return;
    poll();
    const ms = (state.settings.pollingInterval ?? 5) * 1e3;
    intervalRef.current = setInterval(poll, ms);
    return () => clearInterval(intervalRef.current);
  }, [enabled2, poll, state.settings.pollingInterval]);
  return { poll };
}

// src/screens/Dashboard.js
import { jsx as jsx7, jsxs as jsxs5 } from "react/jsx-runtime";
var C = {
  GUTTER: 1,
  // left indent
  DOT: 2,
  // ● + space
  NAME: 19,
  // db name cell
  TYPE: 11,
  // type cell
  STATUS: 7,
  // badge cell  [UP   ] = 7 chars
  PORT: 9,
  // :55554
  SEEN: 8,
  // HH:MM
  ARROW: 5
  // [→]
};
var COL_STATUS_START = C.GUTTER + C.DOT + C.NAME + C.TYPE + 1;
var COL_PORT_START = COL_STATUS_START + C.STATUS;
var COL_ARROW_START = COL_PORT_START + C.PORT + C.SEEN;
var HEADER_ROWS = 2;
function StatusLabel({ status, isFocused }) {
  const map = {
    [Status.CONNECTED]: { label: "UP   ", color: "green" },
    [Status.IDLE]: { label: "DOWN ", color: "red" },
    [Status.CONNECTING]: { label: "CONN ", color: "yellow" },
    [Status.DISCONNECTING]: { label: "DISC ", color: "yellow" },
    [Status.FAILED]: { label: "FAIL ", color: "red" },
    [Status.ERROR]: { label: "ERR  ", color: "red" }
  };
  const { label = "?    ", color = "gray" } = map[status] ?? {};
  return /* @__PURE__ */ jsx7(Text7, { color, bold: true, inverse: isFocused, children: label });
}
function ColumnHeaders() {
  return /* @__PURE__ */ jsxs5(Box6, { paddingLeft: C.GUTTER + C.DOT, children: [
    /* @__PURE__ */ jsx7(Box6, { width: C.NAME, children: /* @__PURE__ */ jsx7(Text7, { dimColor: true, bold: true, children: "name" }) }),
    /* @__PURE__ */ jsx7(Box6, { width: C.TYPE, children: /* @__PURE__ */ jsx7(Text7, { dimColor: true, bold: true, children: "type" }) }),
    /* @__PURE__ */ jsx7(Box6, { width: C.STATUS, children: /* @__PURE__ */ jsx7(Text7, { dimColor: true, bold: true, children: "status" }) }),
    /* @__PURE__ */ jsx7(Box6, { width: C.PORT, children: /* @__PURE__ */ jsx7(Text7, { dimColor: true, bold: true, children: "port" }) }),
    /* @__PURE__ */ jsx7(Box6, { width: C.SEEN, children: /* @__PURE__ */ jsx7(Text7, { dimColor: true, bold: true, children: "last seen" }) })
  ] });
}
function EnvRow({ env, isExpanded, isFocused, up, total }) {
  const icon = isExpanded ? "\u25BC" : "\u25B6";
  const color = isFocused ? "cyan" : "white";
  return /* @__PURE__ */ jsxs5(Box6, { paddingLeft: C.GUTTER, gap: 1, children: [
    /* @__PURE__ */ jsx7(Text7, { color, bold: true, children: icon }),
    /* @__PURE__ */ jsx7(Text7, { color, bold: true, children: env.envAlias }),
    /* @__PURE__ */ jsxs5(Text7, { dimColor: true, children: [
      "(",
      up,
      "/",
      total,
      " up)"
    ] }),
    /* @__PURE__ */ jsx7(Text7, { dimColor: true, color: "cyan", children: "  [\u2191 All]  [\u2193 All]  [\u27F3]  [hide \u21AF]" })
  ] });
}
function DbRow({ db, envAlias, isFocused, nameMaxLength }) {
  const { state } = useAppContext();
  const key = `${envAlias}/${db.dbAlias}`;
  const dbState = state.dbStates[key] ?? {};
  const tunnel = dbState.tunnel ?? Status.IDLE;
  const lastSeen = dbState.lastSeen ? new Date(dbState.lastSeen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "\u2014";
  const nameW = (nameMaxLength ?? C.NAME) - 1;
  return /* @__PURE__ */ jsxs5(Box6, { paddingLeft: C.GUTTER, children: [
    /* @__PURE__ */ jsxs5(Box6, { width: C.DOT, children: [
      /* @__PURE__ */ jsx7(StatusDot, { status: tunnel }),
      /* @__PURE__ */ jsx7(Text7, { children: " " })
    ] }),
    /* @__PURE__ */ jsxs5(Box6, { width: C.NAME, children: [
      /* @__PURE__ */ jsx7(
        MarqueeText,
        {
          text: db.dbAlias,
          width: nameW,
          isActive: isFocused,
          color: isFocused ? "cyan" : void 0
        }
      ),
      /* @__PURE__ */ jsx7(Text7, { children: " " })
    ] }),
    /* @__PURE__ */ jsxs5(Box6, { width: C.TYPE, children: [
      /* @__PURE__ */ jsx7(Text7, { dimColor: true, children: (db.type ?? "?").slice(0, C.TYPE - 1).padEnd(C.TYPE - 1) }),
      /* @__PURE__ */ jsx7(Text7, { children: " " })
    ] }),
    /* @__PURE__ */ jsx7(Box6, { width: C.STATUS, children: /* @__PURE__ */ jsx7(StatusLabel, { status: tunnel, isFocused: false }) }),
    /* @__PURE__ */ jsxs5(Box6, { width: C.PORT, children: [
      /* @__PURE__ */ jsxs5(Text7, { color: isFocused ? "cyan" : "gray", children: [
        ":",
        db.port ?? "?"
      ] }),
      /* @__PURE__ */ jsx7(Text7, { children: "  " })
    ] }),
    /* @__PURE__ */ jsx7(Box6, { width: C.SEEN, children: /* @__PURE__ */ jsx7(Text7, { dimColor: true, children: lastSeen }) }),
    isFocused && /* @__PURE__ */ jsx7(Text7, { color: "cyan", children: " [\u2192]" })
  ] });
}
function buildItems(envs, expandedEnvs, hiddenEnvs, hiddenDbs, showHiddenEnvs, showHiddenDbsFor) {
  const items = [];
  const visibleEnvs = envs.filter((e) => showHiddenEnvs || !hiddenEnvs.includes(e.envAlias));
  for (const env of visibleEnvs) {
    items.push({ type: "env", env });
    if (!expandedEnvs.has(env.envAlias)) continue;
    items.push({ type: "colheader", env });
    const showHidden = showHiddenDbsFor === env.envAlias;
    const visibleDbs = env.dbs.filter((db) => {
      const k = `${env.envAlias}/${db.dbAlias}`;
      return showHidden || !hiddenDbs.includes(k);
    });
    for (const db of visibleDbs) items.push({ type: "db", db, env });
    const hiddenCount = env.dbs.filter((db) => hiddenDbs.includes(`${env.envAlias}/${db.dbAlias}`)).length;
    if (hiddenCount > 0 && !showHidden) {
      items.push({ type: "show_hidden_dbs", env, count: hiddenCount });
    }
  }
  const hiddenEnvCount = envs.filter((e) => hiddenEnvs.includes(e.envAlias)).length;
  if (hiddenEnvCount > 0 && !showHiddenEnvs) {
    items.push({ type: "show_hidden_envs", count: hiddenEnvCount });
  }
  return items;
}
function useTunnelToggle() {
  const { state, dispatch: dispatch2 } = useAppContext();
  return useCallback4(async (db, envAlias) => {
    const key = `${envAlias}/${db.dbAlias}`;
    const tunnel = state.dbStates[key]?.tunnel ?? Status.IDLE;
    if (tunnel === Status.CONNECTED || tunnel === Status.CONNECTING) {
      dispatch2({ type: "SET_DB_TUNNEL_STATUS", dbKey: key, status: Status.DISCONNECTING });
      closeTunnel(db.dbAlias).then(() => {
        dispatch2({ type: "SET_DB_TUNNEL_STATUS", dbKey: key, status: Status.IDLE });
        logger.info(`Tunnel closed: ${db.dbAlias}`, { env: envAlias, db: db.dbAlias });
      }).catch((err) => {
        dispatch2({ type: "SET_DB_TUNNEL_STATUS", dbKey: key, status: Status.FAILED });
        logger.error(`Tunnel close failed: ${err.message}`, { env: envAlias, db: db.dbAlias });
      });
    } else {
      dispatch2({ type: "SET_DB_TUNNEL_STATUS", dbKey: key, status: Status.CONNECTING });
      openTunnel(db.dbAlias).then((info) => {
        dispatch2({ type: "SET_DB_TUNNEL_STATUS", dbKey: key, status: Status.CONNECTED, tunnelInfo: info });
        logger.info(`Tunnel opened: ${db.dbAlias} :${info?.port}`, { env: envAlias, db: db.dbAlias });
      }).catch((err) => {
        dispatch2({ type: "SET_DB_TUNNEL_STATUS", dbKey: key, status: Status.FAILED });
        logger.error(`Tunnel open failed: ${err.message}`, { env: envAlias, db: db.dbAlias });
      });
    }
  }, [state.dbStates, dispatch2]);
}
function Dashboard() {
  const { state, dispatch: dispatch2 } = useAppContext();
  const { goTo, quit } = useNavigation();
  const { stdout } = useStdout2();
  const { poll } = usePolling();
  const toggleTunnel = useTunnelToggle();
  const [cursor, setCursor] = useState4(0);
  const [scrollOffset, setScrollOffset] = useState4(0);
  const [showHiddenEnvs, setShowHiddenEnvs] = useState4(false);
  const [showHiddenDbsFor, setShowHiddenDbsFor] = useState4(null);
  const hiddenEnvs = state.settings.hiddenEnvs ?? [];
  const hiddenDbs = state.settings.hiddenDbs ?? [];
  const nameMax = state.settings.nameMaxLength ?? C.NAME;
  const cols = stdout?.columns ?? 80;
  const rows = stdout?.rows ?? 24;
  const contentHeight = Math.max(4, rows - 5);
  const items = useMemo(
    () => buildItems(state.envs, state.expandedEnvs, hiddenEnvs, hiddenDbs, showHiddenEnvs, showHiddenDbsFor),
    [state.envs, state.expandedEnvs, hiddenEnvs, hiddenDbs, showHiddenEnvs, showHiddenDbsFor]
  );
  const clamp = useCallback4((n) => Math.max(0, Math.min(n, items.length - 1)), [items.length]);
  useEffect5(() => {
    if (cursor < scrollOffset) setScrollOffset(cursor);
    else if (cursor >= scrollOffset + contentHeight) setScrollOffset(cursor - contentHeight + 1);
  }, [cursor, scrollOffset, contentHeight]);
  const mouseHandler = useCallback4((event) => {
    if (event.type !== "mousedown") return;
    const { x, y } = event;
    const itemIdx = scrollOffset + (y - HEADER_ROWS - 1);
    if (itemIdx < 0 || itemIdx >= items.length) return;
    const item = items[itemIdx];
    if (!item) return;
    setCursor(itemIdx);
    if (item.type === "db") {
      const statusX1 = COL_STATUS_START + 1;
      const statusX2 = COL_STATUS_START + C.STATUS;
      if (x >= statusX1 && x <= statusX2) {
        toggleTunnel(item.db, item.env.envAlias);
        return;
      }
      const arrowX1 = COL_ARROW_START + 1;
      if (x >= arrowX1) {
        goTo.dbDetail({ envAlias: item.env.envAlias, dbAlias: item.db.dbAlias });
        return;
      }
      toggleTunnel(item.db, item.env.envAlias);
    }
    if (item.type === "env") {
      dispatch2({ type: "TOGGLE_ENV_EXPANDED", envAlias: item.env.envAlias });
    }
    if (item.type === "show_hidden_dbs") setShowHiddenDbsFor(item.env.envAlias);
    if (item.type === "show_hidden_envs") setShowHiddenEnvs(true);
  }, [items, scrollOffset, toggleTunnel, goTo, dispatch2]);
  const persistSettings = useCallback4(async (patch) => {
    const next = { ...state.settings, ...patch };
    dispatch2({ type: "SET_SETTINGS", settings: next });
    await saveSettings(next).catch(() => {
    });
  }, [state.settings, dispatch2]);
  useInput3((input, key) => {
    if (state.portEditor) return;
    if (key.upArrow) {
      setCursor((c) => clamp(c - 1));
      return;
    }
    if (key.downArrow) {
      setCursor((c) => clamp(c + 1));
      return;
    }
    const item = items[cursor];
    if (!item) return;
    if (key.return || input === " ") {
      if (item.type === "env") {
        dispatch2({ type: "TOGGLE_ENV_EXPANDED", envAlias: item.env.envAlias });
      } else if (item.type === "db") {
        toggleTunnel(item.db, item.env.envAlias);
      } else if (item.type === "show_hidden_dbs") {
        setShowHiddenDbsFor(item.env.envAlias);
      } else if (item.type === "show_hidden_envs") {
        setShowHiddenEnvs(true);
      }
      return;
    }
    if (key.rightArrow) {
      if (item.type === "db") {
        goTo.dbDetail({ envAlias: item.env.envAlias, dbAlias: item.db.dbAlias });
      } else if (item.type === "env") {
        dispatch2({ type: "TOGGLE_ENV_EXPANDED", envAlias: item.env.envAlias });
      }
      return;
    }
    if (key.leftArrow && item.type === "env") {
      if (state.expandedEnvs.has(item.env.envAlias))
        dispatch2({ type: "TOGGLE_ENV_EXPANDED", envAlias: item.env.envAlias });
      return;
    }
    if (input === "d" && item.type === "db") {
      goTo.dbDetail({ envAlias: item.env.envAlias, dbAlias: item.db.dbAlias });
      return;
    }
    if (input === "o" && item.type === "db") {
      const key2 = `${item.env.envAlias}/${item.db.dbAlias}`;
      dispatch2({ type: "SET_DB_TUNNEL_STATUS", dbKey: key2, status: Status.CONNECTING });
      openTunnel(item.db.dbAlias).then((info) => {
        dispatch2({ type: "SET_DB_TUNNEL_STATUS", dbKey: key2, status: Status.CONNECTED, tunnelInfo: info });
        logger.info(`Tunnel opened: ${item.db.dbAlias}`, { env: item.env.envAlias, db: item.db.dbAlias });
      }).catch((err) => {
        dispatch2({ type: "SET_DB_TUNNEL_STATUS", dbKey: key2, status: Status.FAILED });
        logger.error(`Tunnel open failed: ${err.message}`, { env: item.env.envAlias, db: item.db.dbAlias });
      });
      return;
    }
    if (input === "c" && item.type === "db") {
      const key2 = `${item.env.envAlias}/${item.db.dbAlias}`;
      dispatch2({ type: "SET_DB_TUNNEL_STATUS", dbKey: key2, status: Status.DISCONNECTING });
      closeTunnel(item.db.dbAlias).then(() => {
        dispatch2({ type: "SET_DB_TUNNEL_STATUS", dbKey: key2, status: Status.IDLE });
        logger.info(`Tunnel closed: ${item.db.dbAlias}`, { env: item.env.envAlias, db: item.db.dbAlias });
      }).catch((err) => {
        dispatch2({ type: "SET_DB_TUNNEL_STATUS", dbKey: key2, status: Status.FAILED });
        logger.error(`Tunnel close failed: ${err.message}`, { env: item.env.envAlias, db: item.db.dbAlias });
      });
      return;
    }
    if (input === "O" && item.type === "env") {
      openAll(item.env.envAlias).catch((err) => logger.error(`Open all failed: ${err.message}`, { env: item.env.envAlias }));
      return;
    }
    if (input === "C" && item.type === "env") {
      closeAll(item.env.envAlias).catch((err) => logger.error(`Close all failed: ${err.message}`, { env: item.env.envAlias }));
      return;
    }
    if (input === "h") {
      if (item.type === "db") {
        const dbKey = `${item.env.envAlias}/${item.db.dbAlias}`;
        const hiddenDbs2 = [...state.settings.hiddenDbs ?? [], dbKey];
        persistSettings({ hiddenDbs: hiddenDbs2 });
        logger.info(`${item.db.dbAlias} hidden`, { env: item.env.envAlias, db: item.db.dbAlias });
      } else if (item.type === "env") {
        const hiddenEnvs2 = [...state.settings.hiddenEnvs ?? [], item.env.envAlias];
        persistSettings({ hiddenEnvs: hiddenEnvs2 });
        logger.info(`env ${item.env.envAlias} hidden`);
      }
      setCursor((c) => clamp(c));
      return;
    }
    if (input === "p" && item.type === "db") {
      dispatch2({ type: "OPEN_PORT_EDITOR", dbKey: `${item.env.envAlias}/${item.db.dbAlias}`, dbAlias: item.db.dbAlias });
      return;
    }
    if (input === "r") {
      poll();
      return;
    }
    if (input === "s") {
      goTo.settings();
      return;
    }
    if (input === "l") {
      goTo.logs();
      return;
    }
    if (input === "q") {
      quit();
      return;
    }
  });
  const footer = "\u2191\u2193 nav  Enter/Spc toggle tunnel  \u2192 detail  o open  c close  p port  h hide  r refresh  s settings  l logs  Ctrl+C quit";
  const visibleItems = items.slice(scrollOffset, scrollOffset + contentHeight);
  return /* @__PURE__ */ jsxs5(AppLayout, { footer, mouseHandler, children: [
    state.portEditor && /* @__PURE__ */ jsx7(Box6, { justifyContent: "center", marginY: 1, children: /* @__PURE__ */ jsx7(PortEditor, {}) }),
    !state.portEditor && /* @__PURE__ */ jsxs5(Box6, { flexDirection: "column", children: [
      items.length === 0 && /* @__PURE__ */ jsxs5(Box6, { marginTop: 1, gap: 1, children: [
        /* @__PURE__ */ jsx7(Text7, { dimColor: true, children: "No environments found. Run" }),
        /* @__PURE__ */ jsx7(Text7, { color: "cyan", children: "aptunnel init" }),
        /* @__PURE__ */ jsx7(Text7, { dimColor: true, children: "to get started." })
      ] }),
      visibleItems.map((item, visIdx) => {
        const absIdx = scrollOffset + visIdx;
        const isFocused = absIdx === cursor;
        if (item.type === "colheader") {
          return /* @__PURE__ */ jsx7(ColumnHeaders, {}, `ch-${item.env.envAlias}`);
        }
        if (item.type === "env") {
          const up = item.env.dbs.filter((db) => {
            const k = `${item.env.envAlias}/${db.dbAlias}`;
            return state.dbStates[k]?.tunnel === Status.CONNECTED;
          }).length;
          return /* @__PURE__ */ jsx7(Box6, { children: /* @__PURE__ */ jsx7(
            EnvRow,
            {
              env: item.env,
              isExpanded: state.expandedEnvs.has(item.env.envAlias),
              isFocused,
              up,
              total: item.env.dbs.length
            }
          ) }, `env-${item.env.envAlias}`);
        }
        if (item.type === "db") {
          return /* @__PURE__ */ jsx7(Box6, { children: /* @__PURE__ */ jsx7(
            DbRow,
            {
              db: item.db,
              envAlias: item.env.envAlias,
              isFocused,
              nameMaxLength: nameMax
            }
          ) }, `db-${item.env.envAlias}-${item.db.dbAlias}`);
        }
        if (item.type === "show_hidden_dbs") {
          return /* @__PURE__ */ jsx7(Box6, { paddingLeft: 4, children: /* @__PURE__ */ jsxs5(Text7, { color: isFocused ? "cyan" : "gray", underline: true, children: [
            "+ show hidden (",
            item.count,
            ")"
          ] }) }, `shd-${item.env.envAlias}`);
        }
        if (item.type === "show_hidden_envs") {
          return /* @__PURE__ */ jsx7(Box6, { marginTop: 1, children: /* @__PURE__ */ jsxs5(Text7, { color: isFocused ? "cyan" : "gray", underline: true, children: [
            "+ show hidden envs (",
            item.count,
            ")"
          ] }) }, "she");
        }
        return null;
      }),
      items.length > contentHeight && /* @__PURE__ */ jsx7(Box6, { children: /* @__PURE__ */ jsxs5(Text7, { dimColor: true, children: [
        scrollOffset + 1,
        "\u2013",
        Math.min(scrollOffset + contentHeight, items.length),
        "/",
        items.length,
        scrollOffset + contentHeight < items.length ? "  \u2193" : ""
      ] }) })
    ] })
  ] });
}

// src/screens/DbDetail.js
import React8, { useState as useState5, useEffect as useEffect6, useCallback as useCallback5, useRef as useRef5 } from "react";
import { Box as Box7, Text as Text8, useInput as useInput4, useStdout as useStdout3 } from "ink";
import { jsx as jsx8, jsxs as jsxs6 } from "react/jsx-runtime";
function fmtBytes(b) {
  if (!b) return "0 B";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(1)} GB`;
}
function fmtTime(iso) {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
var FOCUS_OPEN = "open";
var FOCUS_CLOSE = "close";
var FOCUS_PORT = "port";
var FOCUS_HIDE = "hide";
var FOCUS_CREDS = "credentials";
var FOCUS_SCHEMA = "schema";
var FOCUS_ORDER = [FOCUS_OPEN, FOCUS_CLOSE, FOCUS_PORT, FOCUS_HIDE, FOCUS_CREDS, FOCUS_SCHEMA];
function ActionBtn({ label, focused, disabled }) {
  const color = disabled ? "gray" : focused ? "black" : "cyan";
  const bg = focused && !disabled ? "cyan" : void 0;
  return /* @__PURE__ */ jsx8(Box7, { marginRight: 1, children: /* @__PURE__ */ jsxs6(Text8, { color, backgroundColor: bg, bold: focused, children: [
    "[",
    label,
    "]"
  ] }) });
}
function CredentialsSection({ tunnelInfo, visible, focused }) {
  if (!visible) {
    return /* @__PURE__ */ jsxs6(Box7, { gap: 1, children: [
      /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: "Credentials:" }),
      /* @__PURE__ */ jsx8(Text8, { children: "\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF" }),
      /* @__PURE__ */ jsx8(Box7, { marginLeft: 1, children: /* @__PURE__ */ jsx8(ActionBtn, { label: "t  Show", focused }) })
    ] });
  }
  return /* @__PURE__ */ jsxs6(Box7, { flexDirection: "column", children: [
    /* @__PURE__ */ jsxs6(Box7, { gap: 1, children: [
      /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: "Credentials:" }),
      /* @__PURE__ */ jsx8(ActionBtn, { label: "t  Hide", focused })
    ] }),
    tunnelInfo?.user && /* @__PURE__ */ jsxs6(Box7, { paddingLeft: 2, gap: 1, children: [
      /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: "User:" }),
      "    ",
      /* @__PURE__ */ jsx8(Text8, { children: tunnelInfo.user })
    ] }),
    tunnelInfo?.password && /* @__PURE__ */ jsxs6(Box7, { paddingLeft: 2, gap: 1, children: [
      /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: "Pass:" }),
      "    ",
      /* @__PURE__ */ jsx8(Text8, { children: tunnelInfo.password })
    ] }),
    tunnelInfo?.url && /* @__PURE__ */ jsxs6(Box7, { paddingLeft: 2, gap: 1, children: [
      /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: "URL: " }),
      "    ",
      /* @__PURE__ */ jsx8(Text8, { children: tunnelInfo.url })
    ] }),
    tunnelInfo?.host && /* @__PURE__ */ jsxs6(Box7, { paddingLeft: 2, gap: 1, children: [
      /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: "Host:" }),
      "    ",
      /* @__PURE__ */ jsx8(Text8, { children: tunnelInfo.host })
    ] }),
    !tunnelInfo?.user && /* @__PURE__ */ jsx8(Box7, { paddingLeft: 2, children: /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: "(Connect tunnel to load credentials)" }) })
  ] });
}
function SchemaSection({ envAlias, dbAlias, dbKey, tunnelStatus, settings, dispatch: dispatch2, focused, onLoad, schemaData, loadedAt, loading }) {
  const [open, setOpen] = useState5(true);
  const [openSchemas, setOpenSchemas] = useState5({});
  const hasData = schemaData && schemaData.length > 0;
  const needsTunnel = tunnelStatus !== Status.CONNECTED;
  return /* @__PURE__ */ jsxs6(Box7, { flexDirection: "column", children: [
    /* @__PURE__ */ jsxs6(Box7, { gap: 1, children: [
      /* @__PURE__ */ jsx8(Text8, { color: focused ? "cyan" : "white", bold: focused, children: open ? "[\u25BC]" : "[\u25B6]" }),
      /* @__PURE__ */ jsx8(Text8, { bold: true, color: focused ? "cyan" : "white", children: "Schemas" }),
      hasData && /* @__PURE__ */ jsxs6(Text8, { dimColor: true, children: [
        "(",
        schemaData.length,
        " schemas)"
      ] }),
      loading ? /* @__PURE__ */ jsx8(Text8, { color: "yellow", children: " loading\u2026" }) : loadedAt && /* @__PURE__ */ jsxs6(Text8, { dimColor: true, children: [
        " loaded: ",
        fmtTime(loadedAt)
      ] }),
      !loading && /* @__PURE__ */ jsx8(Box7, { marginLeft: 1, children: /* @__PURE__ */ jsxs6(Text8, { color: focused ? "cyan" : "gray", children: [
        "[Enter/\u27F3 ",
        hasData ? "Reload" : "Load",
        "]"
      ] }) }),
      focused && /* @__PURE__ */ jsx8(Text8, { color: "cyan", children: " \u25C0 focused" })
    ] }),
    open && /* @__PURE__ */ jsxs6(Box7, { flexDirection: "column", paddingLeft: 2, children: [
      !hasData && !loading && /* @__PURE__ */ jsxs6(Box7, { gap: 1, marginTop: 0, children: [
        /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: "No data loaded." }),
        needsTunnel ? /* @__PURE__ */ jsx8(Text8, { color: "yellow", children: "Tunnel must be open. Press Enter or [o] to open & load." }) : /* @__PURE__ */ jsx8(Text8, { color: "cyan", children: "Press Enter or \u27F3 to load schema." })
      ] }),
      hasData && schemaData.map((schema) => /* @__PURE__ */ jsxs6(Box7, { flexDirection: "column", marginTop: 0, children: [
        /* @__PURE__ */ jsxs6(Box7, { gap: 1, children: [
          /* @__PURE__ */ jsxs6(
            Text8,
            {
              color: "cyan",
              bold: true,
              onPress: () => setOpenSchemas((s) => ({ ...s, [schema.name]: !s[schema.name] })),
              children: [
                openSchemas[schema.name] ? "[\u25BC]" : "[\u25B6]",
                " ",
                schema.name
              ]
            }
          ),
          /* @__PURE__ */ jsxs6(Text8, { dimColor: true, children: [
            "(",
            schema.tables?.length ?? 0,
            " tables",
            schema.sizeBytes ? `, ${fmtBytes(schema.sizeBytes)}` : "",
            ")"
          ] })
        ] }),
        openSchemas[schema.name] && schema.tables?.length > 0 && /* @__PURE__ */ jsx8(Box7, { flexDirection: "column", paddingLeft: 2, children: schema.tables.map((t) => /* @__PURE__ */ jsxs6(Text8, { dimColor: true, children: [
          "  ",
          t.name ?? t
        ] }, t.name ?? t)) })
      ] }, schema.name))
    ] })
  ] });
}
function DbDetail({ params }) {
  const { envAlias, dbAlias } = params ?? {};
  const { state, dispatch: dispatch2 } = useAppContext();
  const { pop, goTo } = useNavigation();
  const { stdout } = useStdout3();
  const cols = stdout?.columns ?? 80;
  const dbKey = `${envAlias}/${dbAlias}`;
  const dbState = state.dbStates[dbKey] ?? {};
  const tunnel = dbState.tunnel ?? Status.IDLE;
  const tunnelInfo = dbState.tunnelInfo ?? null;
  const credVisible = dbState.credentialsVisible ?? false;
  const env = state.envs.find((e) => e.envAlias === envAlias);
  const dbs = env?.dbs ?? [];
  const currentIdx = dbs.findIndex((d) => d.dbAlias === dbAlias);
  const prevDb = currentIdx > 0 ? dbs[currentIdx - 1] : null;
  const nextDb = currentIdx < dbs.length - 1 ? dbs[currentIdx + 1] : null;
  const db = dbs[currentIdx];
  const [focusIdx, setFocusIdx] = useState5(0);
  const focusItem = FOCUS_ORDER[focusIdx] ?? FOCUS_OPEN;
  const focusNext = useCallback5(() => setFocusIdx((i) => (i + 1) % FOCUS_ORDER.length), []);
  const focusPrev = useCallback5(() => setFocusIdx((i) => (i - 1 + FOCUS_ORDER.length) % FOCUS_ORDER.length), []);
  const [confirmPrompt, setConfirmPrompt] = useState5(null);
  const [schemaData, setSchemaData] = useState5(null);
  const [loadedAt, setLoadedAt] = useState5(null);
  const [loading, setLoading] = useState5(false);
  useEffect6(() => {
    loadCache(envAlias, dbAlias).then((cached) => {
      if (cached) {
        setSchemaData(cached.schemas ?? null);
        setLoadedAt(cached.savedAt ?? null);
      }
    });
  }, [envAlias, dbAlias]);
  const handleOpen = useCallback5(async () => {
    dispatch2({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.CONNECTING });
    try {
      const info = await openTunnel(dbAlias);
      dispatch2({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.CONNECTED, tunnelInfo: info });
      logger.info(`Tunnel opened: ${dbAlias} :${info?.port}`, { env: envAlias, db: dbAlias });
      return true;
    } catch (err) {
      dispatch2({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.FAILED });
      logger.error(`Tunnel open failed: ${err.message}`, { env: envAlias, db: dbAlias });
      return false;
    }
  }, [dbKey, dbAlias, envAlias, dispatch2]);
  const handleClose = useCallback5(async () => {
    dispatch2({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.DISCONNECTING });
    try {
      await closeTunnel(dbAlias);
      dispatch2({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.IDLE });
      logger.info(`Tunnel closed: ${dbAlias}`, { env: envAlias, db: dbAlias });
    } catch (err) {
      dispatch2({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.FAILED });
      logger.error(`Tunnel close failed: ${err.message}`, { env: envAlias, db: dbAlias });
    }
  }, [dbKey, dbAlias, envAlias, dispatch2]);
  const handleHide = useCallback5(() => {
    dispatch2({ type: "HIDE_DB", dbKey });
    pop();
  }, [dbKey, dispatch2, pop]);
  const doLoadSchema = useCallback5(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const schemas = [
        { name: "public", tables: [], views: [], indexes: [], triggers: [], functions: [], sizeBytes: 0 }
      ];
      const now = (/* @__PURE__ */ new Date()).toISOString();
      setSchemaData(schemas);
      setLoadedAt(now);
      await saveCache(envAlias, dbAlias, { schemas, savedAt: now });
      logger.info(`Schema loaded: ${dbAlias}`, { env: envAlias, db: dbAlias });
    } catch (err) {
      logger.error(`Schema load failed: ${err.message}`, { env: envAlias, db: dbAlias });
    } finally {
      setLoading(false);
    }
  }, [loading, envAlias, dbAlias]);
  const handleSchemaLoad = useCallback5(async () => {
    if (tunnel === Status.CONNECTED) {
      doLoadSchema();
      return;
    }
    const pref = state.settings.autoOpenTunnel ?? AutoOpenTunnel.ASK;
    if (pref === AutoOpenTunnel.ALWAYS) {
      const ok = await handleOpen();
      if (ok) doLoadSchema();
      return;
    }
    if (pref === AutoOpenTunnel.ASK) {
      setConfirmPrompt("schema_open");
      return;
    }
    logger.warn("Schema load skipped: tunnel closed and auto-open is disabled.", { env: envAlias, db: dbAlias });
  }, [tunnel, state.settings.autoOpenTunnel, doLoadSchema, handleOpen, envAlias, dbAlias]);
  const activateFocused = useCallback5(() => {
    switch (focusItem) {
      case FOCUS_OPEN:
        handleOpen();
        break;
      case FOCUS_CLOSE:
        handleClose();
        break;
      case FOCUS_PORT:
        dispatch2({ type: "OPEN_PORT_EDITOR", dbKey, dbAlias });
        break;
      case FOCUS_HIDE:
        handleHide();
        break;
      case FOCUS_CREDS:
        dispatch2({ type: "TOGGLE_CREDENTIALS", dbKey });
        break;
      case FOCUS_SCHEMA:
        handleSchemaLoad();
        break;
    }
  }, [focusItem, handleOpen, handleClose, handleHide, handleSchemaLoad, dispatch2, dbKey, dbAlias]);
  useInput4((input, key) => {
    if (state.portEditor) return;
    if (confirmPrompt) {
      if (input === "y" || input === "Y") {
        setConfirmPrompt(null);
        handleOpen().then((ok) => {
          if (ok) doLoadSchema();
        });
      } else if (input === "n" || input === "N" || key.escape) {
        setConfirmPrompt(null);
      }
      return;
    }
    if (key.escape) {
      pop();
      return;
    }
    if (key.tab && !key.shift) {
      focusNext();
      return;
    }
    if (key.tab && key.shift) {
      focusPrev();
      return;
    }
    if (key.leftArrow && prevDb) {
      goTo.dbDetail({ envAlias, dbAlias: prevDb.dbAlias });
      return;
    }
    if (key.rightArrow && nextDb) {
      goTo.dbDetail({ envAlias, dbAlias: nextDb.dbAlias });
      return;
    }
    if (key.return || input === " ") {
      activateFocused();
      return;
    }
    if (input === "o") {
      handleOpen();
      return;
    }
    if (input === "c") {
      handleClose();
      return;
    }
    if (input === "t") {
      dispatch2({ type: "TOGGLE_CREDENTIALS", dbKey });
      return;
    }
    if (input === "p") {
      dispatch2({ type: "OPEN_PORT_EDITOR", dbKey, dbAlias });
      return;
    }
    if (input === "h") {
      handleHide();
      return;
    }
    if (input === "s") {
      handleSchemaLoad();
      return;
    }
  });
  const div = "\u2500".repeat(Math.min(cols - 2, 60));
  const footer = "Tab focus  Enter activate  \u2190 prev  \u2192 next  o open  c close  t creds  p port  s schema  h hide  Esc back";
  return /* @__PURE__ */ jsxs6(AppLayout, { footer, children: [
    state.portEditor && /* @__PURE__ */ jsx8(Box7, { justifyContent: "center", marginY: 1, children: /* @__PURE__ */ jsx8(PortEditor, {}) }),
    !state.portEditor && /* @__PURE__ */ jsxs6(Box7, { flexDirection: "column", paddingLeft: 1, gap: 0, children: [
      /* @__PURE__ */ jsxs6(Box7, { gap: 1, flexWrap: "nowrap", children: [
        prevDb ? /* @__PURE__ */ jsxs6(Text8, { color: "cyan", children: [
          "[\u2190 ",
          prevDb.dbAlias,
          "]"
        ] }) : /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: "[\u2190 \u2014]" }),
        /* @__PURE__ */ jsxs6(Text8, { dimColor: true, children: [
          " ",
          envAlias,
          " \u203A "
        ] }),
        /* @__PURE__ */ jsx8(Text8, { bold: true, color: "cyan", children: dbAlias }),
        /* @__PURE__ */ jsxs6(Text8, { dimColor: true, children: [
          " (",
          db?.type ?? "?",
          ")"
        ] }),
        nextDb ? /* @__PURE__ */ jsxs6(Text8, { color: "cyan", children: [
          " [",
          nextDb.dbAlias,
          " \u2192]"
        ] }) : /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: " [\u2014 \u2192]" }),
        /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: "  [Esc back]" })
      ] }),
      /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: div }),
      /* @__PURE__ */ jsxs6(Box7, { gap: 2, marginTop: 0, alignItems: "flex-start", children: [
        /* @__PURE__ */ jsxs6(Box7, { gap: 1, children: [
          /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: "Status:" }),
          /* @__PURE__ */ jsx8(StatusDot, { status: tunnel }),
          /* @__PURE__ */ jsx8(StatusBadge, { status: tunnel })
        ] }),
        /* @__PURE__ */ jsxs6(Text8, { dimColor: true, children: [
          "Port: :",
          db?.port ?? "?"
        ] })
      ] }),
      /* @__PURE__ */ jsxs6(Box7, { gap: 0, marginTop: 1, flexWrap: "nowrap", children: [
        /* @__PURE__ */ jsx8(ActionBtn, { label: "o Open", focused: focusItem === FOCUS_OPEN, disabled: tunnel === Status.CONNECTED || tunnel === Status.CONNECTING }),
        /* @__PURE__ */ jsx8(ActionBtn, { label: "c Close", focused: focusItem === FOCUS_CLOSE, disabled: tunnel === Status.IDLE }),
        /* @__PURE__ */ jsx8(ActionBtn, { label: "p Port", focused: focusItem === FOCUS_PORT }),
        /* @__PURE__ */ jsx8(ActionBtn, { label: "h Hide", focused: focusItem === FOCUS_HIDE })
      ] }),
      /* @__PURE__ */ jsx8(Box7, { marginTop: 1, children: /* @__PURE__ */ jsx8(
        CredentialsSection,
        {
          tunnelInfo,
          visible: credVisible,
          focused: focusItem === FOCUS_CREDS
        }
      ) }),
      /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: div }),
      confirmPrompt && /* @__PURE__ */ jsxs6(Box7, { marginY: 1, gap: 1, children: [
        /* @__PURE__ */ jsx8(Text8, { color: "yellow", children: "\u26A0  Tunnel must be open to load schema." }),
        /* @__PURE__ */ jsx8(Text8, { bold: true, color: "cyan", children: "Open tunnel now? [Y/n]" })
      ] }),
      (db?.type === DbType.POSTGRES || db?.type === DbType.MYSQL || !db?.type) && /* @__PURE__ */ jsx8(
        SchemaSection,
        {
          envAlias,
          dbAlias,
          dbKey,
          tunnelStatus: tunnel,
          settings: state.settings,
          dispatch: dispatch2,
          focused: focusItem === FOCUS_SCHEMA,
          onLoad: handleSchemaLoad,
          schemaData,
          loadedAt,
          loading
        }
      ),
      db?.type === DbType.REDIS && /* @__PURE__ */ jsxs6(Box7, { flexDirection: "column", gap: 1, marginTop: 1, children: [
        /* @__PURE__ */ jsx8(Text8, { bold: true, children: "Keyspace" }),
        /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: "Connect tunnel to browse keyspace data." })
      ] }),
      db?.type === DbType.ELASTICSEARCH && /* @__PURE__ */ jsxs6(Box7, { flexDirection: "column", gap: 1, marginTop: 1, children: [
        /* @__PURE__ */ jsx8(Text8, { bold: true, children: "Indices" }),
        /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: "Connect tunnel to browse index data." })
      ] }),
      dbState.error && /* @__PURE__ */ jsx8(Box7, { marginTop: 1, children: /* @__PURE__ */ jsxs6(Text8, { color: "red", children: [
        "\u2716 ",
        dbState.error
      ] }) }),
      /* @__PURE__ */ jsxs6(Box7, { marginTop: 1, children: [
        /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: "Tab to cycle focus  \xB7  focused: " }),
        /* @__PURE__ */ jsx8(Text8, { color: "cyan", children: focusItem })
      ] })
    ] })
  ] });
}

// src/screens/ConfigEditor.js
import React9, { useState as useState6, useEffect as useEffect7 } from "react";
import { Box as Box8, Text as Text9, useInput as useInput5 } from "ink";
import TextInput3 from "ink-text-input";
import { writeFile as writeFile2 } from "fs/promises";
import { jsx as jsx9, jsxs as jsxs7 } from "react/jsx-runtime";
function ConfigEditor() {
  const { state } = useAppContext();
  const { pop } = useNavigation();
  const [config, setConfig] = useState6(null);
  const [raw, setRaw] = useState6("");
  const [loading, setLoading] = useState6(true);
  const [error, setError] = useState6(null);
  const [cursor, setCursor] = useState6(0);
  const [dbCursor, setDbCursor] = useState6(0);
  const [editing, setEditing] = useState6(null);
  const [editValue, setEditValue] = useState6("");
  const [saved, setSaved] = useState6(false);
  const [dirty, setDirty] = useState6(false);
  useEffect7(() => {
    (async () => {
      try {
        const [rawStr, parsed] = await Promise.all([
          getRawConfig().catch(() => ""),
          loadAptunnelConfig()
        ]);
        setRaw(rawStr);
        setConfig(parsed);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  const envEntries = config?.environments ? Object.entries(config.environments) : [];
  function startEdit(envIdx, dbIdx, field, currentValue) {
    setEditing({ envIdx, dbIdx, field });
    setEditValue(String(currentValue ?? ""));
  }
  function commitEdit() {
    if (!editing || !config) return;
    const { envIdx, dbIdx, field } = editing;
    const newConfig = JSON.parse(JSON.stringify(config));
    const envKey = Object.keys(newConfig.environments)[envIdx];
    if (dbIdx === -1) {
      newConfig.environments[envKey][field] = editValue;
    } else {
      const dbKey = Object.keys(newConfig.environments[envKey].databases)[dbIdx];
      if (field === "port") {
        const p = parseInt(editValue, 10);
        if (!isNaN(p)) newConfig.environments[envKey].databases[dbKey][field] = p;
      } else {
        newConfig.environments[envKey].databases[dbKey][field] = editValue;
      }
    }
    setConfig(newConfig);
    setDirty(true);
    setEditing(null);
  }
  async function handleSave() {
    if (!config) return;
    try {
      const { stringify } = await import("yaml");
      const yamlStr = stringify(config);
      await writeFile2(aptunnelConfigPath(), yamlStr, "utf8");
      setDirty(false);
      setSaved(true);
      logger.info("aptunnel config saved");
      setTimeout(() => setSaved(false), 2e3);
    } catch (err) {
      setError(`Save failed: ${err.message}`);
      logger.error(`Config save failed: ${err.message}`);
    }
  }
  useInput5((input, key) => {
    if (editing) {
      if (key.return) {
        commitEdit();
        return;
      }
      if (key.escape) {
        setEditing(null);
        return;
      }
      return;
    }
    if (key.escape) {
      if (dirty) setDirty(false);
      pop();
      return;
    }
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(envEntries.length - 1, c + 1));
      return;
    }
    if (key.ctrl && input === "s") {
      handleSave();
      return;
    }
  });
  const footer = "[\u2191\u2193] navigate  [Enter] edit  [Ctrl+S] save  [Esc] back  [Ctrl+C] quit";
  return /* @__PURE__ */ jsx9(AppLayout, { footer, children: /* @__PURE__ */ jsxs7(Box8, { flexDirection: "column", gap: 1, paddingTop: 1, children: [
    /* @__PURE__ */ jsxs7(Box8, { gap: 1, children: [
      /* @__PURE__ */ jsx9(Text9, { bold: true, color: "cyan", children: "aptunnel Config Editor" }),
      /* @__PURE__ */ jsx9(Text9, { dimColor: true, children: aptunnelConfigPath() })
    ] }),
    loading && /* @__PURE__ */ jsx9(Text9, { color: "yellow", children: "Loading\u2026" }),
    error && /* @__PURE__ */ jsxs7(Text9, { color: "red", children: [
      "\u2716 ",
      error
    ] }),
    !loading && !error && config && /* @__PURE__ */ jsx9(Box8, { flexDirection: "column", gap: 1, children: envEntries.map(([envKey, env], envIdx) => {
      const isFocused = envIdx === cursor;
      const dbEntries = env.databases ? Object.entries(env.databases) : [];
      return /* @__PURE__ */ jsxs7(Box8, { flexDirection: "column", children: [
        /* @__PURE__ */ jsxs7(Box8, { gap: 2, paddingLeft: 0, children: [
          /* @__PURE__ */ jsx9(Text9, { bold: true, color: isFocused ? "cyan" : "white", children: envKey }),
          /* @__PURE__ */ jsxs7(Box8, { gap: 1, children: [
            /* @__PURE__ */ jsx9(Text9, { dimColor: true, children: "alias:" }),
            editing?.envIdx === envIdx && editing?.dbIdx === -1 && editing?.field === "alias" ? /* @__PURE__ */ jsx9(TextInput3, { value: editValue, onChange: setEditValue, onSubmit: commitEdit }) : /* @__PURE__ */ jsx9(
              Text9,
              {
                color: "cyan",
                underline: isFocused,
                onPress: () => isFocused && startEdit(envIdx, -1, "alias", env.alias),
                children: env.alias ?? envKey
              }
            )
          ] })
        ] }),
        isFocused && dbEntries.map(([dbKey, db], dbIdx) => /* @__PURE__ */ jsxs7(Box8, { paddingLeft: 2, gap: 2, children: [
          /* @__PURE__ */ jsx9(Box8, { width: 20, children: /* @__PURE__ */ jsx9(Text9, { children: dbKey }) }),
          /* @__PURE__ */ jsxs7(Box8, { gap: 1, children: [
            /* @__PURE__ */ jsx9(Text9, { dimColor: true, children: "alias:" }),
            editing?.envIdx === envIdx && editing?.dbIdx === dbIdx && editing?.field === "alias" ? /* @__PURE__ */ jsx9(TextInput3, { value: editValue, onChange: setEditValue, onSubmit: commitEdit }) : /* @__PURE__ */ jsx9(Text9, { color: "cyan", children: db.alias ?? dbKey })
          ] }),
          /* @__PURE__ */ jsxs7(Box8, { gap: 1, children: [
            /* @__PURE__ */ jsx9(Text9, { dimColor: true, children: "port:" }),
            editing?.envIdx === envIdx && editing?.dbIdx === dbIdx && editing?.field === "port" ? /* @__PURE__ */ jsx9(TextInput3, { value: editValue, onChange: setEditValue, onSubmit: commitEdit }) : /* @__PURE__ */ jsx9(Text9, { color: "cyan", children: db.port ?? "\u2014" })
          ] }),
          /* @__PURE__ */ jsx9(Text9, { dimColor: true, children: db.type ?? "?" })
        ] }, dbKey))
      ] }, envKey);
    }) }),
    saved && /* @__PURE__ */ jsx9(Text9, { color: "green", children: "\u2714 Config saved" }),
    dirty && !saved && /* @__PURE__ */ jsx9(Text9, { dimColor: true, children: "Unsaved changes \u2014 [Ctrl+S] to save, [Esc] to discard" })
  ] }) });
}

// src/screens/Settings.js
import React10, { useState as useState7 } from "react";
import { Box as Box9, Text as Text10, useInput as useInput6 } from "ink";
import { jsx as jsx10, jsxs as jsxs8 } from "react/jsx-runtime";
var ROWS = [
  { key: "pollingInterval", label: "Polling interval", options: [3, 5, 10, 30, 60], suffix: "s" },
  { key: "autoOpenTunnel", label: "Auto-open tunnel", options: [AutoOpenTunnel.ASK, AutoOpenTunnel.ALWAYS, AutoOpenTunnel.NEVER] },
  { key: "backgroundPreload", label: "Background preload", options: [true, false], format: (v) => v ? "ON \u2713" : "OFF" },
  { key: "logRetention", label: "Log retention", options: [7, 14, 30, 60, 90], suffix: "d" },
  { key: "theme", label: "Theme", options: ["dark", "light"] },
  { key: "nameMaxLength", label: "Name truncate at", options: [12, 15, 18, 22, 28, 36], suffix: "ch" }
];
function Settings() {
  const { state, dispatch: dispatch2 } = useAppContext();
  const { pop, goTo } = useNavigation();
  const [cursor, setCursor] = useState7(0);
  const [saved, setSaved] = useState7(false);
  const [dirty, setDirty] = useState7(false);
  const [aptVersion, setAptVersion] = useState7(null);
  const [clearConfirm, setClearConfirm] = useState7(false);
  const [localSettings, setLocalSettings] = useState7(state.settings);
  const totalRows = ROWS.length + 4;
  function cycleOption(rowKey) {
    const row = ROWS.find((r) => r.key === rowKey);
    if (!row) return;
    const idx = row.options.indexOf(localSettings[rowKey]);
    const next = row.options[(idx + 1) % row.options.length];
    setLocalSettings((prev) => ({ ...prev, [rowKey]: next }));
    setDirty(true);
  }
  async function save() {
    dispatch2({ type: "SET_SETTINGS", settings: localSettings });
    await saveSettings(localSettings).catch(() => {
    });
    setSaved(true);
    setDirty(false);
    logger.info("Settings saved");
    setTimeout(() => setSaved(false), 2e3);
  }
  async function checkAptVersion() {
    const v = await getAptunnelVersion();
    setAptVersion(v ?? "not found");
  }
  async function handleClearCache() {
    if (!clearConfirm) {
      setClearConfirm(true);
      return;
    }
    await clearAllCache().catch(() => {
    });
    setClearConfirm(false);
    logger.info("Cache cleared by user");
  }
  useInput6((input, key) => {
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(totalRows - 1, c + 1));
      return;
    }
    if (key.escape) {
      if (dirty) setLocalSettings(state.settings);
      pop();
      return;
    }
    if (key.ctrl && input === "s") {
      save();
      return;
    }
    const row = ROWS[cursor];
    if ((key.return || input === " ") && row) {
      cycleOption(row.key);
      return;
    }
    if (key.leftArrow && row) {
      const idx = row.options.indexOf(localSettings[row.key]);
      const prev = row.options[(idx - 1 + row.options.length) % row.options.length];
      setLocalSettings((s) => ({ ...s, [row.key]: prev }));
      setDirty(true);
      return;
    }
    if (key.rightArrow && row) {
      cycleOption(row.key);
      return;
    }
    if (key.return) {
      if (cursor === ROWS.length + 1) checkAptVersion();
      if (cursor === ROWS.length + 2) {
      }
      if (cursor === ROWS.length + 3) handleClearCache();
    }
    if (input === "y" && clearConfirm) handleClearCache();
    if (input === "n" && clearConfirm) setClearConfirm(false);
  });
  function displayValue(row) {
    const v = localSettings[row.key];
    if (row.format) return row.format(v);
    return `${v}${row.suffix ?? ""}`;
  }
  const footer = "[\u2191\u2193] nav  [Space/\u2190\u2192] change  [Ctrl+S] save  [Esc] back  [Ctrl+C] quit";
  return /* @__PURE__ */ jsx10(AppLayout, { footer, children: /* @__PURE__ */ jsxs8(Box9, { flexDirection: "column", gap: 0, paddingTop: 1, children: [
    ROWS.map((row, i) => /* @__PURE__ */ jsxs8(Box9, { gap: 1, children: [
      /* @__PURE__ */ jsx10(Box9, { width: 22, children: /* @__PURE__ */ jsxs8(Text10, { color: cursor === i ? "cyan" : "white", bold: cursor === i, children: [
        row.label,
        ":"
      ] }) }),
      /* @__PURE__ */ jsx10(Box9, { borderStyle: cursor === i ? "single" : void 0, borderColor: "cyan", paddingX: cursor === i ? 1 : 0, children: /* @__PURE__ */ jsxs8(Text10, { color: "cyan", children: [
        "[",
        displayValue(row),
        " \u25BE]"
      ] }) })
    ] }, row.key)),
    /* @__PURE__ */ jsx10(Text10, { children: " " }),
    /* @__PURE__ */ jsxs8(Text10, { dimColor: true, children: [
      "\u2500\u2500\u2500 Version info ",
      "\u2500".repeat(42)
    ] }),
    /* @__PURE__ */ jsxs8(Box9, { gap: 1, children: [
      /* @__PURE__ */ jsx10(Box9, { width: 24, children: /* @__PURE__ */ jsx10(Text10, { dimColor: true, children: "aptunnel-gui version:" }) }),
      /* @__PURE__ */ jsx10(Text10, { children: APP_VERSION })
    ] }),
    /* @__PURE__ */ jsxs8(Box9, { gap: 1, children: [
      /* @__PURE__ */ jsx10(Box9, { width: 24, children: /* @__PURE__ */ jsx10(Text10, { dimColor: true, children: "aptunnel version:" }) }),
      /* @__PURE__ */ jsx10(Text10, { children: aptVersion ?? /* @__PURE__ */ jsx10(Text10, { dimColor: true, children: "\u2014" }) }),
      /* @__PURE__ */ jsx10(Text10, { color: "cyan", underline: true, dimColor: true, children: "[Enter] Check" })
    ] }),
    /* @__PURE__ */ jsxs8(Box9, { gap: 1, children: [
      /* @__PURE__ */ jsx10(Box9, { width: 24, children: /* @__PURE__ */ jsx10(Text10, { dimColor: true, children: "min aptunnel required:" }) }),
      /* @__PURE__ */ jsx10(Text10, { children: MIN_APTUNNEL_VERSION })
    ] }),
    /* @__PURE__ */ jsxs8(Box9, { gap: 1, children: [
      /* @__PURE__ */ jsx10(Box9, { width: 24, children: /* @__PURE__ */ jsx10(Text10, { dimColor: true, children: "config path:" }) }),
      /* @__PURE__ */ jsx10(Text10, { dimColor: true, children: aptunnelConfigPath() })
    ] }),
    /* @__PURE__ */ jsx10(Text10, { children: " " }),
    /* @__PURE__ */ jsxs8(Text10, { dimColor: true, children: [
      "\u2500\u2500\u2500 Manage visibility ",
      "\u2500".repeat(39)
    ] }),
    /* @__PURE__ */ jsxs8(Box9, { gap: 1, children: [
      /* @__PURE__ */ jsx10(
        Text10,
        {
          color: cursor === ROWS.length + 2 ? "cyan" : "white",
          underline: true,
          children: "[Manage hidden envs & DBs \u2192]"
        }
      ),
      (localSettings.hiddenEnvs?.length > 0 || localSettings.hiddenDbs?.length > 0) && /* @__PURE__ */ jsxs8(Text10, { dimColor: true, children: [
        "(",
        localSettings.hiddenEnvs?.length ?? 0,
        " envs, ",
        localSettings.hiddenDbs?.length ?? 0,
        " DBs hidden)"
      ] })
    ] }),
    /* @__PURE__ */ jsx10(Text10, { children: " " }),
    /* @__PURE__ */ jsxs8(Text10, { dimColor: true, children: [
      "\u2500\u2500\u2500 Danger zone ",
      "\u2500".repeat(44)
    ] }),
    /* @__PURE__ */ jsxs8(Box9, { gap: 2, children: [
      /* @__PURE__ */ jsx10(
        Text10,
        {
          color: cursor === ROWS.length + 3 ? "red" : "gray",
          underline: true,
          children: "[\u2715 Clear all cache]"
        }
      ),
      /* @__PURE__ */ jsx10(
        Text10,
        {
          color: cursor === ROWS.length + 4 ? "yellow" : "gray",
          underline: true,
          children: "[Redo init wizard]"
        }
      )
    ] }),
    clearConfirm && /* @__PURE__ */ jsxs8(Box9, { marginLeft: 2, gap: 1, children: [
      /* @__PURE__ */ jsx10(Text10, { color: "red", children: "\u26A0 Clear all cached data? " }),
      /* @__PURE__ */ jsx10(Text10, { color: "red", children: "[Y] Yes  [N] Cancel" })
    ] }),
    saved && /* @__PURE__ */ jsx10(Box9, { marginTop: 1, children: /* @__PURE__ */ jsx10(Text10, { color: "green", children: "\u2714 Settings saved" }) }),
    dirty && !saved && /* @__PURE__ */ jsx10(Box9, { marginTop: 1, children: /* @__PURE__ */ jsx10(Text10, { dimColor: true, children: "Unsaved changes \u2014 [Ctrl+S] to save, [Esc] to discard" }) })
  ] }) });
}

// src/screens/Logs.js
import React11, { useState as useState8, useEffect as useEffect8, useMemo as useMemo2 } from "react";
import { Box as Box10, Text as Text11, useInput as useInput7, useStdout as useStdout4 } from "ink";
import path from "path";
import { jsx as jsx11, jsxs as jsxs9 } from "react/jsx-runtime";
var LEVEL_COLORS = {
  [LogLevel.INFO]: "blue",
  [LogLevel.WARN]: "yellow",
  [LogLevel.ERROR]: "red"
};
var LEVELS = ["all", LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
function LogRow({ entry, cols }) {
  const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const color = LEVEL_COLORS[entry.level] ?? "white";
  const source = entry.env ? entry.db ? `${entry.env} / ${entry.db}` : entry.env : "app";
  const msg = (entry.message ?? "").slice(0, cols - 48);
  return /* @__PURE__ */ jsxs9(Box10, { gap: 1, children: [
    /* @__PURE__ */ jsx11(Box10, { width: 10, children: /* @__PURE__ */ jsx11(Text11, { dimColor: true, children: time }) }),
    /* @__PURE__ */ jsx11(Box10, { width: 7, children: /* @__PURE__ */ jsx11(Text11, { color, bold: true, children: entry.level }) }),
    /* @__PURE__ */ jsx11(Box10, { width: 28, children: /* @__PURE__ */ jsx11(Text11, { dimColor: true, children: source.slice(0, 27) }) }),
    /* @__PURE__ */ jsx11(Text11, { children: msg })
  ] });
}
function Logs() {
  const { state, dispatch: dispatch2 } = useAppContext();
  const { pop } = useNavigation();
  const { stdout } = useStdout4();
  const cols = stdout?.columns ?? 80;
  const [scroll, setScroll] = useState8(0);
  const [filterLevel, setFilterLevel] = useState8("all");
  const [filterEnv, setFilterEnv] = useState8("all");
  const [filterDate, setFilterDate] = useState8("today");
  const [availableDates, setAvailableDates] = useState8(["today"]);
  const [diskLogs, setDiskLogs] = useState8([]);
  const [clearConfirm, setClearConfirm] = useState8(false);
  const [exportMsg, setExportMsg] = useState8(null);
  const [filterMode, setFilterMode] = useState8(false);
  const visibleRows = Math.max(5, (stdout?.rows ?? 24) - 10);
  useEffect8(() => {
    listLogDates().then((dates) => {
      setAvailableDates(["today", ...dates]);
    });
  }, []);
  useEffect8(() => {
    if (filterDate === "today") {
      setDiskLogs([]);
      return;
    }
    readLogFile(filterDate).then(setDiskLogs);
  }, [filterDate]);
  const allLogs = filterDate === "today" ? state.logs : diskLogs;
  const envNames = useMemo2(() => {
    const s = /* @__PURE__ */ new Set(["all"]);
    for (const e of state.envs) s.add(e.envAlias);
    return [...s];
  }, [state.envs]);
  const filtered = useMemo2(() => {
    return allLogs.filter((e) => {
      if (filterLevel !== "all" && e.level !== filterLevel) return false;
      if (filterEnv !== "all" && e.env !== filterEnv) return false;
      return true;
    });
  }, [allLogs, filterLevel, filterEnv]);
  const visible = filtered.slice(scroll, scroll + visibleRows);
  const maxScroll = Math.max(0, filtered.length - visibleRows);
  useInput7((input, key) => {
    if (clearConfirm) {
      if (input === "y" || input === "Y") {
        clearLogs().then(() => {
          dispatch2({ type: "CLEAR_LOGS" });
          logger.info("Logs cleared by user");
        });
        setClearConfirm(false);
      } else if (input === "n" || input === "N" || key.escape) {
        setClearConfirm(false);
      }
      return;
    }
    if (key.escape) {
      pop();
      return;
    }
    if (key.upArrow) {
      setScroll((s) => Math.max(0, s - 1));
      return;
    }
    if (key.downArrow) {
      setScroll((s) => Math.min(maxScroll, s + 1));
      return;
    }
    if (input === "f") {
      const idx = LEVELS.indexOf(filterLevel);
      setFilterLevel(LEVELS[(idx + 1) % LEVELS.length]);
      setScroll(0);
      return;
    }
    if (input === "e") {
      const date = filterDate === "today" ? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) : filterDate;
      const dest = path.join(process.cwd(), `aptunnel-gui-logs-${date}.log`);
      exportLogs(date, dest).then(() => {
        setExportMsg(`Exported to ${dest}`);
        setTimeout(() => setExportMsg(null), 3e3);
      }).catch((err) => setExportMsg(`Export failed: ${err.message}`));
      return;
    }
    if (input === "x") {
      setClearConfirm(true);
      return;
    }
  });
  const footer = "[\u2191\u2193] scroll  [f] filter level  [e] export  [x] clear  [Esc] back  [Ctrl+C] quit";
  return /* @__PURE__ */ jsx11(AppLayout, { footer, children: /* @__PURE__ */ jsxs9(Box10, { flexDirection: "column", gap: 0, children: [
    /* @__PURE__ */ jsxs9(Box10, { gap: 2, paddingBottom: 0, children: [
      /* @__PURE__ */ jsx11(Text11, { dimColor: true, children: "Filter:" }),
      /* @__PURE__ */ jsxs9(Box10, { gap: 1, children: [
        /* @__PURE__ */ jsx11(Text11, { dimColor: true, children: "env" }),
        /* @__PURE__ */ jsxs9(Text11, { color: "cyan", children: [
          "[",
          filterEnv,
          " \u25BE]"
        ] })
      ] }),
      /* @__PURE__ */ jsxs9(Box10, { gap: 1, children: [
        /* @__PURE__ */ jsx11(Text11, { dimColor: true, children: "level" }),
        /* @__PURE__ */ jsxs9(Text11, { color: "cyan", children: [
          "[",
          filterLevel,
          " \u25BE]"
        ] })
      ] }),
      /* @__PURE__ */ jsxs9(Box10, { gap: 1, children: [
        /* @__PURE__ */ jsx11(Text11, { dimColor: true, children: "date" }),
        /* @__PURE__ */ jsxs9(Text11, { color: "cyan", children: [
          "[",
          filterDate,
          " \u25BE]"
        ] })
      ] }),
      /* @__PURE__ */ jsxs9(Box10, { gap: 1, children: [
        /* @__PURE__ */ jsx11(Text11, { color: "cyan", underline: true, children: "[e] Export" }),
        /* @__PURE__ */ jsx11(Text11, { color: "red", underline: true, children: "[x] Clear" })
      ] })
    ] }),
    /* @__PURE__ */ jsx11(Text11, { dimColor: true, children: "\u2500".repeat(Math.min(cols - 2, 70)) }),
    visible.length === 0 && /* @__PURE__ */ jsx11(Box10, { marginTop: 1, children: /* @__PURE__ */ jsxs9(Text11, { dimColor: true, children: [
      "No log entries",
      filterLevel !== "all" ? ` at level ${filterLevel}` : "",
      "."
    ] }) }),
    visible.map((entry, i) => /* @__PURE__ */ jsx11(LogRow, { entry, cols }, i)),
    filtered.length > visibleRows && /* @__PURE__ */ jsx11(Box10, { marginTop: 0, children: /* @__PURE__ */ jsxs9(Text11, { dimColor: true, children: [
      scroll + 1,
      "\u2013",
      Math.min(scroll + visibleRows, filtered.length),
      " of ",
      filtered.length,
      scroll < maxScroll ? "  \u2193 more" : ""
    ] }) }),
    clearConfirm && /* @__PURE__ */ jsxs9(Box10, { marginTop: 1, gap: 1, children: [
      /* @__PURE__ */ jsx11(Text11, { color: "red", children: "\u26A0 Clear all logs? " }),
      /* @__PURE__ */ jsx11(Text11, { color: "red", children: "[Y] Yes  [N] Cancel" })
    ] }),
    exportMsg && /* @__PURE__ */ jsx11(Box10, { marginTop: 1, children: /* @__PURE__ */ jsx11(Text11, { color: "green", children: exportMsg }) })
  ] }) });
}

// src/App.js
import { jsx as jsx12 } from "react/jsx-runtime";
var SCREEN_MAP = {
  [Screen.INIT_WIZARD]: InitWizard,
  [Screen.DASHBOARD]: Dashboard,
  [Screen.DB_DETAIL]: DbDetail,
  [Screen.CONFIG_EDITOR]: ConfigEditor,
  [Screen.SETTINGS]: Settings,
  [Screen.LOGS]: Logs
};
function App() {
  const { exit } = useApp();
  const [state, dispatch2] = useReducer(appReducer, initialState);
  const startupDone = useRef6(false);
  useEffect9(() => {
    setLogDispatch(dispatch2);
  }, [dispatch2]);
  useEffect9(() => {
    if (startupDone.current) return;
    startupDone.current = true;
    (async () => {
      try {
        const settings = await loadSettings();
        dispatch2({ type: "SET_SETTINGS", settings });
        logger.info(`aptunnel-gui v${APP_VERSION} started, polling every ${settings.pollingInterval}s`);
        const hasConfig = await aptunnelConfigExists();
        if (!hasConfig) {
          dispatch2({ type: "REPLACE_SCREEN", screen: Screen.INIT_WIZARD, params: {} });
        } else {
          dispatch2({ type: "SET_INITIALIZED", value: true });
        }
      } catch (err) {
        logger.error(`Startup error: ${err.message}`);
      }
    })();
  }, []);
  useEffect9(() => {
    if (state.shouldExit) exit();
  }, [state.shouldExit, exit]);
  useInput8((input, key) => {
    if (key.ctrl && input === "c") {
      logger.info("aptunnel-gui exiting");
      dispatch2({ type: "EXIT" });
    }
  });
  const currentScreen = state.screenStack[state.screenStack.length - 1];
  const ActiveScreen = SCREEN_MAP[currentScreen?.name] ?? Dashboard;
  return /* @__PURE__ */ jsx12(AppContext.Provider, { value: { state, dispatch: dispatch2 }, children: /* @__PURE__ */ jsx12(ActiveScreen, { params: currentScreen?.params ?? {} }) });
}

// src/index.js
import { jsx as jsx13 } from "react/jsx-runtime";
render(/* @__PURE__ */ jsx13(App, {}), { exitOnCtrlC: false });
