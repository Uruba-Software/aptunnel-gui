/**
 * AppLayout — wraps every screen with the global header and context-aware footer.
 *
 * Header:  aptunnel-gui  │  env: <name>  │  N/M tunnels up     aptunnel-gui v1.0.0
 * Content: flex-grow area
 * Footer:  context keybind hints
 */
import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { useAppContext } from '../state/AppContext.js';
import { Status, APP_VERSION, MIN_COLS } from '../constants.js';

function countTunnels(envs, dbStates) {
  let total = 0, up = 0;
  for (const env of envs) {
    for (const db of env.dbs) {
      total++;
      const key = `${env.envAlias}/${db.dbAlias}`;
      if (dbStates[key]?.tunnel === Status.CONNECTED) up++;
    }
  }
  return { up, total };
}

function getActiveEnvName(envs, settings) {
  const def = settings.defaultEnv;
  if (def) {
    const found = envs.find(e => e.envAlias === def);
    if (found) return found.envAlias;
  }
  return envs[0]?.envAlias ?? '—';
}

export default function AppLayout({ children, footer }) {
  const { state } = useAppContext();
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
  const { up, total } = countTunnels(state.envs, state.dbStates);
  const envName = getActiveEnvName(state.envs, state.settings);

  const headerLeft  = ` aptunnel-gui  │  env: ${envName}  │  ${up}/${total} tunnels up`;
  const headerRight = `aptunnel-gui v${APP_VERSION} `;
  const gap = Math.max(1, cols - headerLeft.length - headerRight.length);

  const defaultFooter = '[↑↓] navigate  [Enter] select  [Ctrl+C] quit';

  return (
    <Box flexDirection="column" width={cols}>
      {/* Header */}
      <Box borderStyle="single" borderBottom={false} paddingX={1} width={cols}>
        <Text bold>{headerLeft}</Text>
        <Text>{' '.repeat(gap)}</Text>
        <Text dimColor>{headerRight}</Text>
      </Box>

      {/* Content */}
      <Box flexGrow={1} flexDirection="column" paddingX={1}>
        {children}
      </Box>

      {/* Footer */}
      <Box borderStyle="single" borderTop={false} paddingX={1} width={cols}>
        <Text dimColor>{footer ?? defaultFooter}</Text>
      </Box>
    </Box>
  );
}
