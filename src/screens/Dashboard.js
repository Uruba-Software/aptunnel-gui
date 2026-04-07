/**
 * Dashboard — main screen.
 *
 * Navigation model:
 *  ↑ / ↓         — move cursor through items
 *  Enter / Space  — on env row: expand/collapse; on db row: toggle tunnel (open↔close)
 *  →              — on db row: go to DB Detail
 *  ←              — on env row: collapse
 *  o              — open tunnel (explicit)
 *  c              — close tunnel (explicit)
 *  Mouse click    — on status badge: toggle tunnel; on [→]: go to detail; on env: expand
 */
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import AppLayout from '../components/AppLayout.js';
import { StatusDot } from '../components/StatusBadge.js';
import MarqueeText from '../components/MarqueeText.js';
import PortEditor from '../components/PortEditor.js';
import { useAppContext } from '../state/AppContext.js';
import { useNavigation } from '../hooks/useNavigation.js';
import { usePolling } from '../hooks/usePolling.js';
import { registerClickRegion } from '../hooks/useMouse.js';
import { openTunnel, closeTunnel, openAll, closeAll } from '../services/aptunnel.js';
import { saveSettings } from '../services/storage.js';
import { logger } from '../services/logger.js';
import { Status } from '../constants.js';

// ─── Layout constants (character widths) ─────────────────────────────────────
const C = {
  GUTTER: 1,   // left indent
  DOT:    2,   // ● + space
  NAME:   19,  // db name cell
  TYPE:   11,  // type cell
  STATUS: 7,   // badge cell  [UP   ] = 7 chars
  PORT:   9,   // :55554
  SEEN:   8,   // HH:MM
  ARROW:  5,   // [→]
};
// Cumulative column start positions (0-indexed, inside content area)
const COL_STATUS_START = C.GUTTER + C.DOT + C.NAME + C.TYPE + 1;
const COL_PORT_START   = COL_STATUS_START + C.STATUS;
const COL_ARROW_START  = COL_PORT_START + C.PORT + C.SEEN;

// Terminal layout offsets for mouse hit-testing (1-indexed rows)
const HEADER_ROWS = 2; // title line + divider line

// ─── Status label (fixed-width, no Box) ──────────────────────────────────────
function StatusLabel({ status, isFocused }) {
  const map = {
    [Status.CONNECTED]:     { label: 'UP   ', color: 'green'  },
    [Status.IDLE]:          { label: 'DOWN ', color: 'red'    },
    [Status.CONNECTING]:    { label: 'CONN ', color: 'yellow' },
    [Status.DISCONNECTING]: { label: 'DISC ', color: 'yellow' },
    [Status.FAILED]:        { label: 'FAIL ', color: 'red'    },
    [Status.ERROR]:         { label: 'ERR  ', color: 'red'    },
  };
  const { label = '?    ', color = 'gray' } = map[status] ?? {};
  return (
    <Text color={color} bold inverse={isFocused}>
      {label}
    </Text>
  );
}

// ─── Column headers ───────────────────────────────────────────────────────────
function ColumnHeaders() {
  return (
    <Box paddingLeft={C.GUTTER + C.DOT}>
      <Box width={C.NAME}><Text dimColor bold>name</Text></Box>
      <Box width={C.TYPE}><Text dimColor bold>type</Text></Box>
      <Box width={C.STATUS}><Text dimColor bold>status</Text></Box>
      <Box width={C.PORT}><Text dimColor bold>port</Text></Box>
      <Box width={C.SEEN}><Text dimColor bold>last seen</Text></Box>
    </Box>
  );
}

// ─── Env row ──────────────────────────────────────────────────────────────────
function EnvRow({ env, isExpanded, isFocused, up, total }) {
  const icon = isExpanded ? '▼' : '▶';
  const color = isFocused ? 'cyan' : 'white';
  return (
    <Box paddingLeft={C.GUTTER} gap={1}>
      <Text color={color} bold>{icon}</Text>
      <Text color={color} bold>{env.envAlias}</Text>
      <Text dimColor>({up}/{total} up)</Text>
      <Text dimColor color="cyan">  [↑ All]  [↓ All]  [⟳]  [hide ↯]</Text>
    </Box>
  );
}

// ─── DB row ───────────────────────────────────────────────────────────────────
function DbRow({ db, envAlias, isFocused, nameMaxLength }) {
  const { state } = useAppContext();
  const key = `${envAlias}/${db.dbAlias}`;
  const dbState = state.dbStates[key] ?? {};
  const tunnel = dbState.tunnel ?? Status.IDLE;
  const lastSeen = dbState.lastSeen
    ? new Date(dbState.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—';
  const nameW = (nameMaxLength ?? C.NAME) - 1;

  return (
    <Box paddingLeft={C.GUTTER}>
      {/* dot */}
      <Box width={C.DOT}>
        <StatusDot status={tunnel} />
        <Text> </Text>
      </Box>
      {/* name */}
      <Box width={C.NAME}>
        <MarqueeText text={db.dbAlias} width={nameW} isActive={isFocused}
          color={isFocused ? 'cyan' : undefined} />
        <Text> </Text>
      </Box>
      {/* type */}
      <Box width={C.TYPE}>
        <Text dimColor>{(db.type ?? '?').slice(0, C.TYPE - 1).padEnd(C.TYPE - 1)}</Text>
        <Text> </Text>
      </Box>
      {/* status */}
      <Box width={C.STATUS}>
        <StatusLabel status={tunnel} isFocused={false} />
      </Box>
      {/* port */}
      <Box width={C.PORT}>
        <Text color={isFocused ? 'cyan' : 'gray'}>:{db.port ?? '?'}</Text>
        <Text>  </Text>
      </Box>
      {/* last seen */}
      <Box width={C.SEEN}>
        <Text dimColor>{lastSeen}</Text>
      </Box>
      {/* arrow */}
      {isFocused && <Text color="cyan"> [→]</Text>}
    </Box>
  );
}

// ─── Build flat nav item list ─────────────────────────────────────────────────
function buildItems(envs, expandedEnvs, hiddenEnvs, hiddenDbs, showHiddenEnvs, showHiddenDbsFor) {
  const items = [];
  const visibleEnvs = envs.filter(e => showHiddenEnvs || !hiddenEnvs.includes(e.envAlias));

  for (const env of visibleEnvs) {
    items.push({ type: 'env', env });

    if (!expandedEnvs.has(env.envAlias)) continue;

    items.push({ type: 'colheader', env });

    const showHidden = showHiddenDbsFor === env.envAlias;
    const visibleDbs = env.dbs.filter(db => {
      const k = `${env.envAlias}/${db.dbAlias}`;
      return showHidden || !hiddenDbs.includes(k);
    });
    for (const db of visibleDbs) items.push({ type: 'db', db, env });

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

// ─── Tunnel toggle helper ─────────────────────────────────────────────────────
function useTunnelToggle() {
  const { state, dispatch } = useAppContext();
  return useCallback(async (db, envAlias) => {
    const key = `${envAlias}/${db.dbAlias}`;
    const tunnel = state.dbStates[key]?.tunnel ?? Status.IDLE;
    if (tunnel === Status.CONNECTED || tunnel === Status.CONNECTING) {
      dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey: key, status: Status.DISCONNECTING });
      closeTunnel(db.dbAlias)
        .then(() => {
          dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey: key, status: Status.IDLE });
          logger.info(`Tunnel closed: ${db.dbAlias}`, { env: envAlias, db: db.dbAlias });
        })
        .catch(err => {
          dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey: key, status: Status.FAILED });
          logger.error(`Tunnel close failed: ${err.message}`, { env: envAlias, db: db.dbAlias });
        });
    } else {
      dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey: key, status: Status.CONNECTING });
      openTunnel(db.dbAlias)
        .then(info => {
          dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey: key, status: Status.CONNECTED, tunnelInfo: info });
          logger.info(`Tunnel opened: ${db.dbAlias} :${info?.port}`, { env: envAlias, db: db.dbAlias });
        })
        .catch(err => {
          dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey: key, status: Status.FAILED });
          logger.error(`Tunnel open failed: ${err.message}`, { env: envAlias, db: db.dbAlias });
        });
    }
  }, [state.dbStates, dispatch]);
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { state, dispatch } = useAppContext();
  const { goTo, quit } = useNavigation();
  const { stdout } = useStdout();
  const { poll } = usePolling();
  const toggleTunnel = useTunnelToggle();

  const [cursor, setCursor] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [showHiddenEnvs, setShowHiddenEnvs] = useState(false);
  const [showHiddenDbsFor, setShowHiddenDbsFor] = useState(null);

  const hiddenEnvs = state.settings.hiddenEnvs ?? [];
  const hiddenDbs  = state.settings.hiddenDbs  ?? [];
  const nameMax    = state.settings.nameMaxLength ?? C.NAME;

  const cols = stdout?.columns ?? 80;
  const rows = stdout?.rows    ?? 24;
  // visible content rows = total rows minus header(2) + divider(1) + footer(2)
  const contentHeight = Math.max(4, rows - 5);

  const items = useMemo(() =>
    buildItems(state.envs, state.expandedEnvs, hiddenEnvs, hiddenDbs, showHiddenEnvs, showHiddenDbsFor),
    [state.envs, state.expandedEnvs, hiddenEnvs, hiddenDbs, showHiddenEnvs, showHiddenDbsFor]
  );

  const clamp = useCallback(n => Math.max(0, Math.min(n, items.length - 1)), [items.length]);

  // Keep scroll window around cursor
  useEffect(() => {
    if (cursor < scrollOffset) setScrollOffset(cursor);
    else if (cursor >= scrollOffset + contentHeight) setScrollOffset(cursor - contentHeight + 1);
  }, [cursor, scrollOffset, contentHeight]);

  // ── Mouse handler ───────────────────────────────────────────────────────────
  const mouseHandler = useCallback((event) => {
    if (event.type !== 'mousedown') return;
    const { x, y } = event;
    // y=1 is title line, y=2 is divider, content rows start at y=3
    const itemIdx = scrollOffset + (y - HEADER_ROWS - 1);
    if (itemIdx < 0 || itemIdx >= items.length) return;
    const item = items[itemIdx];
    if (!item) return;

    setCursor(itemIdx);

    if (item.type === 'db') {
      // Click on status badge column → toggle tunnel
      const statusX1 = COL_STATUS_START + 1;
      const statusX2 = COL_STATUS_START + C.STATUS;
      if (x >= statusX1 && x <= statusX2) {
        toggleTunnel(item.db, item.env.envAlias);
        return;
      }
      // Click on arrow → go to detail
      const arrowX1 = COL_ARROW_START + 1;
      if (x >= arrowX1) {
        goTo.dbDetail({ envAlias: item.env.envAlias, dbAlias: item.db.dbAlias });
        return;
      }
      // Click anywhere else on DB row → toggle tunnel
      toggleTunnel(item.db, item.env.envAlias);
    }

    if (item.type === 'env') {
      dispatch({ type: 'TOGGLE_ENV_EXPANDED', envAlias: item.env.envAlias });
    }

    if (item.type === 'show_hidden_dbs') setShowHiddenDbsFor(item.env.envAlias);
    if (item.type === 'show_hidden_envs') setShowHiddenEnvs(true);
  }, [items, scrollOffset, toggleTunnel, goTo, dispatch]);

  // ── Persist settings helper ────────────────────────────────────────────────
  const persistSettings = useCallback(async (patch) => {
    const next = { ...state.settings, ...patch };
    dispatch({ type: 'SET_SETTINGS', settings: next });
    await saveSettings(next).catch(() => {});
  }, [state.settings, dispatch]);

  // ── Keyboard ───────────────────────────────────────────────────────────────
  useInput((input, key) => {
    if (state.portEditor) return;

    if (key.upArrow)   { setCursor(c => clamp(c - 1)); return; }
    if (key.downArrow) { setCursor(c => clamp(c + 1)); return; }

    const item = items[cursor];
    if (!item) return;

    // Enter / Space — primary action
    if (key.return || input === ' ') {
      if (item.type === 'env') {
        dispatch({ type: 'TOGGLE_ENV_EXPANDED', envAlias: item.env.envAlias });
      } else if (item.type === 'db') {
        // Primary action = toggle tunnel
        toggleTunnel(item.db, item.env.envAlias);
      } else if (item.type === 'show_hidden_dbs') {
        setShowHiddenDbsFor(item.env.envAlias);
      } else if (item.type === 'show_hidden_envs') {
        setShowHiddenEnvs(true);
      }
      return;
    }

    // → go to DB detail
    if (key.rightArrow) {
      if (item.type === 'db') {
        goTo.dbDetail({ envAlias: item.env.envAlias, dbAlias: item.db.dbAlias });
      } else if (item.type === 'env') {
        dispatch({ type: 'TOGGLE_ENV_EXPANDED', envAlias: item.env.envAlias });
      }
      return;
    }

    // ← collapse env
    if (key.leftArrow && item.type === 'env') {
      if (state.expandedEnvs.has(item.env.envAlias))
        dispatch({ type: 'TOGGLE_ENV_EXPANDED', envAlias: item.env.envAlias });
      return;
    }

    // d — go to DB detail (alternative)
    if (input === 'd' && item.type === 'db') {
      goTo.dbDetail({ envAlias: item.env.envAlias, dbAlias: item.db.dbAlias });
      return;
    }

    // o — explicit open
    if (input === 'o' && item.type === 'db') {
      const key = `${item.env.envAlias}/${item.db.dbAlias}`;
      dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey: key, status: Status.CONNECTING });
      openTunnel(item.db.dbAlias)
        .then(info => {
          dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey: key, status: Status.CONNECTED, tunnelInfo: info });
          logger.info(`Tunnel opened: ${item.db.dbAlias}`, { env: item.env.envAlias, db: item.db.dbAlias });
        })
        .catch(err => {
          dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey: key, status: Status.FAILED });
          logger.error(`Tunnel open failed: ${err.message}`, { env: item.env.envAlias, db: item.db.dbAlias });
        });
      return;
    }

    // c — explicit close
    if (input === 'c' && item.type === 'db') {
      const key = `${item.env.envAlias}/${item.db.dbAlias}`;
      dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey: key, status: Status.DISCONNECTING });
      closeTunnel(item.db.dbAlias)
        .then(() => {
          dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey: key, status: Status.IDLE });
          logger.info(`Tunnel closed: ${item.db.dbAlias}`, { env: item.env.envAlias, db: item.db.dbAlias });
        })
        .catch(err => {
          dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey: key, status: Status.FAILED });
          logger.error(`Tunnel close failed: ${err.message}`, { env: item.env.envAlias, db: item.db.dbAlias });
        });
      return;
    }

    // O/C — bulk open/close env
    if (input === 'O' && item.type === 'env') {
      openAll(item.env.envAlias).catch(err =>
        logger.error(`Open all failed: ${err.message}`, { env: item.env.envAlias }));
      return;
    }
    if (input === 'C' && item.type === 'env') {
      closeAll(item.env.envAlias).catch(err =>
        logger.error(`Close all failed: ${err.message}`, { env: item.env.envAlias }));
      return;
    }

    // h — hide
    if (input === 'h') {
      if (item.type === 'db') {
        const dbKey = `${item.env.envAlias}/${item.db.dbAlias}`;
        const hiddenDbs = [...(state.settings.hiddenDbs ?? []), dbKey];
        persistSettings({ hiddenDbs });
        logger.info(`${item.db.dbAlias} hidden`, { env: item.env.envAlias, db: item.db.dbAlias });
      } else if (item.type === 'env') {
        const hiddenEnvs = [...(state.settings.hiddenEnvs ?? []), item.env.envAlias];
        persistSettings({ hiddenEnvs });
        logger.info(`env ${item.env.envAlias} hidden`);
      }
      setCursor(c => clamp(c));
      return;
    }

    // p — port editor
    if (input === 'p' && item.type === 'db') {
      dispatch({ type: 'OPEN_PORT_EDITOR', dbKey: `${item.env.envAlias}/${item.db.dbAlias}`, dbAlias: item.db.dbAlias });
      return;
    }

    // r — refresh
    if (input === 'r') { poll(); return; }
    // s — settings
    if (input === 's') { goTo.settings(); return; }
    // l — logs
    if (input === 'l') { goTo.logs(); return; }
    // q — quit
    if (input === 'q') { quit(); return; }
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  const footer = '↑↓ nav  Enter/Spc toggle tunnel  → detail  o open  c close  p port  h hide  r refresh  s settings  l logs  Ctrl+C quit';

  const visibleItems = items.slice(scrollOffset, scrollOffset + contentHeight);

  return (
    <AppLayout footer={footer} mouseHandler={mouseHandler}>
      {state.portEditor && (
        <Box justifyContent="center" marginY={1}>
          <PortEditor />
        </Box>
      )}

      {!state.portEditor && (
        <Box flexDirection="column">
          {items.length === 0 && (
            <Box marginTop={1} gap={1}>
              <Text dimColor>No environments found. Run</Text>
              <Text color="cyan">aptunnel init</Text>
              <Text dimColor>to get started.</Text>
            </Box>
          )}

          {visibleItems.map((item, visIdx) => {
            const absIdx = scrollOffset + visIdx;
            const isFocused = absIdx === cursor;

            if (item.type === 'colheader') {
              return <ColumnHeaders key={`ch-${item.env.envAlias}`} />;
            }

            if (item.type === 'env') {
              const up = item.env.dbs.filter(db => {
                const k = `${item.env.envAlias}/${db.dbAlias}`;
                return state.dbStates[k]?.tunnel === Status.CONNECTED;
              }).length;
              return (
                <Box key={`env-${item.env.envAlias}`}>
                  <EnvRow
                    env={item.env}
                    isExpanded={state.expandedEnvs.has(item.env.envAlias)}
                    isFocused={isFocused}
                    up={up}
                    total={item.env.dbs.length}
                  />
                </Box>
              );
            }

            if (item.type === 'db') {
              return (
                <Box key={`db-${item.env.envAlias}-${item.db.dbAlias}`}>
                  <DbRow
                    db={item.db}
                    envAlias={item.env.envAlias}
                    isFocused={isFocused}
                    nameMaxLength={nameMax}
                  />
                </Box>
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
                <Box key="she" marginTop={1}>
                  <Text color={isFocused ? 'cyan' : 'gray'} underline>
                    + show hidden envs ({item.count})
                  </Text>
                </Box>
              );
            }

            return null;
          })}

          {/* scroll indicator */}
          {items.length > contentHeight && (
            <Box>
              <Text dimColor>
                {scrollOffset + 1}–{Math.min(scrollOffset + contentHeight, items.length)}/{items.length}
                {scrollOffset + contentHeight < items.length ? '  ↓' : ''}
              </Text>
            </Box>
          )}
        </Box>
      )}
    </AppLayout>
  );
}
