/**
 * AppLayout — global header + footer wrapper.
 * Fills the full terminal width. Header never wraps — right side truncates.
 * Mouse tracking is initialized here (root-level, once).
 */
import React, { useCallback } from 'react';
import { Box, Text, useStdout } from 'ink';
import { useAppContext } from '../state/AppContext.js';
import { useMouse } from '../hooks/useMouse.js';
import { Status, APP_VERSION } from '../constants.js';

function countTunnels(envs, dbStates) {
  let total = 0, up = 0;
  for (const env of (envs ?? [])) {
    for (const db of (env.dbs ?? [])) {
      total++;
      const key = `${env.envAlias}/${db.dbAlias}`;
      if (dbStates[key]?.tunnel === Status.CONNECTED) up++;
    }
  }
  return { up, total };
}

export default function AppLayout({ children, footer, mouseHandler }) {
  const { state } = useAppContext();
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;

  const { up, total } = countTunnels(state.envs, state.dbStates);
  const envName = state.settings.defaultEnv
    ?? state.envs?.[0]?.envAlias
    ?? '—';

  const version = `aptunnel-gui v${APP_VERSION}`;
  const headerLeft = ` aptunnel-gui  │  env: ${envName}  │  ${up}/${total} tunnels up`;

  // Right-align version, left side gets remaining space
  const rightWidth = version.length + 1;
  const leftMaxWidth = Math.max(0, cols - rightWidth - 2);
  const leftText = headerLeft.length > leftMaxWidth
    ? headerLeft.slice(0, leftMaxWidth - 1) + '…'
    : headerLeft.padEnd(leftMaxWidth);

  const divider = '─'.repeat(cols);

  const footerText = footer ?? '[↑↓] navigate  [Enter] select  [Ctrl+C] quit';
  const footerMax = cols - 2;
  const footerDisplay = footerText.length > footerMax
    ? footerText.slice(0, footerMax - 1) + '…'
    : footerText;

  // Mount mouse handler at root level so it's always active
  const noop = useCallback(() => {}, []);
  useMouse(mouseHandler ?? noop);

  return (
    <Box flexDirection="column" width={cols}>
      {/* ── Header ── */}
      <Box width={cols} flexDirection="row">
        <Text bold>{leftText}</Text>
        <Text dimColor>{version} </Text>
      </Box>
      <Text dimColor>{divider}</Text>

      {/* ── Content ── */}
      <Box flexDirection="column" flexGrow={1}>
        {children}
      </Box>

      {/* ── Footer ── */}
      <Text dimColor>{divider}</Text>
      <Box width={cols} paddingLeft={1}>
        <Text dimColor>{footerDisplay}</Text>
      </Box>
    </Box>
  );
}
