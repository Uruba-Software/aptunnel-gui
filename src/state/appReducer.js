import { Screen, DEFAULT_SETTINGS, Status } from '../constants.js';

export const initialState = {
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
  expandedEnvs: new Set(),
};

export function appReducer(state, action) {
  switch (action.type) {

    // ── Navigation ──────────────────────────────────────────────────────────
    case 'PUSH_SCREEN':
      return { ...state, screenStack: [...state.screenStack, { name: action.screen, params: action.params ?? {} }] };

    case 'POP_SCREEN':
      return state.screenStack.length <= 1 ? state : { ...state, screenStack: state.screenStack.slice(0, -1) };

    case 'REPLACE_SCREEN': {
      const stack = [...state.screenStack];
      stack[stack.length - 1] = { name: action.screen, params: action.params ?? {} };
      return { ...state, screenStack: stack };
    }

    case 'EXIT':
      return { ...state, shouldExit: true };

    // ── Settings ─────────────────────────────────────────────────────────────
    case 'SET_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.settings } };

    // ── Envs & DB list ───────────────────────────────────────────────────────
    case 'SET_ENVS':
      return { ...state, envs: action.envs, lastPolled: new Date().toISOString() };

    // ── Per-DB tunnel status ─────────────────────────────────────────────────
    case 'SET_DB_TUNNEL_STATUS': {
      const prev = state.dbStates[action.dbKey] ?? {};
      return {
        ...state,
        dbStates: {
          ...state.dbStates,
          [action.dbKey]: {
            ...prev,
            tunnel: action.status,
            tunnelInfo: action.tunnelInfo ?? prev.tunnelInfo ?? null,
            lastSeen: action.status === Status.CONNECTED ? new Date().toISOString() : (prev.lastSeen ?? null),
          },
        },
      };
    }

    // ── Per-DB schema load ───────────────────────────────────────────────────
    case 'SET_DB_SCHEMA_STATUS': {
      const prev = state.dbStates[action.dbKey] ?? {};
      return {
        ...state,
        dbStates: {
          ...state.dbStates,
          [action.dbKey]: {
            ...prev,
            schemaLoad: action.status,
            schema: action.schema !== undefined ? action.schema : prev.schema,
          },
        },
      };
    }

    case 'SET_DB_ERROR': {
      const prev = state.dbStates[action.dbKey] ?? {};
      return {
        ...state,
        dbStates: { ...state.dbStates, [action.dbKey]: { ...prev, error: action.error } },
      };
    }

    // ── Credentials visibility ───────────────────────────────────────────────
    case 'TOGGLE_CREDENTIALS': {
      const prev = state.dbStates[action.dbKey] ?? {};
      return {
        ...state,
        dbStates: {
          ...state.dbStates,
          [action.dbKey]: { ...prev, credentialsVisible: !prev.credentialsVisible },
        },
      };
    }

    // ── Hide / show ──────────────────────────────────────────────────────────
    case 'HIDE_ENV': {
      const hidden = [...(state.settings.hiddenEnvs ?? [])];
      if (!hidden.includes(action.envAlias)) hidden.push(action.envAlias);
      return { ...state, settings: { ...state.settings, hiddenEnvs: hidden } };
    }

    case 'SHOW_ENV': {
      const hidden = (state.settings.hiddenEnvs ?? []).filter(e => e !== action.envAlias);
      return { ...state, settings: { ...state.settings, hiddenEnvs: hidden } };
    }

    case 'HIDE_DB': {
      const hidden = [...(state.settings.hiddenDbs ?? [])];
      if (!hidden.includes(action.dbKey)) hidden.push(action.dbKey);
      return { ...state, settings: { ...state.settings, hiddenDbs: hidden } };
    }

    case 'SHOW_DB': {
      const hidden = (state.settings.hiddenDbs ?? []).filter(k => k !== action.dbKey);
      return { ...state, settings: { ...state.settings, hiddenDbs: hidden } };
    }

    // ── Dashboard accordion ──────────────────────────────────────────────────
    case 'TOGGLE_ENV_EXPANDED': {
      const next = new Set(state.expandedEnvs);
      if (next.has(action.envAlias)) next.delete(action.envAlias);
      else next.add(action.envAlias);
      return { ...state, expandedEnvs: next };
    }

    case 'EXPAND_ENV': {
      const next = new Set(state.expandedEnvs);
      next.add(action.envAlias);
      return { ...state, expandedEnvs: next };
    }

    // ── Port editor modal ────────────────────────────────────────────────────
    case 'OPEN_PORT_EDITOR':
      return { ...state, portEditor: { dbKey: action.dbKey, dbAlias: action.dbAlias, step: 1, newPort: '', error: null, saving: false } };

    case 'CLOSE_PORT_EDITOR':
      return { ...state, portEditor: null };

    case 'SET_PORT_EDITOR':
      return { ...state, portEditor: state.portEditor ? { ...state.portEditor, ...action.patch } : null };

    // ── Initialization ───────────────────────────────────────────────────────
    case 'SET_INITIALIZED':
      return { ...state, initialized: action.value };

    // ── Background preload ───────────────────────────────────────────────────
    case 'SET_PRELOAD':
      return { ...state, preload: { ...state.preload, ...action.preload } };

    case 'SET_DB_PRELOAD_STATUS': {
      const prev = state.dbStates[action.dbKey] ?? {};
      return {
        ...state,
        dbStates: { ...state.dbStates, [action.dbKey]: { ...prev, preloadStatus: action.status } },
      };
    }

    // ── Logs ─────────────────────────────────────────────────────────────────
    case 'APPEND_LOG':
      return { ...state, logs: [action.entry, ...state.logs].slice(0, 1000) };

    case 'CLEAR_LOGS':
      return { ...state, logs: [] };

    default:
      return state;
  }
}
