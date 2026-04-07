import { useCallback } from 'react';
import { Screen } from '../constants.js';
import { useAppContext } from '../state/AppContext.js';

export function useNavigation() {
  const { dispatch } = useAppContext();

  const push    = useCallback((screen, params) => dispatch({ type: 'PUSH_SCREEN',    screen, params }), [dispatch]);
  const pop     = useCallback(()                => dispatch({ type: 'POP_SCREEN' }),                    [dispatch]);
  const replace = useCallback((screen, params) => dispatch({ type: 'REPLACE_SCREEN', screen, params }), [dispatch]);
  const quit    = useCallback(()                => dispatch({ type: 'EXIT' }),                          [dispatch]);

  const goTo = {
    dashboard:    (p) => push(Screen.DASHBOARD,    p),
    dbDetail:     (p) => push(Screen.DB_DETAIL,    p),
    settings:     ()  => push(Screen.SETTINGS,     {}),
    logs:         ()  => push(Screen.LOGS,          {}),
    configEditor: ()  => push(Screen.CONFIG_EDITOR, {}),
    initWizard:   ()  => replace(Screen.INIT_WIZARD, {}),
  };

  return { push, pop, replace, quit, goTo };
}
