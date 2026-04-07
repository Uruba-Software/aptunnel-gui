/**
 * Dashboard — main screen.
 * Env/DB accordion list with column layout, hide/show, port editing.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import AppLayout from '../components/AppLayout.js';
import StatusBadge, { StatusDot } from '../components/StatusBadge.js';
import MarqueeText from '../components/MarqueeText.js';
import PortEditor from '../components/PortEditor.js';
import { useAppContext } from '../state/AppContext.js';
import { useNavigation } from '../hooks/useNavigation.js';
import { usePolling } from '../hooks/usePolling.js';
import { openTunnel, closeTunnel, openAll, closeAll } from '../services/aptunnel.js';
import { saveSettings } from '../services/storage.js';
import { logger } from '../services/logger.js';
import { Status, Screen } from '../constants.js';

const COL = { DOT: 2, NAME: 20, TYPE: 11, STATUS: 8, PORT: 9, SEEN: 10, ARROW: 3 };

// ─── column headers ──────────────────────────────────────────────────────────
function ColumnHeaders() {
  return (
    <Box paddingLeft={COL.DOT + 1} gap={0}>
      <Box width={COL.NAME}><Text dimColor bold>name</Text></Box>
      <Box width={COL.TYPE}><Text dimColor bold>type</Text></Box>
      <Box width={COL.STATUS}><Text dimColor bold>status</Text></Box>
      <Box width={COL.PORT}><Text dimColor bold>port</Text></Box>
      <Box width={COL.SEEN}><Text dimColor bold>last seen</Text></Box>
    </Box>
  );
}

// ─── DB row ───────────────────────────────────────────────────────────────────
function DbRow({ db, envAlias, isFocused, nameMaxLength, onSelect }) {
  const { state } = useAppContext();
  const key = `${envAlias}/${db.dbAlias}`;
  const dbState = state.dbStates[key] ?? {};
  const tunnel = dbState.tunnel ?? Status.IDLE;
  const lastSeen = dbState.lastSeen ? new Date(dbState.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
  const preload = dbState.preloadStatus;

  const nameWidth = nameMaxLength ?? COL.NAME;

  return (
    <Box paddingLeft={1} gap={0} {...(isFocused ? { borderStyle: 'single', borderColor: 'cyan' } : {})}>
      {/* status dot */}
      <Box width={COL.DOT}><StatusDot status={tunnel} /></Box>
      <Text> </Text>

      {/* name — marquee on focus */}
      <Box width={nameWidth}>
        <MarqueeText
          text={db.dbAlias}
          width={nameWidth - 1}
          isActive={isFocused}
          color={isFocused ? 'cyan' : undefined}
        />
      </Box>

      {/* type */}
      <Box width={COL.TYPE}>
        <Text dimColor>{db.type?.slice(0, 10) ?? '?'}</Text>
      </Box>

      {/* status badge */}
      <Box width={COL.STATUS}>
        <StatusBadge status={tunnel} />
      </Box>

      {/* port */}
      <Box width={COL.PORT}>
        <Text color={isFocused ? 'cyan' : 'gray'} underline={isFocused}>:{db.port ?? '?'}</Text>
      </Box>

      {/* last seen */}
      <Box width={COL.SEEN}>
        <Text dimColor>{lastSeen}</Text>
      </Box>

      {/* preload faint status */}
      {preload && preload !== Status.LOADED && (
        <Text dimColor> ({preload})</Text>
      )}

      {/* navigate arrow */}
      {isFocused && <Text color="cyan"> [→]</Text>}
    </Box>
  );
}

// ─── Env row ──────────────────────────────────────────────────────────────────
function EnvRow({ env, isExpanded, isFocused, tunnelCounts, onToggle }) {
  const { up, total } = tunnelCounts;
  return (
    <Box gap={1} {...(isFocused && !isExpanded ? { borderStyle: 'single', borderColor: 'cyan' } : {})}>
      <Text color="cyan" bold>{isExpanded ? '▼' : '▶'}</Text>
      <Text bold color={isFocused ? 'cyan' : 'white'}>{env.envAlias}</Text>
      <Text dimColor>({up}/{total} up)</Text>
      <Text dimColor>  [↑ All]  [↓ All]  [⟳]  [hide ↯]</Text>
    </Box>
  );
}

// ─── Build flat nav list ──────────────────────────────────────────────────────
function buildItems(envs, expandedEnvs, hiddenEnvs, hiddenDbs, showHiddenEnvs, showHiddenDbsFor) {
  const items = [];
  const visibleEnvs = envs.filter(e => showHiddenEnvs || !hiddenEnvs.includes(e.envAlias));

  for (const env of visibleEnvs) {
    items.push({ type: 'env', env });
    if (!expandedEnvs.has(env.envAlias)) continue;
    items.push({ type: 'colheader', env });

    const showHidden = showHiddenDbsFor === env.envAlias;
    const visibleDbs = env.dbs.filter(db => {
      const key = `${env.envAlias}/${db.dbAlias}`;
      return showHidden || !hiddenDbs.includes(key);
    });
    for (const db of visibleDbs) {
      items.push({ type: 'db', db, env });
    }

    const hiddenCount = env.dbs.filter(db => hiddenDbs.includes(`${env.envAlias}/${db.dbAlias}`)).length;
    if (hiddenCount > 0 && !showHidden) {
      items.push({ type: 'show_hidden_dbs', env, count: hiddenCount });
    }
  }

  const hiddenEnvCount = envs.filter(e => hiddenEnvs.includes(e.envAlias)).length;
  if (hiddenEnvCount > 0 && !showHiddenEnvs) {
    items.push({ type: 'show_hidden_envs', count: hiddenEnvCount });
  }

  return items;
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { state, dispatch } = useAppContext();
  const { goTo, quit } = useNavigation();
  const { poll } = usePolling();

  const [cursor, setCursor] = useState(0);
  const [showHiddenEnvs, setShowHiddenEnvs] = useState(false);
  const [showHiddenDbsFor, setShowHiddenDbsFor] = useState(null);

  const hiddenEnvs = state.settings.hiddenEnvs ?? [];
  const hiddenDbs  = state.settings.hiddenDbs  ?? [];
  const nameMax    = state.settings.nameMaxLength ?? 18;

  const items = useMemo(() =>
    buildItems(state.envs, state.expandedEnvs, hiddenEnvs, hiddenDbs, showHiddenEnvs, showHiddenDbsFor),
    [state.envs, state.expandedEnvs, hiddenEnvs, hiddenDbs, showHiddenEnvs, showHiddenDbsFor]
  );

  const clamp = useCallback((n) => Math.max(0, Math.min(n, items.length - 1)), [items.length]);

  const tunnelCounts = useCallback((env) => {
    let up = 0;
    for (const db of env.dbs) {
      const key = `${env.envAlias}/${db.dbAlias}`;
      if (state.dbStates[key]?.tunnel === Status.CONNECTED) up++;
    }
    return { up, total: env.dbs.length };
  }, [state.dbStates]);

  // Save settings helper
  const persistSettings = useCallback(async (patch) => {
    const next = { ...state.settings, ...patch };
    dispatch({ type: 'SET_SETTINGS', settings: next });
    await saveSettings(next).catch(() => {});
  }, [state.settings, dispatch]);

  useInput((input, key) => {
    if (state.portEditor) return; // port editor captures input

    if (key.upArrow)    { setCursor(c => clamp(c - 1)); return; }
    if (key.downArrow)  { setCursor(c => clamp(c + 1)); return; }

    const item = items[cursor];
    if (!item) return;

    // Enter / right arrow — expand env or go to DB detail
    if (key.return || key.rightArrow) {
      if (item.type === 'env') {
        dispatch({ type: 'TOGGLE_ENV_EXPANDED', envAlias: item.env.envAlias });
      } else if (item.type === 'db') {
        goTo.dbDetail({ envAlias: item.env.envAlias, dbAlias: item.db.dbAlias });
      } else if (item.type === 'show_hidden_dbs') {
        setShowHiddenDbsFor(item.env.envAlias);
      } else if (item.type === 'show_hidden_envs') {
        setShowHiddenEnvs(true);
      }
      return;
    }

    // Collapse env with left arrow
    if (key.leftArrow && item.type === 'env') {
      if (state.expandedEnvs.has(item.env.envAlias)) {
        dispatch({ type: 'TOGGLE_ENV_EXPANDED', envAlias: item.env.envAlias });
      }
      return;
    }

    // o — open tunnel
    if (input === 'o' && item.type === 'db') {
      const { dbAlias, type } = item.db;
      const { envAlias } = item.env;
      const dbKey = `${envAlias}/${dbAlias}`;
      dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey, status: Status.CONNECTING });
      openTunnel(dbAlias).then(info => {
        dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey, status: Status.CONNECTED, tunnelInfo: info });
        logger.info(`Tunnel opened: ${dbAlias} :${info.port}`, { env: envAlias, db: dbAlias });
      }).catch(err => {
        dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey, status: Status.FAILED });
        dispatch({ type: 'SET_DB_ERROR', dbKey, error: err.message });
        logger.error(`Tunnel open failed: ${err.message}`, { env: envAlias, db: dbAlias });
      });
      return;
    }

    // c — close tunnel
    if (input === 'c' && item.type === 'db') {
      const { dbAlias } = item.db;
      const { envAlias } = item.env;
      const dbKey = `${envAlias}/${dbAlias}`;
      dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey, status: Status.DISCONNECTING });
      closeTunnel(dbAlias).then(() => {
        dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey, status: Status.IDLE });
        logger.info(`Tunnel closed: ${dbAlias}`, { env: envAlias, db: dbAlias });
      }).catch(err => {
        dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey, status: Status.FAILED });
        logger.error(`Tunnel close failed: ${err.message}`, { env: envAlias, db: dbAlias });
      });
      return;
    }

    // ↑ All — open all in env
    if (input === 'O' && item.type === 'env') {
      openAll(item.env.envAlias).catch(err => logger.error(`Open all failed: ${err.message}`, { env: item.env.envAlias }));
      return;
    }

    // ↓ All — close all in env
    if (input === 'C' && item.type === 'env') {
      closeAll(item.env.envAlias).catch(err => logger.error(`Close all failed: ${err.message}`, { env: item.env.envAlias }));
      return;
    }

    // h — hide
    if (input === 'h') {
      if (item.type === 'db') {
        const dbKey = `${item.env.envAlias}/${item.db.dbAlias}`;
        dispatch({ type: 'HIDE_DB', dbKey });
        const hiddenDbs = [...(state.settings.hiddenDbs ?? []), dbKey];
        persistSettings({ hiddenDbs });
        logger.info(`${item.db.dbAlias} hidden by user`, { env: item.env.envAlias, db: item.db.dbAlias });
      } else if (item.type === 'env') {
        dispatch({ type: 'HIDE_ENV', envAlias: item.env.envAlias });
        const hiddenEnvs = [...(state.settings.hiddenEnvs ?? []), item.env.envAlias];
        persistSettings({ hiddenEnvs });
        logger.info(`env ${item.env.envAlias} hidden by user`);
      }
      setCursor(c => clamp(c));
      return;
    }

    // p — port editor
    if (input === 'p' && item.type === 'db') {
      dispatch({ type: 'OPEN_PORT_EDITOR', dbKey: `${item.env.envAlias}/${item.db.dbAlias}`, dbAlias: item.db.dbAlias });
      return;
    }

    // r — refresh (poll now)
    if (input === 'r') { poll(); return; }

    // s — settings
    if (input === 's') { goTo.settings(); return; }

    // l — logs
    if (input === 'l') { goTo.logs(); return; }

    // q — quit
    if (input === 'q') { quit(); return; }
  });

  const footer = '[↑↓] nav  [Enter] open/expand  [o] open tunnel  [c] close  [p] port  [h] hide  [r] refresh  [s] settings  [l] logs  [Ctrl+C] quit';

  return (
    <AppLayout footer={footer}>
      {state.portEditor && (
        <Box justifyContent="center" marginY={1}>
          <PortEditor />
        </Box>
      )}

      {!state.portEditor && (
        <Box flexDirection="column">
          {items.length === 0 && (
            <Box marginTop={1}>
              <Text dimColor>No environments found. Run </Text>
              <Text color="cyan">aptunnel init</Text>
              <Text dimColor> to get started.</Text>
            </Box>
          )}

          {items.map((item, idx) => {
            const isFocused = idx === cursor;

            if (item.type === 'colheader') {
              return <ColumnHeaders key={`ch-${item.env.envAlias}`} />;
            }

            if (item.type === 'env') {
              return (
                <EnvRow
                  key={`env-${item.env.envAlias}`}
                  env={item.env}
                  isExpanded={state.expandedEnvs.has(item.env.envAlias)}
                  isFocused={isFocused}
                  tunnelCounts={tunnelCounts(item.env)}
                  onToggle={() => dispatch({ type: 'TOGGLE_ENV_EXPANDED', envAlias: item.env.envAlias })}
                />
              );
            }

            if (item.type === 'db') {
              return (
                <DbRow
                  key={`db-${item.env.envAlias}-${item.db.dbAlias}`}
                  db={item.db}
                  envAlias={item.env.envAlias}
                  isFocused={isFocused}
                  nameMaxLength={nameMax}
                />
              );
            }

            if (item.type === 'show_hidden_dbs') {
              return (
                <Box key={`shd-${item.env.envAlias}`} paddingLeft={4}>
                  <Text color={isFocused ? 'cyan' : 'gray'} underline>
                    + show hidden ({item.count})
                  </Text>
                </Box>
              );
            }

            if (item.type === 'show_hidden_envs') {
              return (
                <Box key="she" paddingLeft={0} marginTop={1}>
                  <Text color={isFocused ? 'cyan' : 'gray'} underline>
                    + show hidden envs ({item.count})
                  </Text>
                </Box>
              );
            }

            return null;
          })}
        </Box>
      )}
    </AppLayout>
  );
}
