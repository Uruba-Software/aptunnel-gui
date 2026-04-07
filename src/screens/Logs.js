/**
 * Logs screen — scrollable log viewer with filters, export, and clear.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import AppLayout from '../components/AppLayout.js';
import { useAppContext } from '../state/AppContext.js';
import { useNavigation } from '../hooks/useNavigation.js';
import { readLogFile, listLogDates, clearLogs, exportLogs, logsDir } from '../services/storage.js';
import { logger } from '../services/logger.js';
import { LogLevel } from '../constants.js';
import path from 'node:path';

const LEVEL_COLORS = {
  [LogLevel.INFO]:  'blue',
  [LogLevel.WARN]:  'yellow',
  [LogLevel.ERROR]: 'red',
};

const LEVELS = ['all', LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];

function LogRow({ entry, cols }) {
  const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const color = LEVEL_COLORS[entry.level] ?? 'white';
  const source = entry.env
    ? (entry.db ? `${entry.env} / ${entry.db}` : entry.env)
    : 'app';
  const msg = (entry.message ?? '').slice(0, cols - 48);

  return (
    <Box gap={1}>
      <Box width={10}><Text dimColor>{time}</Text></Box>
      <Box width={7}><Text color={color} bold>{entry.level}</Text></Box>
      <Box width={28}><Text dimColor>{source.slice(0, 27)}</Text></Box>
      <Text>{msg}</Text>
    </Box>
  );
}

export default function Logs() {
  const { state, dispatch } = useAppContext();
  const { pop } = useNavigation();
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;

  const [scroll, setScroll] = useState(0);
  const [filterLevel, setFilterLevel] = useState('all');
  const [filterEnv, setFilterEnv] = useState('all');
  const [filterDate, setFilterDate] = useState('today');
  const [availableDates, setAvailableDates] = useState(['today']);
  const [diskLogs, setDiskLogs] = useState([]);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [exportMsg, setExportMsg] = useState(null);
  const [filterMode, setFilterMode] = useState(false); // f toggles filter bar focus

  const visibleRows = Math.max(5, (stdout?.rows ?? 24) - 10);

  // Load available log dates
  useEffect(() => {
    listLogDates().then(dates => {
      setAvailableDates(['today', ...dates]);
    });
  }, []);

  // Load disk logs for selected date (if not today)
  useEffect(() => {
    if (filterDate === 'today') { setDiskLogs([]); return; }
    readLogFile(filterDate).then(setDiskLogs);
  }, [filterDate]);

  const allLogs = filterDate === 'today' ? state.logs : diskLogs;

  const envNames = useMemo(() => {
    const s = new Set(['all']);
    for (const e of state.envs) s.add(e.envAlias);
    return [...s];
  }, [state.envs]);

  const filtered = useMemo(() => {
    return allLogs.filter(e => {
      if (filterLevel !== 'all' && e.level !== filterLevel) return false;
      if (filterEnv !== 'all' && e.env !== filterEnv) return false;
      return true;
    });
  }, [allLogs, filterLevel, filterEnv]);

  const visible = filtered.slice(scroll, scroll + visibleRows);
  const maxScroll = Math.max(0, filtered.length - visibleRows);

  useInput((input, key) => {
    if (clearConfirm) {
      if (input === 'y' || input === 'Y') {
        clearLogs().then(() => {
          dispatch({ type: 'CLEAR_LOGS' });
          logger.info('Logs cleared by user');
        });
        setClearConfirm(false);
      } else if (input === 'n' || input === 'N' || key.escape) {
        setClearConfirm(false);
      }
      return;
    }

    if (key.escape)    { pop(); return; }
    if (key.upArrow)   { setScroll(s => Math.max(0, s - 1)); return; }
    if (key.downArrow) { setScroll(s => Math.min(maxScroll, s + 1)); return; }

    if (input === 'f') {
      // Cycle level filter
      const idx = LEVELS.indexOf(filterLevel);
      setFilterLevel(LEVELS[(idx + 1) % LEVELS.length]);
      setScroll(0);
      return;
    }

    if (input === 'e') {
      const date = filterDate === 'today' ? new Date().toISOString().slice(0, 10) : filterDate;
      const dest = path.join(process.cwd(), `aptunnel-gui-logs-${date}.log`);
      exportLogs(date, dest).then(() => {
        setExportMsg(`Exported to ${dest}`);
        setTimeout(() => setExportMsg(null), 3000);
      }).catch(err => setExportMsg(`Export failed: ${err.message}`));
      return;
    }

    if (input === 'x') { setClearConfirm(true); return; }
  });

  const footer = '[↑↓] scroll  [f] filter level  [e] export  [x] clear  [Esc] back  [Ctrl+C] quit';

  return (
    <AppLayout footer={footer}>
      <Box flexDirection="column" gap={0}>

        {/* Filter bar */}
        <Box gap={2} paddingBottom={0}>
          <Text dimColor>Filter:</Text>
          <Box gap={1}>
            <Text dimColor>env</Text>
            <Text color="cyan">[{filterEnv} ▾]</Text>
          </Box>
          <Box gap={1}>
            <Text dimColor>level</Text>
            <Text color="cyan">[{filterLevel} ▾]</Text>
          </Box>
          <Box gap={1}>
            <Text dimColor>date</Text>
            <Text color="cyan">[{filterDate} ▾]</Text>
          </Box>
          <Box gap={1}>
            <Text color="cyan" underline>[e] Export</Text>
            <Text color="red"  underline>[x] Clear</Text>
          </Box>
        </Box>

        <Text dimColor>{'─'.repeat(Math.min(cols - 2, 70))}</Text>

        {/* Log rows */}
        {visible.length === 0 && (
          <Box marginTop={1}><Text dimColor>No log entries{filterLevel !== 'all' ? ` at level ${filterLevel}` : ''}.</Text></Box>
        )}
        {visible.map((entry, i) => (
          <LogRow key={i} entry={entry} cols={cols} />
        ))}

        {/* Scroll indicator */}
        {filtered.length > visibleRows && (
          <Box marginTop={0}>
            <Text dimColor>
              {scroll + 1}–{Math.min(scroll + visibleRows, filtered.length)} of {filtered.length}
              {scroll < maxScroll ? '  ↓ more' : ''}
            </Text>
          </Box>
        )}

        {/* Clear confirm */}
        {clearConfirm && (
          <Box marginTop={1} gap={1}>
            <Text color="red">⚠ Clear all logs? </Text>
            <Text color="red">[Y] Yes  [N] Cancel</Text>
          </Box>
        )}

        {/* Export feedback */}
        {exportMsg && <Box marginTop={1}><Text color="green">{exportMsg}</Text></Box>}
      </Box>
    </AppLayout>
  );
}
