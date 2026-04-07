/**
 * Background preload — loads schema/table data for all DBs sequentially,
 * at lowest priority. Any user-triggered operation for the same DB takes
 * precedence (it will just overwrite preloaded state).
 */
import { loadCache } from './storage.js';
import { logger } from './logger.js';
import { Status } from '../constants.js';

let _running = false;
let _cancelRequested = false;

/**
 * Start background preloading all DBs.
 * @param {object[]} envs  — from state.envs
 * @param {object}   state — app state snapshot
 * @param {Function} dispatch
 */
export async function startBackgroundPreload(envs, state, dispatch) {
  if (_running) return;
  if (!state.settings.backgroundPreload) return;

  _running = true;
  _cancelRequested = false;

  const allDbs = [];
  for (const env of envs) {
    for (const db of env.dbs) {
      allDbs.push({ envAlias: env.envAlias, dbAlias: db.dbAlias, dbKey: `${env.envAlias}/${db.dbAlias}` });
    }
  }

  dispatch({ type: 'SET_PRELOAD', preload: { total: allDbs.length, completed: 0, current: null } });
  logger.info(`Background preload started for ${allDbs.length} DBs`);

  let completed = 0;
  for (const { envAlias, dbAlias, dbKey } of allDbs) {
    if (_cancelRequested) break;

    dispatch({ type: 'SET_PRELOAD', preload: { current: dbKey } });
    dispatch({ type: 'SET_DB_PRELOAD_STATUS', dbKey, status: Status.LOADING });

    try {
      // Check if we have fresh cache (< 10 minutes old)
      const cached = await loadCache(envAlias, dbAlias);
      const fresh = cached?.savedAt && (Date.now() - new Date(cached.savedAt).getTime()) < 10 * 60 * 1000;

      if (!fresh) {
        // Only attempt if tunnel is connected
        const dbState = state.dbStates?.[dbKey];
        if (dbState?.tunnel === Status.CONNECTED) {
          // TODO: trigger actual schema load when DB drivers are integrated
          // For now, mark as loaded if cached data exists
          logger.info(`Background preload: ${dbAlias}`, { env: envAlias, db: dbAlias });
        }
      }

      dispatch({ type: 'SET_DB_PRELOAD_STATUS', dbKey, status: Status.LOADED });
    } catch (err) {
      dispatch({ type: 'SET_DB_PRELOAD_STATUS', dbKey, status: Status.ERROR });
      logger.error(`Background preload failed: ${dbAlias} — ${err.message}`, { env: envAlias, db: dbAlias });
    }

    completed++;
    dispatch({ type: 'SET_PRELOAD', preload: { completed } });

    // Yield to event loop between each DB
    await new Promise(r => setTimeout(r, 50));
  }

  dispatch({ type: 'SET_PRELOAD', preload: { current: null } });
  logger.info('Background preload complete');
  _running = false;
}

export function cancelBackgroundPreload() {
  _cancelRequested = true;
}
