/**
 * Settings screen — app preferences, version info, hidden items management, danger zone.
 */
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import AppLayout from '../components/AppLayout.js';
import { useAppContext } from '../state/AppContext.js';
import { useNavigation } from '../hooks/useNavigation.js';
import { saveSettings, clearAllCache, aptunnelConfigPath } from '../services/storage.js';
import { getAptunnelVersion } from '../services/aptunnel.js';
import { logger } from '../services/logger.js';
import { APP_VERSION, MIN_APTUNNEL_VERSION, AutoOpenTunnel, Screen } from '../constants.js';

const ROWS = [
  { key: 'pollingInterval', label: 'Polling interval', options: [3, 5, 10, 30, 60], suffix: 's' },
  { key: 'autoOpenTunnel',  label: 'Auto-open tunnel',  options: [AutoOpenTunnel.ASK, AutoOpenTunnel.ALWAYS, AutoOpenTunnel.NEVER] },
  { key: 'backgroundPreload', label: 'Background preload', options: [true, false], format: v => v ? 'ON ✓' : 'OFF' },
  { key: 'logRetention',   label: 'Log retention',     options: [7, 14, 30, 60, 90], suffix: 'd' },
  { key: 'theme',          label: 'Theme',              options: ['dark', 'light'] },
  { key: 'nameMaxLength',  label: 'Name truncate at',   options: [12, 15, 18, 22, 28, 36], suffix: 'ch' },
];

const SECTION_VERSION   = 'version';
const SECTION_HIDDEN    = 'hidden';
const SECTION_DANGER    = 'danger';

export default function Settings() {
  const { state, dispatch } = useAppContext();
  const { pop, goTo } = useNavigation();
  const [cursor, setCursor] = useState(0);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [aptVersion, setAptVersion] = useState(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [localSettings, setLocalSettings] = useState(state.settings);

  const totalRows = ROWS.length + 4; // rows + version section header + hidden section + danger section + separator

  function cycleOption(rowKey) {
    const row = ROWS.find(r => r.key === rowKey);
    if (!row) return;
    const idx = row.options.indexOf(localSettings[rowKey]);
    const next = row.options[(idx + 1) % row.options.length];
    setLocalSettings(prev => ({ ...prev, [rowKey]: next }));
    setDirty(true);
  }

  async function save() {
    dispatch({ type: 'SET_SETTINGS', settings: localSettings });
    await saveSettings(localSettings).catch(() => {});
    setSaved(true);
    setDirty(false);
    logger.info('Settings saved');
    setTimeout(() => setSaved(false), 2000);
  }

  async function checkAptVersion() {
    const v = await getAptunnelVersion();
    setAptVersion(v ?? 'not found');
  }

  async function handleClearCache() {
    if (!clearConfirm) { setClearConfirm(true); return; }
    await clearAllCache().catch(() => {});
    setClearConfirm(false);
    logger.info('Cache cleared by user');
  }

  useInput((input, key) => {
    if (key.upArrow)   { setCursor(c => Math.max(0, c - 1)); return; }
    if (key.downArrow) { setCursor(c => Math.min(totalRows - 1, c + 1)); return; }
    if (key.escape)    { if (dirty) setLocalSettings(state.settings); pop(); return; }
    if (key.ctrl && input === 's') { save(); return; }

    const row = ROWS[cursor];
    if ((key.return || input === ' ') && row) {
      cycleOption(row.key);
      return;
    }
    if (key.leftArrow && row) {
      const idx = row.options.indexOf(localSettings[row.key]);
      const prev = row.options[(idx - 1 + row.options.length) % row.options.length];
      setLocalSettings(s => ({ ...s, [row.key]: prev }));
      setDirty(true);
      return;
    }
    if (key.rightArrow && row) {
      cycleOption(row.key);
      return;
    }

    // Actions for non-row items
    if (key.return) {
      if (cursor === ROWS.length + 1) checkAptVersion();
      if (cursor === ROWS.length + 2) {/* manage hidden — navigate */}
      if (cursor === ROWS.length + 3) handleClearCache();
    }
    if (input === 'y' && clearConfirm) handleClearCache();
    if (input === 'n' && clearConfirm) setClearConfirm(false);
  });

  function displayValue(row) {
    const v = localSettings[row.key];
    if (row.format) return row.format(v);
    return `${v}${row.suffix ?? ''}`;
  }

  const footer = '[↑↓] nav  [Space/←→] change  [Ctrl+S] save  [Esc] back  [Ctrl+C] quit';

  return (
    <AppLayout footer={footer}>
      <Box flexDirection="column" gap={0} paddingTop={1}>

        {/* Setting rows */}
        {ROWS.map((row, i) => (
          <Box key={row.key} gap={1}>
            <Box width={22}>
              <Text color={cursor === i ? 'cyan' : 'white'} bold={cursor === i}>{row.label}:</Text>
            </Box>
            <Box borderStyle={cursor === i ? 'single' : undefined} borderColor="cyan" paddingX={cursor === i ? 1 : 0}>
              <Text color="cyan">[{displayValue(row)} ▾]</Text>
            </Box>
          </Box>
        ))}

        {/* Version info */}
        <Text> </Text>
        <Text dimColor>{'─── Version info '}{'─'.repeat(42)}</Text>
        <Box gap={1}>
          <Box width={24}><Text dimColor>aptunnel-gui version:</Text></Box>
          <Text>{APP_VERSION}</Text>
        </Box>
        <Box gap={1}>
          <Box width={24}><Text dimColor>aptunnel version:</Text></Box>
          <Text>{aptVersion ?? <Text dimColor>—</Text>}</Text>
          <Text color="cyan" underline dimColor>[Enter] Check</Text>
        </Box>
        <Box gap={1}>
          <Box width={24}><Text dimColor>min aptunnel required:</Text></Box>
          <Text>{MIN_APTUNNEL_VERSION}</Text>
        </Box>
        <Box gap={1}>
          <Box width={24}><Text dimColor>config path:</Text></Box>
          <Text dimColor>{aptunnelConfigPath()}</Text>
        </Box>

        {/* Hidden items */}
        <Text> </Text>
        <Text dimColor>{'─── Manage visibility '}{'─'.repeat(39)}</Text>
        <Box gap={1}>
          <Text
            color={cursor === ROWS.length + 2 ? 'cyan' : 'white'}
            underline
          >
            [Manage hidden envs & DBs →]
          </Text>
          {(localSettings.hiddenEnvs?.length > 0 || localSettings.hiddenDbs?.length > 0) && (
            <Text dimColor>
              ({(localSettings.hiddenEnvs?.length ?? 0)} envs, {(localSettings.hiddenDbs?.length ?? 0)} DBs hidden)
            </Text>
          )}
        </Box>

        {/* Danger zone */}
        <Text> </Text>
        <Text dimColor>{'─── Danger zone '}{'─'.repeat(44)}</Text>
        <Box gap={2}>
          <Text
            color={cursor === ROWS.length + 3 ? 'red' : 'gray'}
            underline
          >
            [✕ Clear all cache]
          </Text>
          <Text
            color={cursor === ROWS.length + 4 ? 'yellow' : 'gray'}
            underline
          >
            [Redo init wizard]
          </Text>
        </Box>
        {clearConfirm && (
          <Box marginLeft={2} gap={1}>
            <Text color="red">⚠ Clear all cached data? </Text>
            <Text color="red">[Y] Yes  [N] Cancel</Text>
          </Box>
        )}

        {/* Save feedback */}
        {saved && <Box marginTop={1}><Text color="green">✔ Settings saved</Text></Box>}
        {dirty && !saved && <Box marginTop={1}><Text dimColor>Unsaved changes — [Ctrl+S] to save, [Esc] to discard</Text></Box>}
      </Box>
    </AppLayout>
  );
}
