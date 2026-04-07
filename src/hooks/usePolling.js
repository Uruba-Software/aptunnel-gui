/**
 * usePolling — polls aptunnel status on an interval and updates state
 * only for changed entries (no full re-render).
 */
import { useEffect, useRef, useCallback } from 'react';
import { getStatusRaw, parseStatusOutput } from '../services/aptunnel.js';
import { loadAptunnelConfig, parseEnvsFromConfig } from '../services/storage.js';
import { useAppContext } from '../state/AppContext.js';
import { Status } from '../constants.js';
import { logger } from '../services/logger.js';

export function usePolling(enabled = true) {
  const { state, dispatch } = useAppContext();
  const intervalRef = useRef(null);
  const prevTunnelStates = useRef({});

  const poll = useCallback(async () => {
    try {
      // Re-read config to stay in sync with any external changes
      const config = await loadAptunnelConfig();
      if (!config) return;

      const envs = parseEnvsFromConfig(config);

      // Dispatch envs update
      dispatch({ type: 'SET_ENVS', envs });

      // Get tunnel active/inactive states
      const raw = await getStatusRaw().catch(() => null);
      const tunnelStates = raw ? parseStatusOutput(raw) : {};

      // Only dispatch changed DB tunnel statuses
      for (const env of envs) {
        for (const db of env.dbs) {
          const key = `${env.envAlias}/${db.dbAlias}`;
          const isUp = tunnelStates[db.dbAlias] ?? tunnelStates[db.dbKey] ?? false;
          const newStatus = isUp ? Status.CONNECTED : Status.IDLE;
          if (prevTunnelStates.current[key] !== newStatus) {
            dispatch({ type: 'SET_DB_TUNNEL_STATUS', dbKey: key, status: newStatus });
            prevTunnelStates.current[key] = newStatus;
          }
        }
      }
    } catch (err) {
      logger.error(`Status poll failed: ${err.message}`);
    }
  }, [dispatch]);

  useEffect(() => {
    if (!enabled) return;
    poll(); // immediate first poll
    const ms = (state.settings.pollingInterval ?? 5) * 1000;
    intervalRef.current = setInterval(poll, ms);
    return () => clearInterval(intervalRef.current);
  }, [enabled, poll, state.settings.pollingInterval]);

  return { poll };
}
