/**
 * PortEditor — 3-step modal for editing a DB's tunnel port.
 *
 * Step 1: enter new port + check availability
 * Step 2: confirm reconnect
 * Step 3: save as default?
 * Done: summary
 */
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { isPortAvailable, openTunnel, closeTunnel } from '../services/aptunnel.js';
import { useAppContext } from '../state/AppContext.js';
import { Status } from '../constants.js';
import { logger } from '../services/logger.js';
import { saveSettings } from '../services/storage.js';

function StepIcon({ done, active }) {
  if (done)   return <Text color="green">✔</Text>;
  if (active) return <Text color="yellow">▶</Text>;
  return <Text dimColor>○</Text>;
}

export default function PortEditor() {
  const { state, dispatch } = useAppContext();
  const pe = state.portEditor;

  const [portInput, setPortInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [portOk, setPortOk] = useState(false);
  const [portError, setPortError] = useState(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnected, setReconnected] = useState(false);
  const [reconnectError, setReconnectError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [done, setDone] = useState(false);

  const step = pe?.step ?? 1;

  useInput((input, key) => {
    if (!pe) return;
    if (key.escape) { dispatch({ type: 'CLOSE_PORT_EDITOR' }); return; }

    if (step === 2 && !reconnecting) {
      if (input === 'y' || input === 'Y' || key.return) handleReconnect();
      if (input === 'n' || input === 'N') dispatch({ type: 'CLOSE_PORT_EDITOR' });
    }
    if (step === 3 && !reconnecting) {
      if (input === 'y' || input === 'Y') handleSave(true);
      if (input === 'n' || input === 'N') handleSave(false);
      if (key.return) handleSave(false);
    }
    if (done && key.return) dispatch({ type: 'CLOSE_PORT_EDITOR' });
  });

  if (!pe) return null;

  async function handleCheckPort() {
    const port = parseInt(portInput, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      setPortError('Invalid port number'); return;
    }
    setChecking(true); setPortError(null);
    const available = await isPortAvailable(port).catch(() => false);
    setChecking(false);
    if (!available) { setPortError('Port is already in use'); return; }
    setPortOk(true);
    dispatch({ type: 'SET_PORT_EDITOR', patch: { step: 2, newPort: String(port) } });
  }

  async function handleReconnect() {
    setReconnecting(true); setReconnectError(null);
    try {
      const dbKey = pe.dbKey;
      dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey, status: Status.DISCONNECTING });
      await closeTunnel(pe.dbAlias);
      dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey, status: Status.CONNECTING });
      const info = await openTunnel(pe.dbAlias);
      dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey, status: Status.CONNECTED, tunnelInfo: info });
      logger.info(`Port changed: ${pe.dbAlias} reconnected on port ${pe.newPort}`, { db: pe.dbAlias });
      setReconnected(true);
      dispatch({ type: 'SET_PORT_EDITOR', patch: { step: 3 } });
    } catch (err) {
      setReconnectError(err.message);
      dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey: pe.dbKey, status: Status.FAILED });
      logger.error(`Port change reconnect failed: ${err.message}`, { db: pe.dbAlias });
    } finally {
      setReconnecting(false);
    }
  }

  async function handleSave(persist) {
    if (persist) {
      // Update settings: store port override for this DB
      const portOverrides = { ...(state.settings.portOverrides ?? {}), [pe.dbKey]: parseInt(pe.newPort, 10) };
      const newSettings = { ...state.settings, portOverrides };
      dispatch({ type: 'SET_SETTINGS', settings: newSettings });
      await saveSettings(newSettings).catch(() => {});
      setSaved(true);
    }
    setDone(true);
    dispatch({ type: 'SET_PORT_EDITOR', patch: { step: 4 } });
  }

  const port = parseInt(portInput || pe.newPort || '0', 10);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} width={52}>
      <Text bold color="cyan"> Edit tunnel port</Text>
      <Text dimColor> DB: {pe.dbAlias}</Text>
      <Text> </Text>

      {/* Step 1 */}
      <Box gap={1}>
        <StepIcon done={step > 1} active={step === 1} />
        <Text>Step 1 — enter new port</Text>
      </Box>
      {step === 1 && (
        <Box flexDirection="column" marginLeft={2} marginTop={1} gap={1}>
          <Box gap={1}>
            <Text>New port: </Text>
            <TextInput
              value={portInput}
              onChange={setPortInput}
              onSubmit={handleCheckPort}
              placeholder="e.g. 5433"
            />
          </Box>
          {checking && <Text color="yellow">Checking availability…</Text>}
          {portError && <Text color="red">✖ {portError}</Text>}
          <Text dimColor>[Enter] check & continue  [Esc] cancel</Text>
        </Box>
      )}
      {step > 1 && (
        <Box marginLeft={2}><Text color="green" dimColor>port {pe.newPort} is available</Text></Box>
      )}

      <Text> </Text>

      {/* Step 2 */}
      <Box gap={1}>
        <StepIcon done={step > 2} active={step === 2} />
        <Text dimColor={step < 2}>Step 2 — confirm reconnect</Text>
      </Box>
      {step === 2 && (
        <Box flexDirection="column" marginLeft={2} marginTop={1} gap={1}>
          <Text color="yellow">⚠  Tunnel will be closed and reopened on new port.</Text>
          <Text>Reconnect {pe.dbAlias} on port {pe.newPort}?</Text>
          {reconnecting && <Text color="yellow">Reconnecting…</Text>}
          {reconnectError && <Text color="red">✖ {reconnectError}</Text>}
          {!reconnecting && <Text dimColor>[Y] Yes, reconnect  [N] Cancel</Text>}
        </Box>
      )}
      {step > 2 && (
        <Box marginLeft={2}><Text color="green" dimColor>tunnel reconnected on port {pe.newPort}</Text></Box>
      )}

      <Text> </Text>

      {/* Step 3 */}
      <Box gap={1}>
        <StepIcon done={step > 3} active={step === 3} />
        <Text dimColor={step < 3}>Step 3 — persist setting?</Text>
      </Box>
      {step === 3 && (
        <Box flexDirection="column" marginLeft={2} marginTop={1} gap={1}>
          <Text>Always open {pe.dbAlias} on port {pe.newPort}?</Text>
          <Text dimColor>[Y] Yes, save as default  [N] Just this session</Text>
        </Box>
      )}

      {/* Done */}
      {step === 4 && (
        <Box flexDirection="column" marginTop={1} gap={0}>
          <Text color="green">✔ Port updated to {pe.newPort}</Text>
          <Text color="green">✔ Tunnel reconnected</Text>
          {saved && <Text color="green">✔ Saved as default port</Text>}
          <Text> </Text>
          <Text dimColor>[Enter] close</Text>
        </Box>
      )}
    </Box>
  );
}
