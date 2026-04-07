/**
 * DB Detail — full-page view for a single database.
 *
 * Navigation model:
 *  Tab / Shift+Tab  — cycle focus through interactive elements (Lynx-style)
 *  Enter / Space    — activate focused element
 *  ← / →           — navigate to prev / next DB
 *  Esc              — back to Dashboard
 *  o / c / t / p / h — direct key shortcuts (always active)
 *  Y / n            — confirm / cancel "Open tunnel?" prompt
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import AppLayout from '../components/AppLayout.js';
import StatusBadge, { StatusDot } from '../components/StatusBadge.js';
import PortEditor from '../components/PortEditor.js';
import { useAppContext } from '../state/AppContext.js';
import { useNavigation } from '../hooks/useNavigation.js';
import { registerClickRegion } from '../hooks/useMouse.js';
import { openTunnel, closeTunnel } from '../services/aptunnel.js';
import { loadCache, saveCache } from '../services/storage.js';
import { logger } from '../services/logger.js';
import { Status, AutoOpenTunnel, DbType } from '../constants.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(b) {
  if (!b) return '0 B';
  if (b < 1024)       return `${b} B`;
  if (b < 1048576)    return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(1)} GB`;
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── Focus items ─────────────────────────────────────────────────────────────
const FOCUS_OPEN   = 'open';
const FOCUS_CLOSE  = 'close';
const FOCUS_PORT   = 'port';
const FOCUS_HIDE   = 'hide';
const FOCUS_CREDS  = 'credentials';
const FOCUS_SCHEMA = 'schema';

const FOCUS_ORDER = [FOCUS_OPEN, FOCUS_CLOSE, FOCUS_PORT, FOCUS_HIDE, FOCUS_CREDS, FOCUS_SCHEMA];

// ─── Action button ────────────────────────────────────────────────────────────
function ActionBtn({ label, focused, disabled }) {
  const color = disabled ? 'gray' : focused ? 'black' : 'cyan';
  const bg    = focused && !disabled ? 'cyan' : undefined;
  return (
    <Box marginRight={1}>
      <Text color={color} backgroundColor={bg} bold={focused}>[{label}]</Text>
    </Box>
  );
}

// ─── Credentials display ──────────────────────────────────────────────────────
function CredentialsSection({ tunnelInfo, visible, focused }) {
  if (!visible) {
    return (
      <Box gap={1}>
        <Text dimColor>Credentials:</Text>
        <Text>●●●●●●●●</Text>
        <Box marginLeft={1}>
          <ActionBtn label="t  Show" focused={focused} />
        </Box>
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text dimColor>Credentials:</Text>
        <ActionBtn label="t  Hide" focused={focused} />
      </Box>
      {tunnelInfo?.user     && <Box paddingLeft={2} gap={1}><Text dimColor>User:</Text>    <Text>{tunnelInfo.user}</Text></Box>}
      {tunnelInfo?.password && <Box paddingLeft={2} gap={1}><Text dimColor>Pass:</Text>    <Text>{tunnelInfo.password}</Text></Box>}
      {tunnelInfo?.url      && <Box paddingLeft={2} gap={1}><Text dimColor>URL: </Text>    <Text>{tunnelInfo.url}</Text></Box>}
      {tunnelInfo?.host     && <Box paddingLeft={2} gap={1}><Text dimColor>Host:</Text>    <Text>{tunnelInfo.host}</Text></Box>}
      {!tunnelInfo?.user    && <Box paddingLeft={2}><Text dimColor>(Connect tunnel to load credentials)</Text></Box>}
    </Box>
  );
}

// ─── Schema section ───────────────────────────────────────────────────────────
function SchemaSection({ envAlias, dbAlias, dbKey, tunnelStatus, settings, dispatch, focused, onLoad, schemaData, loadedAt, loading }) {
  const [open, setOpen] = useState(true);
  const [openSchemas, setOpenSchemas] = useState({});

  const hasData = schemaData && schemaData.length > 0;
  const needsTunnel = tunnelStatus !== Status.CONNECTED;

  return (
    <Box flexDirection="column">
      {/* Section header */}
      <Box gap={1}>
        <Text color={focused ? 'cyan' : 'white'} bold={focused}>
          {open ? '[▼]' : '[▶]'}
        </Text>
        <Text bold color={focused ? 'cyan' : 'white'}>Schemas</Text>
        {hasData && <Text dimColor>({schemaData.length} schemas)</Text>}
        {loading
          ? <Text color="yellow"> loading…</Text>
          : loadedAt && <Text dimColor> loaded: {fmtTime(loadedAt)}</Text>}
        {!loading && (
          <Box marginLeft={1}>
            <Text color={focused ? 'cyan' : 'gray'}>[Enter/⟳ {hasData ? 'Reload' : 'Load'}]</Text>
          </Box>
        )}
        {focused && <Text color="cyan"> ◀ focused</Text>}
      </Box>

      {/* Content */}
      {open && (
        <Box flexDirection="column" paddingLeft={2}>
          {!hasData && !loading && (
            <Box gap={1} marginTop={0}>
              <Text dimColor>No data loaded.</Text>
              {needsTunnel
                ? <Text color="yellow">Tunnel must be open. Press Enter or [o] to open &amp; load.</Text>
                : <Text color="cyan">Press Enter or ⟳ to load schema.</Text>}
            </Box>
          )}
          {hasData && schemaData.map(schema => (
            <Box key={schema.name} flexDirection="column" marginTop={0}>
              <Box gap={1}>
                <Text
                  color="cyan"
                  bold
                  onPress={() => setOpenSchemas(s => ({ ...s, [schema.name]: !s[schema.name] }))}
                >
                  {openSchemas[schema.name] ? '[▼]' : '[▶]'} {schema.name}
                </Text>
                <Text dimColor>
                  ({schema.tables?.length ?? 0} tables{schema.sizeBytes ? `, ${fmtBytes(schema.sizeBytes)}` : ''})
                </Text>
              </Box>
              {openSchemas[schema.name] && schema.tables?.length > 0 && (
                <Box flexDirection="column" paddingLeft={2}>
                  {schema.tables.map(t => (
                    <Text key={t.name ?? t} dimColor>  {t.name ?? t}</Text>
                  ))}
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

// ─── Main DB Detail screen ────────────────────────────────────────────────────
export default function DbDetail({ params }) {
  const { envAlias, dbAlias } = params ?? {};
  const { state, dispatch } = useAppContext();
  const { pop, goTo } = useNavigation();
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;

  const dbKey = `${envAlias}/${dbAlias}`;
  const dbState = state.dbStates[dbKey] ?? {};
  const tunnel = dbState.tunnel ?? Status.IDLE;
  const tunnelInfo = dbState.tunnelInfo ?? null;
  const credVisible = dbState.credentialsVisible ?? false;

  // Find adjacent DBs for ← / → navigation
  const env = state.envs.find(e => e.envAlias === envAlias);
  const dbs = env?.dbs ?? [];
  const currentIdx = dbs.findIndex(d => d.dbAlias === dbAlias);
  const prevDb = currentIdx > 0              ? dbs[currentIdx - 1] : null;
  const nextDb = currentIdx < dbs.length - 1 ? dbs[currentIdx + 1] : null;
  const db = dbs[currentIdx];

  // ── Focus (Lynx-style) ─────────────────────────────────────────────────────
  const [focusIdx, setFocusIdx] = useState(0);
  const focusItem = FOCUS_ORDER[focusIdx] ?? FOCUS_OPEN;

  const focusNext = useCallback(() =>
    setFocusIdx(i => (i + 1) % FOCUS_ORDER.length), []);
  const focusPrev = useCallback(() =>
    setFocusIdx(i => (i - 1 + FOCUS_ORDER.length) % FOCUS_ORDER.length), []);

  // ── Y/N confirmation prompt ─────────────────────────────────────────────────
  const [confirmPrompt, setConfirmPrompt] = useState(null); // null | 'schema_open'

  // ── Schema state ────────────────────────────────────────────────────────────
  const [schemaData, setSchemaData] = useState(null);
  const [loadedAt, setLoadedAt]     = useState(null);
  const [loading, setLoading]       = useState(false);

  // Load cached schema on mount
  useEffect(() => {
    loadCache(envAlias, dbAlias).then(cached => {
      if (cached) {
        setSchemaData(cached.schemas ?? null);
        setLoadedAt(cached.savedAt ?? null);
      }
    });
  }, [envAlias, dbAlias]);

  // ── Tunnel open/close ──────────────────────────────────────────────────────
  const handleOpen = useCallback(async () => {
    dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey, status: Status.CONNECTING });
    try {
      const info = await openTunnel(dbAlias);
      dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey, status: Status.CONNECTED, tunnelInfo: info });
      logger.info(`Tunnel opened: ${dbAlias} :${info?.port}`, { env: envAlias, db: dbAlias });
      return true;
    } catch (err) {
      dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey, status: Status.FAILED });
      logger.error(`Tunnel open failed: ${err.message}`, { env: envAlias, db: dbAlias });
      return false;
    }
  }, [dbKey, dbAlias, envAlias, dispatch]);

  const handleClose = useCallback(async () => {
    dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey, status: Status.DISCONNECTING });
    try {
      await closeTunnel(dbAlias);
      dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey, status: Status.IDLE });
      logger.info(`Tunnel closed: ${dbAlias}`, { env: envAlias, db: dbAlias });
    } catch (err) {
      dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey, status: Status.FAILED });
      logger.error(`Tunnel close failed: ${err.message}`, { env: envAlias, db: dbAlias });
    }
  }, [dbKey, dbAlias, envAlias, dispatch]);

  const handleHide = useCallback(() => {
    dispatch({ type: 'HIDE_DB', dbKey });
    pop();
  }, [dbKey, dispatch, pop]);

  // ── Schema load ─────────────────────────────────────────────────────────────
  const doLoadSchema = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      // Placeholder — replace with real driver queries during driver integration
      const schemas = [
        { name: 'public', tables: [], views: [], indexes: [], triggers: [], functions: [], sizeBytes: 0 }
      ];
      const now = new Date().toISOString();
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

  // Trigger schema load — handles tunnel-down cases
  const handleSchemaLoad = useCallback(async () => {
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
      setConfirmPrompt('schema_open');
      return;
    }
    // NEVER — show message but don't open
    logger.warn('Schema load skipped: tunnel closed and auto-open is disabled.', { env: envAlias, db: dbAlias });
  }, [tunnel, state.settings.autoOpenTunnel, doLoadSchema, handleOpen, envAlias, dbAlias]);

  // ── Activate focused element ────────────────────────────────────────────────
  const activateFocused = useCallback(() => {
    switch (focusItem) {
      case FOCUS_OPEN:  handleOpen();  break;
      case FOCUS_CLOSE: handleClose(); break;
      case FOCUS_PORT:  dispatch({ type: 'OPEN_PORT_EDITOR', dbKey, dbAlias }); break;
      case FOCUS_HIDE:  handleHide(); break;
      case FOCUS_CREDS: dispatch({ type: 'TOGGLE_CREDENTIALS', dbKey }); break;
      case FOCUS_SCHEMA: handleSchemaLoad(); break;
    }
  }, [focusItem, handleOpen, handleClose, handleHide, handleSchemaLoad, dispatch, dbKey, dbAlias]);

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useInput((input, key) => {
    if (state.portEditor) return;

    // Y/N confirmation prompt active
    if (confirmPrompt) {
      if (input === 'y' || input === 'Y') {
        setConfirmPrompt(null);
        handleOpen().then(ok => { if (ok) doLoadSchema(); });
      } else if (input === 'n' || input === 'N' || key.escape) {
        setConfirmPrompt(null);
      }
      return;
    }

    // Esc = back
    if (key.escape) { pop(); return; }

    // Tab / Shift+Tab — cycle focus
    if (key.tab && !key.shift) { focusNext(); return; }
    if (key.tab && key.shift)  { focusPrev(); return; }

    // ← / → — prev/next DB
    if (key.leftArrow  && prevDb) {
      goTo.dbDetail({ envAlias, dbAlias: prevDb.dbAlias });
      return;
    }
    if (key.rightArrow && nextDb) {
      goTo.dbDetail({ envAlias, dbAlias: nextDb.dbAlias });
      return;
    }

    // Enter / Space — activate focused element
    if (key.return || input === ' ') {
      activateFocused();
      return;
    }

    // Direct shortcut keys (always active regardless of focus)
    if (input === 'o') { handleOpen();  return; }
    if (input === 'c') { handleClose(); return; }
    if (input === 't') { dispatch({ type: 'TOGGLE_CREDENTIALS', dbKey }); return; }
    if (input === 'p') { dispatch({ type: 'OPEN_PORT_EDITOR', dbKey, dbAlias }); return; }
    if (input === 'h') { handleHide(); return; }
    if (input === 's') { handleSchemaLoad(); return; }
  });

  // ── Divider ────────────────────────────────────────────────────────────────
  const div = '─'.repeat(Math.min(cols - 2, 60));

  const footer = 'Tab focus  Enter activate  ← prev  → next  o open  c close  t creds  p port  s schema  h hide  Esc back';

  return (
    <AppLayout footer={footer}>
      {/* Port editor overlay */}
      {state.portEditor && (
        <Box justifyContent="center" marginY={1}>
          <PortEditor />
        </Box>
      )}

      {!state.portEditor && (
        <Box flexDirection="column" paddingLeft={1} gap={0}>

          {/* ── Breadcrumb + prev/next ─────────────────────────────────────── */}
          <Box gap={1} flexWrap="nowrap">
            {prevDb
              ? <Text color="cyan">[← {prevDb.dbAlias}]</Text>
              : <Text dimColor>[← —]</Text>}
            <Text dimColor> {envAlias} › </Text>
            <Text bold color="cyan">{dbAlias}</Text>
            <Text dimColor> ({db?.type ?? '?'})</Text>
            {nextDb
              ? <Text color="cyan"> [{nextDb.dbAlias} →]</Text>
              : <Text dimColor> [— →]</Text>}
            <Text dimColor>  [Esc back]</Text>
          </Box>

          <Text dimColor>{div}</Text>

          {/* ── Status + action buttons ────────────────────────────────────── */}
          <Box gap={2} marginTop={0} alignItems="flex-start">
            <Box gap={1}>
              <Text dimColor>Status:</Text>
              <StatusDot status={tunnel} />
              <StatusBadge status={tunnel} />
            </Box>
            <Text dimColor>Port: :{db?.port ?? '?'}</Text>
          </Box>

          {/* Action buttons row — Tab-focusable */}
          <Box gap={0} marginTop={1} flexWrap="nowrap">
            <ActionBtn label="o Open"  focused={focusItem === FOCUS_OPEN}  disabled={tunnel === Status.CONNECTED || tunnel === Status.CONNECTING} />
            <ActionBtn label="c Close" focused={focusItem === FOCUS_CLOSE} disabled={tunnel === Status.IDLE} />
            <ActionBtn label="p Port"  focused={focusItem === FOCUS_PORT} />
            <ActionBtn label="h Hide"  focused={focusItem === FOCUS_HIDE} />
          </Box>

          {/* ── Credentials ────────────────────────────────────────────────── */}
          <Box marginTop={1}>
            <CredentialsSection
              tunnelInfo={tunnelInfo}
              visible={credVisible}
              focused={focusItem === FOCUS_CREDS}
            />
          </Box>

          <Text dimColor>{div}</Text>

          {/* ── Y/N confirmation prompt ────────────────────────────────────── */}
          {confirmPrompt && (
            <Box marginY={1} gap={1}>
              <Text color="yellow">⚠  Tunnel must be open to load schema.</Text>
              <Text bold color="cyan">Open tunnel now? [Y/n]</Text>
            </Box>
          )}

          {/* ── Schema section ─────────────────────────────────────────────── */}
          {(db?.type === DbType.POSTGRES || db?.type === DbType.MYSQL || !db?.type) && (
            <SchemaSection
              envAlias={envAlias}
              dbAlias={dbAlias}
              dbKey={dbKey}
              tunnelStatus={tunnel}
              settings={state.settings}
              dispatch={dispatch}
              focused={focusItem === FOCUS_SCHEMA}
              onLoad={handleSchemaLoad}
              schemaData={schemaData}
              loadedAt={loadedAt}
              loading={loading}
            />
          )}

          {db?.type === DbType.REDIS && (
            <Box flexDirection="column" gap={1} marginTop={1}>
              <Text bold>Keyspace</Text>
              <Text dimColor>Connect tunnel to browse keyspace data.</Text>
            </Box>
          )}

          {db?.type === DbType.ELASTICSEARCH && (
            <Box flexDirection="column" gap={1} marginTop={1}>
              <Text bold>Indices</Text>
              <Text dimColor>Connect tunnel to browse index data.</Text>
            </Box>
          )}

          {/* ── Error display ───────────────────────────────────────────────── */}
          {dbState.error && (
            <Box marginTop={1}>
              <Text color="red">✖ {dbState.error}</Text>
            </Box>
          )}

          {/* ── Focus hint ─────────────────────────────────────────────────── */}
          <Box marginTop={1}>
            <Text dimColor>Tab to cycle focus  ·  focused: </Text>
            <Text color="cyan">{focusItem}</Text>
          </Box>
        </Box>
      )}
    </AppLayout>
  );
}
