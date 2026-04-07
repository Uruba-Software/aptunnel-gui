#!/usr/bin/env node

// src/index.js
import React13 from "react";
import { render } from "ink";

// src/App.js
import React12, { useReducer, useEffect as useEffect7, useRef as useRef4 } from "react";
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
function setLogDispatch(dispatch) {
  _dispatch = dispatch;
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
  const { dispatch } = useAppContext();
  const push = useCallback((screen, params) => dispatch({ type: "PUSH_SCREEN", screen, params }), [dispatch]);
  const pop = useCallback(() => dispatch({ type: "POP_SCREEN" }), [dispatch]);
  const replace = useCallback((screen, params) => dispatch({ type: "REPLACE_SCREEN", screen, params }), [dispatch]);
  const quit = useCallback(() => dispatch({ type: "EXIT" }), [dispatch]);
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
  const { state, dispatch } = useAppContext();
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
      dispatch({ type: "SET_INITIALIZED", value: true });
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
        dispatch({ type: "SET_ENVS", envs });
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
import React7, { useState as useState4, useMemo, useCallback as useCallback3 } from "react";
import { Box as Box6, Text as Text7, useInput as useInput3 } from "ink";

// src/components/AppLayout.js
import React3 from "react";
import { Box as Box3, Text as Text3, useStdout } from "ink";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function countTunnels(envs, dbStates) {
  let total = 0, up = 0;
  for (const env of envs) {
    for (const db of env.dbs) {
      total++;
      const key = `${env.envAlias}/${db.dbAlias}`;
      if (dbStates[key]?.tunnel === Status.CONNECTED) up++;
    }
  }
  return { up, total };
}
function getActiveEnvName(envs, settings) {
  const def = settings.defaultEnv;
  if (def) {
    const found = envs.find((e) => e.envAlias === def);
    if (found) return found.envAlias;
  }
  return envs[0]?.envAlias ?? "\u2014";
}
function AppLayout({ children, footer }) {
  const { state } = useAppContext();
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
  const { up, total } = countTunnels(state.envs, state.dbStates);
  const envName = getActiveEnvName(state.envs, state.settings);
  const headerLeft = ` aptunnel-gui  \u2502  env: ${envName}  \u2502  ${up}/${total} tunnels up`;
  const headerRight = `aptunnel-gui v${APP_VERSION} `;
  const gap = Math.max(1, cols - headerLeft.length - headerRight.length);
  const defaultFooter = "[\u2191\u2193] navigate  [Enter] select  [Ctrl+C] quit";
  return /* @__PURE__ */ jsxs3(Box3, { flexDirection: "column", width: cols, children: [
    /* @__PURE__ */ jsxs3(Box3, { borderStyle: "single", borderBottom: false, paddingX: 1, width: cols, children: [
      /* @__PURE__ */ jsx3(Text3, { bold: true, children: headerLeft }),
      /* @__PURE__ */ jsx3(Text3, { children: " ".repeat(gap) }),
      /* @__PURE__ */ jsx3(Text3, { dimColor: true, children: headerRight })
    ] }),
    /* @__PURE__ */ jsx3(Box3, { flexGrow: 1, flexDirection: "column", paddingX: 1, children }),
    /* @__PURE__ */ jsx3(Box3, { borderStyle: "single", borderTop: false, paddingX: 1, width: cols, children: /* @__PURE__ */ jsx3(Text3, { dimColor: true, children: footer ?? defaultFooter }) })
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
import React5, { useState as useState2, useEffect as useEffect2, useRef as useRef2 } from "react";
import { Box as Box4, Text as Text5 } from "ink";
import { jsx as jsx5 } from "react/jsx-runtime";
var SCROLL_INTERVAL_MS = 140;
var PAUSE_TICKS = 8;
function MarqueeText({ text, width, isActive, color, bold, dimColor }) {
  const [offset, setOffset] = useState2(0);
  const pauseRef = useRef2(0);
  const dirRef = useRef2(1);
  useEffect2(() => {
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
  const { state, dispatch } = useAppContext();
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
      dispatch({ type: "CLOSE_PORT_EDITOR" });
      return;
    }
    if (step === 2 && !reconnecting) {
      if (input === "y" || input === "Y" || key.return) handleReconnect();
      if (input === "n" || input === "N") dispatch({ type: "CLOSE_PORT_EDITOR" });
    }
    if (step === 3 && !reconnecting) {
      if (input === "y" || input === "Y") handleSave(true);
      if (input === "n" || input === "N") handleSave(false);
      if (key.return) handleSave(false);
    }
    if (done && key.return) dispatch({ type: "CLOSE_PORT_EDITOR" });
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
    dispatch({ type: "SET_PORT_EDITOR", patch: { step: 2, newPort: String(port2) } });
  }
  async function handleReconnect() {
    setReconnecting(true);
    setReconnectError(null);
    try {
      const dbKey = pe.dbKey;
      dispatch({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.DISCONNECTING });
      await closeTunnel(pe.dbAlias);
      dispatch({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.CONNECTING });
      const info = await openTunnel(pe.dbAlias);
      dispatch({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.CONNECTED, tunnelInfo: info });
      logger.info(`Port changed: ${pe.dbAlias} reconnected on port ${pe.newPort}`, { db: pe.dbAlias });
      setReconnected(true);
      dispatch({ type: "SET_PORT_EDITOR", patch: { step: 3 } });
    } catch (err) {
      setReconnectError(err.message);
      dispatch({ type: "SET_DB_TUNNEL_STATUS", dbKey: pe.dbKey, status: Status.FAILED });
      logger.error(`Port change reconnect failed: ${err.message}`, { db: pe.dbAlias });
    } finally {
      setReconnecting(false);
    }
  }
  async function handleSave(persist) {
    if (persist) {
      const portOverrides = { ...state.settings.portOverrides ?? {}, [pe.dbKey]: parseInt(pe.newPort, 10) };
      const newSettings = { ...state.settings, portOverrides };
      dispatch({ type: "SET_SETTINGS", settings: newSettings });
      await saveSettings(newSettings).catch(() => {
      });
      setSaved(true);
    }
    setDone(true);
    dispatch({ type: "SET_PORT_EDITOR", patch: { step: 4 } });
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
import { useEffect as useEffect3, useRef as useRef3, useCallback as useCallback2 } from "react";
function usePolling(enabled = true) {
  const { state, dispatch } = useAppContext();
  const intervalRef = useRef3(null);
  const prevTunnelStates = useRef3({});
  const poll = useCallback2(async () => {
    try {
      const config = await loadAptunnelConfig();
      if (!config) return;
      const envs = parseEnvsFromConfig(config);
      dispatch({ type: "SET_ENVS", envs });
      const raw = await getStatusRaw().catch(() => null);
      const tunnelStates = raw ? parseStatusOutput(raw) : {};
      for (const env of envs) {
        for (const db of env.dbs) {
          const key = `${env.envAlias}/${db.dbAlias}`;
          const isUp = tunnelStates[db.dbAlias] ?? tunnelStates[db.dbKey] ?? false;
          const newStatus = isUp ? Status.CONNECTED : Status.IDLE;
          if (prevTunnelStates.current[key] !== newStatus) {
            dispatch({ type: "SET_DB_TUNNEL_STATUS", dbKey: key, status: newStatus });
            prevTunnelStates.current[key] = newStatus;
          }
        }
      }
    } catch (err) {
      logger.error(`Status poll failed: ${err.message}`);
    }
  }, [dispatch]);
  useEffect3(() => {
    if (!enabled) return;
    poll();
    const ms = (state.settings.pollingInterval ?? 5) * 1e3;
    intervalRef.current = setInterval(poll, ms);
    return () => clearInterval(intervalRef.current);
  }, [enabled, poll, state.settings.pollingInterval]);
  return { poll };
}

// src/screens/Dashboard.js
import { jsx as jsx7, jsxs as jsxs5 } from "react/jsx-runtime";
var COL = { DOT: 2, NAME: 20, TYPE: 11, STATUS: 8, PORT: 9, SEEN: 10, ARROW: 3 };
function ColumnHeaders() {
  return /* @__PURE__ */ jsxs5(Box6, { paddingLeft: COL.DOT + 1, gap: 0, children: [
    /* @__PURE__ */ jsx7(Box6, { width: COL.NAME, children: /* @__PURE__ */ jsx7(Text7, { dimColor: true, bold: true, children: "name" }) }),
    /* @__PURE__ */ jsx7(Box6, { width: COL.TYPE, children: /* @__PURE__ */ jsx7(Text7, { dimColor: true, bold: true, children: "type" }) }),
    /* @__PURE__ */ jsx7(Box6, { width: COL.STATUS, children: /* @__PURE__ */ jsx7(Text7, { dimColor: true, bold: true, children: "status" }) }),
    /* @__PURE__ */ jsx7(Box6, { width: COL.PORT, children: /* @__PURE__ */ jsx7(Text7, { dimColor: true, bold: true, children: "port" }) }),
    /* @__PURE__ */ jsx7(Box6, { width: COL.SEEN, children: /* @__PURE__ */ jsx7(Text7, { dimColor: true, bold: true, children: "last seen" }) })
  ] });
}
function DbRow({ db, envAlias, isFocused, nameMaxLength, onSelect }) {
  const { state } = useAppContext();
  const key = `${envAlias}/${db.dbAlias}`;
  const dbState = state.dbStates[key] ?? {};
  const tunnel = dbState.tunnel ?? Status.IDLE;
  const lastSeen = dbState.lastSeen ? new Date(dbState.lastSeen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "\u2014";
  const preload = dbState.preloadStatus;
  const nameWidth = nameMaxLength ?? COL.NAME;
  return /* @__PURE__ */ jsxs5(Box6, { paddingLeft: 1, gap: 0, ...isFocused ? { borderStyle: "single", borderColor: "cyan" } : {}, children: [
    /* @__PURE__ */ jsx7(Box6, { width: COL.DOT, children: /* @__PURE__ */ jsx7(StatusDot, { status: tunnel }) }),
    /* @__PURE__ */ jsx7(Text7, { children: " " }),
    /* @__PURE__ */ jsx7(Box6, { width: nameWidth, children: /* @__PURE__ */ jsx7(
      MarqueeText,
      {
        text: db.dbAlias,
        width: nameWidth - 1,
        isActive: isFocused,
        color: isFocused ? "cyan" : void 0
      }
    ) }),
    /* @__PURE__ */ jsx7(Box6, { width: COL.TYPE, children: /* @__PURE__ */ jsx7(Text7, { dimColor: true, children: db.type?.slice(0, 10) ?? "?" }) }),
    /* @__PURE__ */ jsx7(Box6, { width: COL.STATUS, children: /* @__PURE__ */ jsx7(StatusBadge, { status: tunnel }) }),
    /* @__PURE__ */ jsx7(Box6, { width: COL.PORT, children: /* @__PURE__ */ jsxs5(Text7, { color: isFocused ? "cyan" : "gray", underline: isFocused, children: [
      ":",
      db.port ?? "?"
    ] }) }),
    /* @__PURE__ */ jsx7(Box6, { width: COL.SEEN, children: /* @__PURE__ */ jsx7(Text7, { dimColor: true, children: lastSeen }) }),
    preload && preload !== Status.LOADED && /* @__PURE__ */ jsxs5(Text7, { dimColor: true, children: [
      " (",
      preload,
      ")"
    ] }),
    isFocused && /* @__PURE__ */ jsx7(Text7, { color: "cyan", children: " [\u2192]" })
  ] });
}
function EnvRow({ env, isExpanded, isFocused, tunnelCounts, onToggle }) {
  const { up, total } = tunnelCounts;
  return /* @__PURE__ */ jsxs5(Box6, { gap: 1, ...isFocused && !isExpanded ? { borderStyle: "single", borderColor: "cyan" } : {}, children: [
    /* @__PURE__ */ jsx7(Text7, { color: "cyan", bold: true, children: isExpanded ? "\u25BC" : "\u25B6" }),
    /* @__PURE__ */ jsx7(Text7, { bold: true, color: isFocused ? "cyan" : "white", children: env.envAlias }),
    /* @__PURE__ */ jsxs5(Text7, { dimColor: true, children: [
      "(",
      up,
      "/",
      total,
      " up)"
    ] }),
    /* @__PURE__ */ jsx7(Text7, { dimColor: true, children: "  [\u2191 All]  [\u2193 All]  [\u27F3]  [hide \u21AF]" })
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
      const key = `${env.envAlias}/${db.dbAlias}`;
      return showHidden || !hiddenDbs.includes(key);
    });
    for (const db of visibleDbs) {
      items.push({ type: "db", db, env });
    }
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
function Dashboard() {
  const { state, dispatch } = useAppContext();
  const { goTo, quit } = useNavigation();
  const { poll } = usePolling();
  const [cursor, setCursor] = useState4(0);
  const [showHiddenEnvs, setShowHiddenEnvs] = useState4(false);
  const [showHiddenDbsFor, setShowHiddenDbsFor] = useState4(null);
  const hiddenEnvs = state.settings.hiddenEnvs ?? [];
  const hiddenDbs = state.settings.hiddenDbs ?? [];
  const nameMax = state.settings.nameMaxLength ?? 18;
  const items = useMemo(
    () => buildItems(state.envs, state.expandedEnvs, hiddenEnvs, hiddenDbs, showHiddenEnvs, showHiddenDbsFor),
    [state.envs, state.expandedEnvs, hiddenEnvs, hiddenDbs, showHiddenEnvs, showHiddenDbsFor]
  );
  const clamp = useCallback3((n) => Math.max(0, Math.min(n, items.length - 1)), [items.length]);
  const tunnelCounts = useCallback3((env) => {
    let up = 0;
    for (const db of env.dbs) {
      const key = `${env.envAlias}/${db.dbAlias}`;
      if (state.dbStates[key]?.tunnel === Status.CONNECTED) up++;
    }
    return { up, total: env.dbs.length };
  }, [state.dbStates]);
  const persistSettings = useCallback3(async (patch) => {
    const next = { ...state.settings, ...patch };
    dispatch({ type: "SET_SETTINGS", settings: next });
    await saveSettings(next).catch(() => {
    });
  }, [state.settings, dispatch]);
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
    if (key.return || key.rightArrow) {
      if (item.type === "env") {
        dispatch({ type: "TOGGLE_ENV_EXPANDED", envAlias: item.env.envAlias });
      } else if (item.type === "db") {
        goTo.dbDetail({ envAlias: item.env.envAlias, dbAlias: item.db.dbAlias });
      } else if (item.type === "show_hidden_dbs") {
        setShowHiddenDbsFor(item.env.envAlias);
      } else if (item.type === "show_hidden_envs") {
        setShowHiddenEnvs(true);
      }
      return;
    }
    if (key.leftArrow && item.type === "env") {
      if (state.expandedEnvs.has(item.env.envAlias)) {
        dispatch({ type: "TOGGLE_ENV_EXPANDED", envAlias: item.env.envAlias });
      }
      return;
    }
    if (input === "o" && item.type === "db") {
      const { dbAlias, type } = item.db;
      const { envAlias } = item.env;
      const dbKey = `${envAlias}/${dbAlias}`;
      dispatch({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.CONNECTING });
      openTunnel(dbAlias).then((info) => {
        dispatch({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.CONNECTED, tunnelInfo: info });
        logger.info(`Tunnel opened: ${dbAlias} :${info.port}`, { env: envAlias, db: dbAlias });
      }).catch((err) => {
        dispatch({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.FAILED });
        dispatch({ type: "SET_DB_ERROR", dbKey, error: err.message });
        logger.error(`Tunnel open failed: ${err.message}`, { env: envAlias, db: dbAlias });
      });
      return;
    }
    if (input === "c" && item.type === "db") {
      const { dbAlias } = item.db;
      const { envAlias } = item.env;
      const dbKey = `${envAlias}/${dbAlias}`;
      dispatch({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.DISCONNECTING });
      closeTunnel(dbAlias).then(() => {
        dispatch({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.IDLE });
        logger.info(`Tunnel closed: ${dbAlias}`, { env: envAlias, db: dbAlias });
      }).catch((err) => {
        dispatch({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.FAILED });
        logger.error(`Tunnel close failed: ${err.message}`, { env: envAlias, db: dbAlias });
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
        dispatch({ type: "HIDE_DB", dbKey });
        const hiddenDbs2 = [...state.settings.hiddenDbs ?? [], dbKey];
        persistSettings({ hiddenDbs: hiddenDbs2 });
        logger.info(`${item.db.dbAlias} hidden by user`, { env: item.env.envAlias, db: item.db.dbAlias });
      } else if (item.type === "env") {
        dispatch({ type: "HIDE_ENV", envAlias: item.env.envAlias });
        const hiddenEnvs2 = [...state.settings.hiddenEnvs ?? [], item.env.envAlias];
        persistSettings({ hiddenEnvs: hiddenEnvs2 });
        logger.info(`env ${item.env.envAlias} hidden by user`);
      }
      setCursor((c) => clamp(c));
      return;
    }
    if (input === "p" && item.type === "db") {
      dispatch({ type: "OPEN_PORT_EDITOR", dbKey: `${item.env.envAlias}/${item.db.dbAlias}`, dbAlias: item.db.dbAlias });
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
  const footer = "[\u2191\u2193] nav  [Enter] open/expand  [o] open tunnel  [c] close  [p] port  [h] hide  [r] refresh  [s] settings  [l] logs  [Ctrl+C] quit";
  return /* @__PURE__ */ jsxs5(AppLayout, { footer, children: [
    state.portEditor && /* @__PURE__ */ jsx7(Box6, { justifyContent: "center", marginY: 1, children: /* @__PURE__ */ jsx7(PortEditor, {}) }),
    !state.portEditor && /* @__PURE__ */ jsxs5(Box6, { flexDirection: "column", children: [
      items.length === 0 && /* @__PURE__ */ jsxs5(Box6, { marginTop: 1, children: [
        /* @__PURE__ */ jsx7(Text7, { dimColor: true, children: "No environments found. Run " }),
        /* @__PURE__ */ jsx7(Text7, { color: "cyan", children: "aptunnel init" }),
        /* @__PURE__ */ jsx7(Text7, { dimColor: true, children: " to get started." })
      ] }),
      items.map((item, idx) => {
        const isFocused = idx === cursor;
        if (item.type === "colheader") {
          return /* @__PURE__ */ jsx7(ColumnHeaders, {}, `ch-${item.env.envAlias}`);
        }
        if (item.type === "env") {
          return /* @__PURE__ */ jsx7(
            EnvRow,
            {
              env: item.env,
              isExpanded: state.expandedEnvs.has(item.env.envAlias),
              isFocused,
              tunnelCounts: tunnelCounts(item.env),
              onToggle: () => dispatch({ type: "TOGGLE_ENV_EXPANDED", envAlias: item.env.envAlias })
            },
            `env-${item.env.envAlias}`
          );
        }
        if (item.type === "db") {
          return /* @__PURE__ */ jsx7(
            DbRow,
            {
              db: item.db,
              envAlias: item.env.envAlias,
              isFocused,
              nameMaxLength: nameMax
            },
            `db-${item.env.envAlias}-${item.db.dbAlias}`
          );
        }
        if (item.type === "show_hidden_dbs") {
          return /* @__PURE__ */ jsx7(Box6, { paddingLeft: 4, children: /* @__PURE__ */ jsxs5(Text7, { color: isFocused ? "cyan" : "gray", underline: true, children: [
            "+ show hidden (",
            item.count,
            ")"
          ] }) }, `shd-${item.env.envAlias}`);
        }
        if (item.type === "show_hidden_envs") {
          return /* @__PURE__ */ jsx7(Box6, { paddingLeft: 0, marginTop: 1, children: /* @__PURE__ */ jsxs5(Text7, { color: isFocused ? "cyan" : "gray", underline: true, children: [
            "+ show hidden envs (",
            item.count,
            ")"
          ] }) }, "she");
        }
        return null;
      })
    ] })
  ] });
}

// src/screens/DbDetail.js
import React8, { useState as useState5, useEffect as useEffect4, useCallback as useCallback4 } from "react";
import { Box as Box7, Text as Text8, useInput as useInput4 } from "ink";
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
function Section({ title, count, isOpen, isFocused, loadedAt, loading, children, onToggle, onRefresh }) {
  return /* @__PURE__ */ jsxs6(Box7, { flexDirection: "column", children: [
    /* @__PURE__ */ jsxs6(Box7, { gap: 1, children: [
      /* @__PURE__ */ jsx8(Text8, { color: isFocused ? "cyan" : "white", children: isOpen ? "[\u25BC]" : "[\u25B6]" }),
      /* @__PURE__ */ jsx8(Text8, { bold: isFocused, color: isFocused ? "cyan" : "white", children: title }),
      count != null && /* @__PURE__ */ jsxs6(Text8, { dimColor: true, children: [
        "(",
        count,
        ")"
      ] }),
      /* @__PURE__ */ jsx8(Text8, { children: " " }),
      loading ? /* @__PURE__ */ jsx8(Text8, { color: "yellow", children: "loading\u2026" }) : loadedAt && /* @__PURE__ */ jsxs6(Text8, { dimColor: true, children: [
        "loaded: ",
        fmtTime(loadedAt)
      ] }),
      onRefresh && !loading && /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: " [\u27F3]" })
    ] }),
    isOpen && children && /* @__PURE__ */ jsx8(Box7, { flexDirection: "column", paddingLeft: 2, children })
  ] });
}
function SchemaSection({ schema, dbKey, envAlias, dbAlias, tunnelStatus, settings, dispatch }) {
  const [open, setOpen] = useState5({});
  const [data, setData] = useState5(null);
  const [loadedAt, setLoadedAt] = useState5(null);
  const [loading, setLoading] = useState5(false);
  const [sections, setSections] = useState5({});
  const [openSchemas, setOpenSchemas] = useState5({});
  const [cursor, setCursor] = useState5(0);
  const autoOpenAndLoad = useCallback4(async () => {
    if (tunnelStatus === Status.CONNECTED) {
      await loadSchemas();
      return;
    }
    if (settings.autoOpenTunnel === AutoOpenTunnel.ALWAYS) {
      dispatch({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.CONNECTING });
      try {
        const info = await openTunnel(dbAlias);
        dispatch({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.CONNECTED, tunnelInfo: info });
        await loadSchemas();
      } catch (err) {
        dispatch({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.FAILED });
        logger.error(`Auto-open tunnel failed: ${err.message}`, { env: envAlias, db: dbAlias });
      }
    }
  }, [tunnelStatus, settings.autoOpenTunnel, dbKey, dbAlias, dispatch]);
  useEffect4(() => {
    loadCache(envAlias, dbAlias).then((cached) => {
      if (cached) {
        setData(cached.schemas ?? null);
        setLoadedAt(cached.savedAt ?? null);
      }
    });
  }, [envAlias, dbAlias]);
  async function loadSchemas() {
    if (tunnelStatus !== Status.CONNECTED) return;
    setLoading(true);
    try {
      const schemas = await fetchSchemasFromDb(dbAlias, dbKey, settings);
      const now = (/* @__PURE__ */ new Date()).toISOString();
      setData(schemas);
      setLoadedAt(now);
      await saveCache(envAlias, dbAlias, { schemas, loadedAt: now });
      logger.info(`Schema loaded: ${dbAlias}`, { env: envAlias, db: dbAlias });
    } catch (err) {
      logger.error(`Schema load failed: ${err.message}`, { env: envAlias, db: dbAlias });
    } finally {
      setLoading(false);
    }
  }
  async function fetchSchemasFromDb() {
    return [{ name: "public", tables: [], views: [], indexes: [], triggers: [], functions: [], sizeBytes: 0 }];
  }
  return /* @__PURE__ */ jsxs6(
    Section,
    {
      title: "Schemas",
      count: data?.length,
      isOpen: true,
      isFocused: false,
      loadedAt,
      loading,
      onRefresh: autoOpenAndLoad,
      children: [
        !data && !loading && /* @__PURE__ */ jsxs6(Box7, { marginLeft: 2, gap: 1, children: [
          /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: "No data loaded." }),
          /* @__PURE__ */ jsx8(Text8, { color: "cyan", underline: true, children: "[\u27F3] Load now" })
        ] }),
        data?.map((schema2) => /* @__PURE__ */ jsx8(Box7, { flexDirection: "column", marginTop: 0, children: /* @__PURE__ */ jsxs6(Box7, { gap: 1, children: [
          /* @__PURE__ */ jsxs6(Text8, { color: "cyan", children: [
            "[\u25B6] ",
            schema2.name
          ] }),
          /* @__PURE__ */ jsxs6(Text8, { dimColor: true, children: [
            "(",
            schema2.tables?.length ?? 0,
            " tables, ",
            fmtBytes(schema2.sizeBytes),
            ")"
          ] })
        ] }) }, schema2.name)),
        tunnelStatus !== Status.CONNECTED && settings.autoOpenTunnel === AutoOpenTunnel.ASK && /* @__PURE__ */ jsx8(Box7, { marginTop: 1, gap: 1, children: /* @__PURE__ */ jsx8(Text8, { color: "yellow", children: "\u26A0 Tunnel must be open. Open now? [Y/n]" }) })
      ]
    }
  );
}
function CredentialsRow({ dbKey, tunnelInfo, visible }) {
  if (!visible) {
    return /* @__PURE__ */ jsxs6(Box7, { gap: 1, children: [
      /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: "Credentials:" }),
      /* @__PURE__ */ jsx8(Text8, { children: "\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF" }),
      /* @__PURE__ */ jsx8(Text8, { dimColor: true, color: "cyan", children: "[\u{1F441} t] Show / Hide" })
    ] });
  }
  return /* @__PURE__ */ jsxs6(Box7, { flexDirection: "column", gap: 0, children: [
    /* @__PURE__ */ jsxs6(Box7, { gap: 1, children: [
      /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: "Credentials:" }),
      /* @__PURE__ */ jsx8(Text8, { dimColor: true, color: "cyan", children: "[\u{1F441} t] Hide" })
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
function DbDetail({ params }) {
  const { envAlias, dbAlias } = params ?? {};
  const { state, dispatch } = useAppContext();
  const { pop, goTo } = useNavigation();
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
  async function handleOpen() {
    dispatch({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.CONNECTING });
    try {
      const info = await openTunnel(dbAlias);
      dispatch({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.CONNECTED, tunnelInfo: info });
      logger.info(`Tunnel opened: ${dbAlias} :${info.port}`, { env: envAlias, db: dbAlias });
    } catch (err) {
      dispatch({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.FAILED });
      logger.error(`Tunnel open failed: ${err.message}`, { env: envAlias, db: dbAlias });
    }
  }
  async function handleClose() {
    dispatch({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.DISCONNECTING });
    try {
      await closeTunnel(dbAlias);
      dispatch({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.IDLE });
      logger.info(`Tunnel closed: ${dbAlias}`, { env: envAlias, db: dbAlias });
    } catch (err) {
      dispatch({ type: "SET_DB_TUNNEL_STATUS", dbKey, status: Status.FAILED });
      logger.error(`Tunnel close failed: ${err.message}`, { env: envAlias, db: dbAlias });
    }
  }
  useInput4((input, key) => {
    if (state.portEditor) return;
    if (key.escape || key.return && input === "") pop();
    if (input === "o") handleOpen();
    if (input === "c") handleClose();
    if (input === "t") dispatch({ type: "TOGGLE_CREDENTIALS", dbKey });
    if (input === "p") dispatch({ type: "OPEN_PORT_EDITOR", dbKey, dbAlias });
    if (input === "h") {
      dispatch({ type: "HIDE_DB", dbKey });
      pop();
    }
    if (input === "[" && prevDb) goTo.dbDetail({ envAlias, dbAlias: prevDb.dbAlias });
    if (input === "]" && nextDb) goTo.dbDetail({ envAlias, dbAlias: nextDb.dbAlias });
  });
  const footer = "[\u2191\u2193] scroll  [o] open  [c] close  [p] port  [t] credentials  [h] hide  [\u2190] prev  [\u2192] next  [Esc] back  [Ctrl+C] quit";
  return /* @__PURE__ */ jsxs6(AppLayout, { footer, children: [
    state.portEditor && /* @__PURE__ */ jsx8(Box7, { justifyContent: "center", marginY: 1, children: /* @__PURE__ */ jsx8(PortEditor, {}) }),
    !state.portEditor && /* @__PURE__ */ jsxs6(Box7, { flexDirection: "column", gap: 1, children: [
      /* @__PURE__ */ jsxs6(Box7, { gap: 1, marginBottom: 0, children: [
        prevDb && /* @__PURE__ */ jsxs6(Text8, { color: "cyan", underline: true, children: [
          "[\u2190 ",
          prevDb.dbAlias,
          "]"
        ] }),
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
        nextDb && /* @__PURE__ */ jsxs6(Text8, { color: "cyan", underline: true, children: [
          " [",
          nextDb.dbAlias,
          " \u2192]"
        ] }),
        /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: "  [\u21A9 List]" })
      ] }),
      /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: "\u2500".repeat(60) }),
      /* @__PURE__ */ jsxs6(Box7, { gap: 2, alignItems: "flex-start", children: [
        /* @__PURE__ */ jsxs6(Box7, { gap: 1, children: [
          /* @__PURE__ */ jsx8(Text8, { children: "Status:" }),
          /* @__PURE__ */ jsx8(StatusDot, { status: tunnel }),
          /* @__PURE__ */ jsx8(StatusBadge, { status: tunnel })
        ] }),
        /* @__PURE__ */ jsxs6(Text8, { dimColor: true, children: [
          "Port: ",
          db?.port ?? "?"
        ] }),
        /* @__PURE__ */ jsx8(Text8, { color: "cyan", children: "[\u2191 o] Open" }),
        /* @__PURE__ */ jsx8(Text8, { color: "cyan", children: "[\u2193 c] Close" }),
        /* @__PURE__ */ jsx8(Text8, { color: "cyan", children: "[\u2699 p] Port" }),
        /* @__PURE__ */ jsx8(Text8, { color: "cyan", children: "[hide \u21AF h]" })
      ] }),
      /* @__PURE__ */ jsx8(CredentialsRow, { dbKey, tunnelInfo, visible: credVisible }),
      /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: "\u2500".repeat(60) }),
      (db?.type === DbType.POSTGRES || db?.type === DbType.MYSQL || !db?.type) && /* @__PURE__ */ jsx8(
        SchemaSection,
        {
          dbKey,
          envAlias,
          dbAlias,
          tunnelStatus: tunnel,
          settings: state.settings,
          dispatch
        }
      ),
      db?.type === DbType.REDIS && /* @__PURE__ */ jsxs6(Box7, { flexDirection: "column", gap: 1, children: [
        /* @__PURE__ */ jsx8(Text8, { bold: true, children: "Keyspace" }),
        /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: "Connect tunnel to load keyspace data." })
      ] }),
      db?.type === DbType.ELASTICSEARCH && /* @__PURE__ */ jsxs6(Box7, { flexDirection: "column", gap: 1, children: [
        /* @__PURE__ */ jsx8(Text8, { bold: true, children: "Indices" }),
        /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: "Connect tunnel to load index data." })
      ] }),
      dbState.error && /* @__PURE__ */ jsx8(Box7, { marginTop: 1, children: /* @__PURE__ */ jsxs6(Text8, { color: "red", children: [
        "\u2716 ",
        dbState.error
      ] }) })
    ] })
  ] });
}

// src/screens/ConfigEditor.js
import React9, { useState as useState6, useEffect as useEffect5 } from "react";
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
  useEffect5(() => {
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
  const { state, dispatch } = useAppContext();
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
    dispatch({ type: "SET_SETTINGS", settings: localSettings });
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
import React11, { useState as useState8, useEffect as useEffect6, useMemo as useMemo2 } from "react";
import { Box as Box10, Text as Text11, useInput as useInput7, useStdout as useStdout2 } from "ink";
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
  const { state, dispatch } = useAppContext();
  const { pop } = useNavigation();
  const { stdout } = useStdout2();
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
  useEffect6(() => {
    listLogDates().then((dates) => {
      setAvailableDates(["today", ...dates]);
    });
  }, []);
  useEffect6(() => {
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
          dispatch({ type: "CLEAR_LOGS" });
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
  const [state, dispatch] = useReducer(appReducer, initialState);
  const startupDone = useRef4(false);
  useEffect7(() => {
    setLogDispatch(dispatch);
  }, [dispatch]);
  useEffect7(() => {
    if (startupDone.current) return;
    startupDone.current = true;
    (async () => {
      try {
        const settings = await loadSettings();
        dispatch({ type: "SET_SETTINGS", settings });
        logger.info(`aptunnel-gui v${APP_VERSION} started, polling every ${settings.pollingInterval}s`);
        const hasConfig = await aptunnelConfigExists();
        if (!hasConfig) {
          dispatch({ type: "REPLACE_SCREEN", screen: Screen.INIT_WIZARD, params: {} });
        } else {
          dispatch({ type: "SET_INITIALIZED", value: true });
        }
      } catch (err) {
        logger.error(`Startup error: ${err.message}`);
      }
    })();
  }, []);
  useEffect7(() => {
    if (state.shouldExit) exit();
  }, [state.shouldExit, exit]);
  useInput8((input, key) => {
    if (key.ctrl && input === "c") {
      logger.info("aptunnel-gui exiting");
      dispatch({ type: "EXIT" });
    }
  });
  const currentScreen = state.screenStack[state.screenStack.length - 1];
  const ActiveScreen = SCREEN_MAP[currentScreen?.name] ?? Dashboard;
  return /* @__PURE__ */ jsx12(AppContext.Provider, { value: { state, dispatch }, children: /* @__PURE__ */ jsx12(ActiveScreen, { params: currentScreen?.params ?? {} }) });
}

// src/index.js
import { jsx as jsx13 } from "react/jsx-runtime";
render(/* @__PURE__ */ jsx13(App, {}), { exitOnCtrlC: false });
