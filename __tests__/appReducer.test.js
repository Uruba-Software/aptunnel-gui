import { describe, it, expect } from '@jest/globals';
import { appReducer, initialState } from '../src/state/appReducer.js';
import { Screen, Status, DEFAULT_SETTINGS } from '../src/constants.js';

describe('appReducer', () => {

  // ── Navigation ────────────────────────────────────────────────────────────

  describe('PUSH_SCREEN', () => {
    it('adds screen to stack', () => {
      const state = appReducer(initialState, { type: 'PUSH_SCREEN', screen: Screen.SETTINGS, params: {} });
      expect(state.screenStack).toHaveLength(2);
      expect(state.screenStack[1].name).toBe(Screen.SETTINGS);
    });

    it('passes params to screen', () => {
      const state = appReducer(initialState, { type: 'PUSH_SCREEN', screen: Screen.DB_DETAIL, params: { dbAlias: 'mydb' } });
      expect(state.screenStack[1].params.dbAlias).toBe('mydb');
    });
  });

  describe('POP_SCREEN', () => {
    it('removes last screen from stack', () => {
      let state = appReducer(initialState, { type: 'PUSH_SCREEN', screen: Screen.SETTINGS, params: {} });
      state = appReducer(state, { type: 'POP_SCREEN' });
      expect(state.screenStack).toHaveLength(1);
      expect(state.screenStack[0].name).toBe(Screen.DASHBOARD);
    });

    it('does not pop if stack has only 1 screen', () => {
      const state = appReducer(initialState, { type: 'POP_SCREEN' });
      expect(state.screenStack).toHaveLength(1);
    });
  });

  describe('REPLACE_SCREEN', () => {
    it('replaces the top screen', () => {
      const state = appReducer(initialState, { type: 'REPLACE_SCREEN', screen: Screen.INIT_WIZARD, params: {} });
      expect(state.screenStack).toHaveLength(1);
      expect(state.screenStack[0].name).toBe(Screen.INIT_WIZARD);
    });
  });

  // ── Exit ──────────────────────────────────────────────────────────────────

  it('EXIT sets shouldExit to true', () => {
    const state = appReducer(initialState, { type: 'EXIT' });
    expect(state.shouldExit).toBe(true);
  });

  // ── Settings ──────────────────────────────────────────────────────────────

  it('SET_SETTINGS merges into existing settings', () => {
    const state = appReducer(initialState, { type: 'SET_SETTINGS', settings: { pollingInterval: 10 } });
    expect(state.settings.pollingInterval).toBe(10);
    expect(state.settings.theme).toBe(DEFAULT_SETTINGS.theme); // unchanged
  });

  // ── Envs ──────────────────────────────────────────────────────────────────

  it('SET_ENVS updates envs and lastPolled', () => {
    const envs = [{ envAlias: 'dev', dbs: [] }];
    const state = appReducer(initialState, { type: 'SET_ENVS', envs });
    expect(state.envs).toEqual(envs);
    expect(state.lastPolled).toBeTruthy();
  });

  // ── DB tunnel status ──────────────────────────────────────────────────────

  describe('SET_DB_TUNNEL_STATUS', () => {
    it('sets tunnel status for a DB', () => {
      const state = appReducer(initialState, {
        type: 'SET_DB_TUNNEL_STATUS',
        dbKey: 'dev/mydb',
        status: Status.CONNECTED,
        tunnelInfo: { port: 5432, host: 'localhost', user: 'u', password: 'p', url: 'pg://...', pid: 1 },
      });
      expect(state.dbStates['dev/mydb'].tunnel).toBe(Status.CONNECTED);
      expect(state.dbStates['dev/mydb'].tunnelInfo.port).toBe(5432);
    });

    it('sets lastSeen on CONNECTED', () => {
      const state = appReducer(initialState, { type: 'SET_DB_TUNNEL_STATUS', dbKey: 'dev/mydb', status: Status.CONNECTED });
      expect(state.dbStates['dev/mydb'].lastSeen).toBeTruthy();
    });

    it('preserves existing fields when updating status', () => {
      let state = appReducer(initialState, { type: 'SET_DB_TUNNEL_STATUS', dbKey: 'dev/mydb', status: Status.CONNECTED });
      state = appReducer(state, { type: 'SET_DB_TUNNEL_STATUS', dbKey: 'dev/mydb', status: Status.IDLE });
      // lastSeen should be preserved from the CONNECTED state
      expect(state.dbStates['dev/mydb'].lastSeen).toBeTruthy();
    });
  });

  // ── Credentials ───────────────────────────────────────────────────────────

  it('TOGGLE_CREDENTIALS flips credentialsVisible', () => {
    let state = appReducer(initialState, { type: 'TOGGLE_CREDENTIALS', dbKey: 'dev/mydb' });
    expect(state.dbStates['dev/mydb'].credentialsVisible).toBe(true);
    state = appReducer(state, { type: 'TOGGLE_CREDENTIALS', dbKey: 'dev/mydb' });
    expect(state.dbStates['dev/mydb'].credentialsVisible).toBe(false);
  });

  // ── Hide / show ───────────────────────────────────────────────────────────

  it('HIDE_ENV adds env to hiddenEnvs', () => {
    const state = appReducer(initialState, { type: 'HIDE_ENV', envAlias: 'dev' });
    expect(state.settings.hiddenEnvs).toContain('dev');
  });

  it('SHOW_ENV removes env from hiddenEnvs', () => {
    let state = appReducer(initialState, { type: 'HIDE_ENV', envAlias: 'dev' });
    state = appReducer(state, { type: 'SHOW_ENV', envAlias: 'dev' });
    expect(state.settings.hiddenEnvs).not.toContain('dev');
  });

  it('HIDE_DB adds DB key to hiddenDbs', () => {
    const state = appReducer(initialState, { type: 'HIDE_DB', dbKey: 'dev/mydb' });
    expect(state.settings.hiddenDbs).toContain('dev/mydb');
  });

  it('SHOW_DB removes DB key from hiddenDbs', () => {
    let state = appReducer(initialState, { type: 'HIDE_DB', dbKey: 'dev/mydb' });
    state = appReducer(state, { type: 'SHOW_DB', dbKey: 'dev/mydb' });
    expect(state.settings.hiddenDbs).not.toContain('dev/mydb');
  });

  it('HIDE_ENV does not duplicate entries', () => {
    let state = appReducer(initialState, { type: 'HIDE_ENV', envAlias: 'dev' });
    state = appReducer(state, { type: 'HIDE_ENV', envAlias: 'dev' });
    expect(state.settings.hiddenEnvs.filter(e => e === 'dev')).toHaveLength(1);
  });

  // ── Dashboard accordion ───────────────────────────────────────────────────

  it('TOGGLE_ENV_EXPANDED adds env to set when collapsed', () => {
    const state = appReducer(initialState, { type: 'TOGGLE_ENV_EXPANDED', envAlias: 'dev' });
    expect(state.expandedEnvs.has('dev')).toBe(true);
  });

  it('TOGGLE_ENV_EXPANDED removes env from set when expanded', () => {
    let state = appReducer(initialState, { type: 'TOGGLE_ENV_EXPANDED', envAlias: 'dev' });
    state = appReducer(state, { type: 'TOGGLE_ENV_EXPANDED', envAlias: 'dev' });
    expect(state.expandedEnvs.has('dev')).toBe(false);
  });

  // ── Port editor ───────────────────────────────────────────────────────────

  it('OPEN_PORT_EDITOR sets portEditor state', () => {
    const state = appReducer(initialState, { type: 'OPEN_PORT_EDITOR', dbKey: 'dev/mydb', dbAlias: 'mydb' });
    expect(state.portEditor).toBeTruthy();
    expect(state.portEditor.dbKey).toBe('dev/mydb');
    expect(state.portEditor.step).toBe(1);
  });

  it('CLOSE_PORT_EDITOR nullifies portEditor', () => {
    let state = appReducer(initialState, { type: 'OPEN_PORT_EDITOR', dbKey: 'dev/mydb', dbAlias: 'mydb' });
    state = appReducer(state, { type: 'CLOSE_PORT_EDITOR' });
    expect(state.portEditor).toBeNull();
  });

  it('SET_PORT_EDITOR patches portEditor fields', () => {
    let state = appReducer(initialState, { type: 'OPEN_PORT_EDITOR', dbKey: 'dev/mydb', dbAlias: 'mydb' });
    state = appReducer(state, { type: 'SET_PORT_EDITOR', patch: { step: 2, newPort: '5433' } });
    expect(state.portEditor.step).toBe(2);
    expect(state.portEditor.newPort).toBe('5433');
  });

  // ── Logs ──────────────────────────────────────────────────────────────────

  it('APPEND_LOG prepends to logs array', () => {
    const entry = { timestamp: new Date().toISOString(), level: 'INFO', env: null, db: null, message: 'test' };
    const state = appReducer(initialState, { type: 'APPEND_LOG', entry });
    expect(state.logs[0]).toEqual(entry);
  });

  it('APPEND_LOG keeps at most 1000 entries', () => {
    let state = initialState;
    for (let i = 0; i < 1005; i++) {
      state = appReducer(state, {
        type: 'APPEND_LOG',
        entry: { timestamp: new Date().toISOString(), level: 'INFO', env: null, db: null, message: `msg${i}` },
      });
    }
    expect(state.logs.length).toBe(1000);
  });

  it('CLEAR_LOGS empties the logs array', () => {
    let state = appReducer(initialState, {
      type: 'APPEND_LOG',
      entry: { timestamp: new Date().toISOString(), level: 'INFO', env: null, db: null, message: 'test' },
    });
    state = appReducer(state, { type: 'CLEAR_LOGS' });
    expect(state.logs).toHaveLength(0);
  });

  // ── Unknown action ────────────────────────────────────────────────────────

  it('returns unchanged state for unknown actions', () => {
    const state = appReducer(initialState, { type: 'UNKNOWN_ACTION_XYZ' });
    expect(state).toBe(initialState);
  });
});
