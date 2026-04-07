import React, { useReducer, useEffect, useRef } from 'react';
import { useApp, useInput } from 'ink';
import { Screen } from './constants.js';
import { appReducer, initialState } from './state/appReducer.js';
import { AppContext } from './state/AppContext.js'; // eslint-disable-line no-unused-vars
import { loadSettings, aptunnelConfigExists } from './services/storage.js';
import { setLogDispatch, logger } from './services/logger.js';
import InitWizard from './screens/InitWizard.js';
import Dashboard from './screens/Dashboard.js';
import DbDetail from './screens/DbDetail.js';
import ConfigEditor from './screens/ConfigEditor.js';
import Settings from './screens/Settings.js';
import Logs from './screens/Logs.js';
import { APP_VERSION } from './constants.js';

const SCREEN_MAP = {
  [Screen.INIT_WIZARD]:   InitWizard,
  [Screen.DASHBOARD]:     Dashboard,
  [Screen.DB_DETAIL]:     DbDetail,
  [Screen.CONFIG_EDITOR]: ConfigEditor,
  [Screen.SETTINGS]:      Settings,
  [Screen.LOGS]:          Logs,
};

export default function App() {
  const { exit } = useApp();
  const [state, dispatch] = useReducer(appReducer, initialState);
  const startupDone = useRef(false);

  // Wire up logger to dispatch
  useEffect(() => {
    setLogDispatch(dispatch);
  }, [dispatch]);

  // Startup: load settings, decide whether to show init wizard
  useEffect(() => {
    if (startupDone.current) return;
    startupDone.current = true;

    (async () => {
      try {
        const settings = await loadSettings();
        dispatch({ type: 'SET_SETTINGS', settings });
        logger.info(`aptunnel-gui v${APP_VERSION} started, polling every ${settings.pollingInterval}s`);

        const hasConfig = await aptunnelConfigExists();
        if (!hasConfig) {
          dispatch({ type: 'REPLACE_SCREEN', screen: Screen.INIT_WIZARD, params: {} });
        } else {
          dispatch({ type: 'SET_INITIALIZED', value: true });
        }
      } catch (err) {
        logger.error(`Startup error: ${err.message}`);
      }
    })();
  }, []);

  // Exit when requested
  useEffect(() => {
    if (state.shouldExit) exit();
  }, [state.shouldExit, exit]);

  // Global Ctrl+C handler
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      logger.info('aptunnel-gui exiting');
      dispatch({ type: 'EXIT' });
    }
  });

  const currentScreen = state.screenStack[state.screenStack.length - 1];
  const ActiveScreen = SCREEN_MAP[currentScreen?.name] ?? Dashboard;

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <ActiveScreen params={currentScreen?.params ?? {}} />
    </AppContext.Provider>
  );
}
