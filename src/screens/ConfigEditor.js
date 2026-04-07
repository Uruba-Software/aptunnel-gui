/**
 * Config Editor — visual editor for aptunnel's config.yaml.
 * Reads via `aptunnel config --raw`, displays editable fields,
 * saves by writing the file directly (aptunnel doesn't provide a config-write command).
 */
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import AppLayout from '../components/AppLayout.js';
import { useAppContext } from '../state/AppContext.js';
import { useNavigation } from '../hooks/useNavigation.js';
import { getRawConfig } from '../services/aptunnel.js';
import { loadAptunnelConfig, aptunnelConfigPath } from '../services/storage.js';
import { writeFile } from 'node:fs/promises';
import { logger } from '../services/logger.js';

export default function ConfigEditor() {
  const { state } = useAppContext();
  const { pop } = useNavigation();
  const [config, setConfig] = useState(null);
  const [raw, setRaw] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cursor, setCursor] = useState(0); // env index
  const [dbCursor, setDbCursor] = useState(0);
  const [editing, setEditing] = useState(null); // { envIdx, dbIdx, field } | null
  const [editValue, setEditValue] = useState('');
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [rawStr, parsed] = await Promise.all([
          getRawConfig().catch(() => ''),
          loadAptunnelConfig(),
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
    setEditValue(String(currentValue ?? ''));
  }

  function commitEdit() {
    if (!editing || !config) return;
    const { envIdx, dbIdx, field } = editing;
    const newConfig = JSON.parse(JSON.stringify(config));
    const envKey = Object.keys(newConfig.environments)[envIdx];
    if (dbIdx === -1) {
      // env-level field (alias)
      newConfig.environments[envKey][field] = editValue;
    } else {
      const dbKey = Object.keys(newConfig.environments[envKey].databases)[dbIdx];
      if (field === 'port') {
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
      const { stringify } = await import('yaml');
      const yamlStr = stringify(config);
      await writeFile(aptunnelConfigPath(), yamlStr, 'utf8');
      setDirty(false);
      setSaved(true);
      logger.info('aptunnel config saved');
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(`Save failed: ${err.message}`);
      logger.error(`Config save failed: ${err.message}`);
    }
  }

  useInput((input, key) => {
    if (editing) {
      if (key.return) { commitEdit(); return; }
      if (key.escape) { setEditing(null); return; }
      return; // TextInput handles the rest
    }

    if (key.escape)    { if (dirty) setDirty(false); pop(); return; }
    if (key.upArrow)   { setCursor(c => Math.max(0, c - 1)); return; }
    if (key.downArrow) { setCursor(c => Math.min(envEntries.length - 1, c + 1)); return; }
    if (key.ctrl && input === 's') { handleSave(); return; }
  });

  const footer = '[↑↓] navigate  [Enter] edit  [Ctrl+S] save  [Esc] back  [Ctrl+C] quit';

  return (
    <AppLayout footer={footer}>
      <Box flexDirection="column" gap={1} paddingTop={1}>
        <Box gap={1}>
          <Text bold color="cyan">aptunnel Config Editor</Text>
          <Text dimColor>{aptunnelConfigPath()}</Text>
        </Box>

        {loading && <Text color="yellow">Loading…</Text>}
        {error   && <Text color="red">✖ {error}</Text>}

        {!loading && !error && config && (
          <Box flexDirection="column" gap={1}>
            {envEntries.map(([envKey, env], envIdx) => {
              const isFocused = envIdx === cursor;
              const dbEntries = env.databases ? Object.entries(env.databases) : [];
              return (
                <Box key={envKey} flexDirection="column">
                  {/* Env header */}
                  <Box gap={2} paddingLeft={0}>
                    <Text bold color={isFocused ? 'cyan' : 'white'}>{envKey}</Text>
                    <Box gap={1}>
                      <Text dimColor>alias:</Text>
                      {editing?.envIdx === envIdx && editing?.dbIdx === -1 && editing?.field === 'alias' ? (
                        <TextInput value={editValue} onChange={setEditValue} onSubmit={commitEdit} />
                      ) : (
                        <Text color="cyan" underline={isFocused}
                          onPress={() => isFocused && startEdit(envIdx, -1, 'alias', env.alias)}>
                          {env.alias ?? envKey}
                        </Text>
                      )}
                    </Box>
                  </Box>

                  {/* DB rows */}
                  {isFocused && dbEntries.map(([dbKey, db], dbIdx) => (
                    <Box key={dbKey} paddingLeft={2} gap={2}>
                      <Box width={20}><Text>{dbKey}</Text></Box>
                      <Box gap={1}>
                        <Text dimColor>alias:</Text>
                        {editing?.envIdx === envIdx && editing?.dbIdx === dbIdx && editing?.field === 'alias' ? (
                          <TextInput value={editValue} onChange={setEditValue} onSubmit={commitEdit} />
                        ) : (
                          <Text color="cyan">{db.alias ?? dbKey}</Text>
                        )}
                      </Box>
                      <Box gap={1}>
                        <Text dimColor>port:</Text>
                        {editing?.envIdx === envIdx && editing?.dbIdx === dbIdx && editing?.field === 'port' ? (
                          <TextInput value={editValue} onChange={setEditValue} onSubmit={commitEdit} />
                        ) : (
                          <Text color="cyan">{db.port ?? '—'}</Text>
                        )}
                      </Box>
                      <Text dimColor>{db.type ?? '?'}</Text>
                    </Box>
                  ))}
                </Box>
              );
            })}
          </Box>
        )}

        {saved  && <Text color="green">✔ Config saved</Text>}
        {dirty  && !saved && <Text dimColor>Unsaved changes — [Ctrl+S] to save, [Esc] to discard</Text>}
      </Box>
    </AppLayout>
  );
}
