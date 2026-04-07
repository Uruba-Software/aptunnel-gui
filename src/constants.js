// Minimum required aptunnel version
export const MIN_APTUNNEL_VERSION = '1.1.0';
export const APP_VERSION = '0.1.0';

// Polling interval default (seconds)
export const DEFAULT_POLL_INTERVAL = 5;

// aptunnel-gui storage (~/.aptunnel-gui/)
export const APP_DIR = '.aptunnel-gui';
export const SETTINGS_FILE = 'settings.json';
export const CACHE_DIR = 'cache';
export const LOGS_DIR = 'logs';

// aptunnel config location (~/.aptunnel/config.yaml)
export const APTUNNEL_DIR = '.aptunnel';
export const APTUNNEL_CONFIG_FILE = 'config.yaml';

// Minimum terminal dimensions
export const MIN_COLS = 80;
export const MIN_ROWS = 24;

// Default name truncation width in dashboard
export const DEFAULT_NAME_MAX_LENGTH = 18;

// Operation status labels
export const Status = Object.freeze({
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTING: 'disconnecting',
  FAILED: 'failed',
  LOADING: 'loading',
  LOADED: 'loaded',
  ERROR: 'error',
});

// Screen names
export const Screen = Object.freeze({
  INIT_WIZARD: 'InitWizard',
  DASHBOARD: 'Dashboard',
  DB_DETAIL: 'DbDetail',
  CONFIG_EDITOR: 'ConfigEditor',
  SETTINGS: 'Settings',
  LOGS: 'Logs',
});

// Auto-open tunnel setting values
export const AutoOpenTunnel = Object.freeze({
  ASK: 'ask',
  ALWAYS: 'always',
  NEVER: 'never',
});

// Default settings
export const DEFAULT_SETTINGS = {
  pollingInterval: DEFAULT_POLL_INTERVAL,
  autoOpenTunnel: AutoOpenTunnel.ASK,
  backgroundPreload: true,
  logRetention: 30,
  theme: 'dark',
  nameMaxLength: DEFAULT_NAME_MAX_LENGTH,
  // hidden items — stored here to persist across sessions
  hiddenEnvs: [],   // array of env alias strings
  hiddenDbs: [],    // array of "envAlias/dbAlias" strings
};

// Log levels
export const LogLevel = Object.freeze({
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
});

// DB types (matching aptunnel config YAML values)
export const DbType = Object.freeze({
  POSTGRES: 'postgresql',
  MYSQL: 'mysql',
  REDIS: 'redis',
  ELASTICSEARCH: 'elasticsearch',
});

// DB driver package names
export const DB_DRIVER_PACKAGES = {
  [DbType.POSTGRES]: 'pg',
  [DbType.MYSQL]: 'mysql2',
  [DbType.REDIS]: 'ioredis',
  [DbType.ELASTICSEARCH]: '@elastic/elasticsearch',
};

// Regex to parse tunnel open stdout
// e.g.: "  Port:      55554"
export const TUNNEL_OUTPUT_FIELD_RE = /^\s+(Port|Host|User|Password|URL|PID):\s+(.+)$/;
