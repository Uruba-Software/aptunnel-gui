/**
 * DB Detail — full-page view for a single database.
 * Schema accordion, credentials toggle, port editor, per-section refresh.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import AppLayout from '../components/AppLayout.js';
import StatusBadge, { StatusDot } from '../components/StatusBadge.js';
import PortEditor from '../components/PortEditor.js';
import { useAppContext } from '../state/AppContext.js';
import { useNavigation } from '../hooks/useNavigation.js';
import { openTunnel, closeTunnel } from '../services/aptunnel.js';
import { loadCache, saveCache } from '../services/storage.js';
import { logger } from '../services/logger.js';
import { Status, AutoOpenTunnel, DbType } from '../constants.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (!n) return '0';
  return n.toLocaleString();
}

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

// ─── Accordion section ────────────────────────────────────────────────────────
function Section({ title, count, isOpen, isFocused, loadedAt, loading, children, onToggle, onRefresh }) {
  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text color={isFocused ? 'cyan' : 'white'}>{isOpen ? '[▼]' : '[▶]'}</Text>
        <Text bold={isFocused} color={isFocused ? 'cyan' : 'white'}>{title}</Text>
        {count != null && <Text dimColor>({count})</Text>}
        <Text> </Text>
        {loading
          ? <Text color="yellow">loading…</Text>
          : loadedAt && <Text dimColor>loaded: {fmtTime(loadedAt)}</Text>}
        {onRefresh && !loading && <Text dimColor> [⟳]</Text>}
      </Box>
      {isOpen && children && (
        <Box flexDirection="column" paddingLeft={2}>
          {children}
        </Box>
      )}
    </Box>
  );
}

// ─── Schema accordion (postgres/mysql) ───────────────────────────────────────
function SchemaSection({ schema, dbKey, envAlias, dbAlias, tunnelStatus, settings, dispatch }) {
  const [open, setOpen] = useState({});
  const [data, setData] = useState(null);
  const [loadedAt, setLoadedAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sections, setSections] = useState({});
  const [openSchemas, setOpenSchemas] = useState({});
  const [cursor, setCursor] = useState(0);

  const autoOpenAndLoad = useCallback(async () => {
    if (tunnelStatus === Status.CONNECTED) {
      await loadSchemas();
      return;
    }
    if (settings.autoOpenTunnel === AutoOpenTunnel.ALWAYS) {
      dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey, status: Status.CONNECTING });
      try {
        const info = await openTunnel(dbAlias);
        dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey, status: Status.CONNECTED, tunnelInfo: info });
        await loadSchemas();
      } catch (err) {
        dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey, status: Status.FAILED });
        logger.error(`Auto-open tunnel failed: ${err.message}`, { env: envAlias, db: dbAlias });
      }
    }
  }, [tunnelStatus, settings.autoOpenTunnel, dbKey, dbAlias, dispatch]);

  // Load cached data on mount
  useEffect(() => {
    loadCache(envAlias, dbAlias).then(cached => {
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
      // TODO: execute DB-specific queries once pg/mysql2 drivers are integrated
      // For now, set a placeholder so the UI renders correctly
      const schemas = await fetchSchemasFromDb(dbAlias, dbKey, settings);
      const now = new Date().toISOString();
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

  // Placeholder — replace with real driver queries in driver integration phase
  async function fetchSchemasFromDb() {
    return [{ name: 'public', tables: [], views: [], indexes: [], triggers: [], functions: [], sizeBytes: 0 }];
  }

  return (
    <Section
      title="Schemas"
      count={data?.length}
      isOpen={true}
      isFocused={false}
      loadedAt={loadedAt}
      loading={loading}
      onRefresh={autoOpenAndLoad}
    >
      {!data && !loading && (
        <Box marginLeft={2} gap={1}>
          <Text dimColor>No data loaded.</Text>
          <Text color="cyan" underline>[⟳] Load now</Text>
        </Box>
      )}
      {data?.map(schema => (
        <Box key={schema.name} flexDirection="column" marginTop={0}>
          <Box gap={1}>
            <Text color="cyan">[▶] {schema.name}</Text>
            <Text dimColor>({schema.tables?.length ?? 0} tables, {fmtBytes(schema.sizeBytes)})</Text>
          </Box>
        </Box>
      ))}
      {tunnelStatus !== Status.CONNECTED && settings.autoOpenTunnel === AutoOpenTunnel.ASK && (
        <Box marginTop={1} gap={1}>
          <Text color="yellow">⚠ Tunnel must be open. Open now? [Y/n]</Text>
        </Box>
      )}
    </Section>
  );
}

// ─── Credentials display ──────────────────────────────────────────────────────
function CredentialsRow({ dbKey, tunnelInfo, visible }) {
  if (!visible) {
    return (
      <Box gap={1}>
        <Text dimColor>Credentials:</Text>
        <Text>●●●●●●●●</Text>
        <Text dimColor color="cyan">[👁 t] Show / Hide</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" gap={0}>
      <Box gap={1}><Text dimColor>Credentials:</Text><Text dimColor color="cyan">[👁 t] Hide</Text></Box>
      {tunnelInfo?.user     && <Box paddingLeft={2} gap={1}><Text dimColor>User:</Text>    <Text>{tunnelInfo.user}</Text></Box>}
      {tunnelInfo?.password && <Box paddingLeft={2} gap={1}><Text dimColor>Pass:</Text>    <Text>{tunnelInfo.password}</Text></Box>}
      {tunnelInfo?.url      && <Box paddingLeft={2} gap={1}><Text dimColor>URL: </Text>    <Text>{tunnelInfo.url}</Text></Box>}
      {tunnelInfo?.host     && <Box paddingLeft={2} gap={1}><Text dimColor>Host:</Text>    <Text>{tunnelInfo.host}</Text></Box>}
      {!tunnelInfo?.user    && <Box paddingLeft={2}><Text dimColor>(Connect tunnel to load credentials)</Text></Box>}
    </Box>
  );
}

// ─── Main DB Detail screen ────────────────────────────────────────────────────
export default function DbDetail({ params }) {
  const { envAlias, dbAlias } = params ?? {};
  const { state, dispatch } = useAppContext();
  const { pop, goTo } = useNavigation();

  const dbKey = `${envAlias}/${dbAlias}`;
  const dbState = state.dbStates[dbKey] ?? {};
  const tunnel = dbState.tunnel ?? Status.IDLE;
  const tunnelInfo = dbState.tunnelInfo ?? null;
  const credVisible = dbState.credentialsVisible ?? false;

  // Find adjacent DBs for navigation bar
  const env = state.envs.find(e => e.envAlias === envAlias);
  const dbs = env?.dbs ?? [];
  const currentIdx = dbs.findIndex(d => d.dbAlias === dbAlias);
  const prevDb = currentIdx > 0            ? dbs[currentIdx - 1] : null;
  const nextDb = currentIdx < dbs.length - 1 ? dbs[currentIdx + 1] : null;
  const db = dbs[currentIdx];

  // Tunnel open/close
  async function handleOpen() {
    dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey, status: Status.CONNECTING });
    try {
      const info = await openTunnel(dbAlias);
      dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey, status: Status.CONNECTED, tunnelInfo: info });
      logger.info(`Tunnel opened: ${dbAlias} :${info.port}`, { env: envAlias, db: dbAlias });
    } catch (err) {
      dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey, status: Status.FAILED });
      logger.error(`Tunnel open failed: ${err.message}`, { env: envAlias, db: dbAlias });
    }
  }

  async function handleClose() {
    dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey, status: Status.DISCONNECTING });
    try {
      await closeTunnel(dbAlias);
      dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey, status: Status.IDLE });
      logger.info(`Tunnel closed: ${dbAlias}`, { env: envAlias, db: dbAlias });
    } catch (err) {
      dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey, status: Status.FAILED });
      logger.error(`Tunnel close failed: ${err.message}`, { env: envAlias, db: dbAlias });
    }
  }

  useInput((input, key) => {
    if (state.portEditor) return;
    if (key.escape || key.return && input === '') pop();
    if (input === 'o') handleOpen();
    if (input === 'c') handleClose();
    if (input === 't') dispatch({ type: 'TOGGLE_CREDENTIALS', dbKey });
    if (input === 'p') dispatch({ type: 'OPEN_PORT_EDITOR', dbKey, dbAlias });
    if (input === 'h') {
      dispatch({ type: 'HIDE_DB', dbKey });
      pop();
    }
    if (input === '[' && prevDb) goTo.dbDetail({ envAlias, dbAlias: prevDb.dbAlias });
    if (input === ']' && nextDb) goTo.dbDetail({ envAlias, dbAlias: nextDb.dbAlias });
  });

  const footer = '[↑↓] scroll  [o] open  [c] close  [p] port  [t] credentials  [h] hide  [←] prev  [→] next  [Esc] back  [Ctrl+C] quit';

  return (
    <AppLayout footer={footer}>
      {/* Port editor overlay */}
      {state.portEditor && (
        <Box justifyContent="center" marginY={1}>
          <PortEditor />
        </Box>
      )}

      {!state.portEditor && (
        <Box flexDirection="column" gap={1}>
          {/* Navigation breadcrumb */}
          <Box gap={1} marginBottom={0}>
            {prevDb && <Text color="cyan" underline>[← {prevDb.dbAlias}]</Text>}
            <Text dimColor> {envAlias} › </Text>
            <Text bold color="cyan">{dbAlias}</Text>
            <Text dimColor> ({db?.type ?? '?'})</Text>
            {nextDb && <Text color="cyan" underline> [{nextDb.dbAlias} →]</Text>}
            <Text dimColor>  [↩ List]</Text>
          </Box>
          <Text dimColor>{'─'.repeat(60)}</Text>

          {/* Status bar */}
          <Box gap={2} alignItems="flex-start">
            <Box gap={1}>
              <Text>Status:</Text>
              <StatusDot status={tunnel} />
              <StatusBadge status={tunnel} />
            </Box>
            <Text dimColor>Port: {db?.port ?? '?'}</Text>
            <Text color="cyan">[↑ o] Open</Text>
            <Text color="cyan">[↓ c] Close</Text>
            <Text color="cyan">[⚙ p] Port</Text>
            <Text color="cyan">[hide ↯ h]</Text>
          </Box>

          {/* Credentials */}
          <CredentialsRow dbKey={dbKey} tunnelInfo={tunnelInfo} visible={credVisible} />

          <Text dimColor>{'─'.repeat(60)}</Text>

          {/* DB-type specific schema view */}
          {(db?.type === DbType.POSTGRES || db?.type === DbType.MYSQL || !db?.type) && (
            <SchemaSection
              dbKey={dbKey}
              envAlias={envAlias}
              dbAlias={dbAlias}
              tunnelStatus={tunnel}
              settings={state.settings}
              dispatch={dispatch}
            />
          )}

          {db?.type === DbType.REDIS && (
            <Box flexDirection="column" gap={1}>
              <Text bold>Keyspace</Text>
              <Text dimColor>Connect tunnel to load keyspace data.</Text>
            </Box>
          )}

          {db?.type === DbType.ELASTICSEARCH && (
            <Box flexDirection="column" gap={1}>
              <Text bold>Indices</Text>
              <Text dimColor>Connect tunnel to load index data.</Text>
            </Box>
          )}

          {/* Error display */}
          {dbState.error && (
            <Box marginTop={1}>
              <Text color="red">✖ {dbState.error}</Text>
            </Box>
          )}
        </Box>
      )}
    </AppLayout>
  );
}
