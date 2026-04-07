import { describe, it, expect } from '@jest/globals';
import {
  Status, Screen, AutoOpenTunnel, DbType, DB_DRIVER_PACKAGES,
  DEFAULT_SETTINGS, MIN_APTUNNEL_VERSION, APP_VERSION,
  DEFAULT_NAME_MAX_LENGTH, TUNNEL_OUTPUT_FIELD_RE,
} from '../src/constants.js';

describe('constants', () => {
  it('Status has all required labels', () => {
    const required = ['idle', 'connecting', 'connected', 'disconnecting', 'failed', 'loading', 'loaded', 'error'];
    for (const s of required) expect(Object.values(Status)).toContain(s);
  });

  it('Screen has all 6 screens', () => {
    expect(Object.keys(Screen)).toHaveLength(6);
    expect(Screen.DASHBOARD).toBe('Dashboard');
    expect(Screen.DB_DETAIL).toBe('DbDetail');
    expect(Screen.INIT_WIZARD).toBe('InitWizard');
  });

  it('AutoOpenTunnel has ask/always/never', () => {
    expect(AutoOpenTunnel.ASK).toBe('ask');
    expect(AutoOpenTunnel.ALWAYS).toBe('always');
    expect(AutoOpenTunnel.NEVER).toBe('never');
  });

  it('DbType values match aptunnel config YAML values', () => {
    expect(DbType.POSTGRES).toBe('postgresql');
    expect(DbType.MYSQL).toBe('mysql');
    expect(DbType.REDIS).toBe('redis');
    expect(DbType.ELASTICSEARCH).toBe('elasticsearch');
  });

  it('DB_DRIVER_PACKAGES maps all DB types to correct packages', () => {
    expect(DB_DRIVER_PACKAGES['postgresql']).toBe('pg');
    expect(DB_DRIVER_PACKAGES['mysql']).toBe('mysql2');
    expect(DB_DRIVER_PACKAGES['redis']).toBe('ioredis');
    expect(DB_DRIVER_PACKAGES['elasticsearch']).toBe('@elastic/elasticsearch');
  });

  it('DEFAULT_SETTINGS has all required fields with valid values', () => {
    expect(DEFAULT_SETTINGS.pollingInterval).toBe(5);
    expect(DEFAULT_SETTINGS.autoOpenTunnel).toBe('ask');
    expect(DEFAULT_SETTINGS.backgroundPreload).toBe(true);
    expect(DEFAULT_SETTINGS.logRetention).toBe(30);
    expect(DEFAULT_SETTINGS.theme).toBe('dark');
    expect(DEFAULT_SETTINGS.nameMaxLength).toBe(DEFAULT_NAME_MAX_LENGTH);
    expect(Array.isArray(DEFAULT_SETTINGS.hiddenEnvs)).toBe(true);
    expect(Array.isArray(DEFAULT_SETTINGS.hiddenDbs)).toBe(true);
  });

  it('MIN_APTUNNEL_VERSION is a valid semver string', () => {
    expect(MIN_APTUNNEL_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('APP_VERSION is a valid semver string', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('TUNNEL_OUTPUT_FIELD_RE matches expected tunnel output lines', () => {
    const lines = [
      '  Port:      55554',
      '  Host:      localhost.aptible.in',
      '  User:      aptible',
      '  Password:  xxxxxxxxxx',
      '  URL:       postgresql://aptible:xxx@localhost:5432/db',
      '  PID:       12345',
    ];
    for (const line of lines) {
      expect(TUNNEL_OUTPUT_FIELD_RE.test(line)).toBe(true);
    }
  });

  it('TUNNEL_OUTPUT_FIELD_RE does not match non-field lines', () => {
    expect(TUNNEL_OUTPUT_FIELD_RE.test('✔ dev-db tunnel opened')).toBe(false);
    expect(TUNNEL_OUTPUT_FIELD_RE.test('')).toBe(false);
    expect(TUNNEL_OUTPUT_FIELD_RE.test('  random text')).toBe(false);
  });
});
