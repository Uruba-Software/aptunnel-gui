import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnvsFromConfig } from '../src/services/storage.js';

// Helper: create a temp dir for isolated storage tests
let tmpDir;
beforeEach(async () => { tmpDir = await mkdtemp(join(tmpdir(), 'aptunnel-gui-test-')); });
afterEach(async ()  => { await rm(tmpDir, { recursive: true, force: true }); });

describe('parseEnvsFromConfig', () => {
  const sampleConfig = {
    version: 1,
    environments: {
      'my-env-development': {
        alias: 'dev',
        databases: {
          'mydb-dev': { alias: 'dev-db',    port: 55554, type: 'postgresql' },
          'mydb-redis': { alias: 'dev-redis', port: 55555, type: 'redis' },
        },
      },
      'my-env-production': {
        alias: 'prod',
        databases: {
          'proddb': { alias: 'prod-db', port: 55560, type: 'postgresql' },
        },
      },
    },
  };

  it('returns an array of envs', () => {
    const envs = parseEnvsFromConfig(sampleConfig);
    expect(Array.isArray(envs)).toBe(true);
    expect(envs).toHaveLength(2);
  });

  it('correctly maps envKey and envAlias', () => {
    const envs = parseEnvsFromConfig(sampleConfig);
    const dev = envs.find(e => e.envKey === 'my-env-development');
    expect(dev).toBeDefined();
    expect(dev.envAlias).toBe('dev');
  });

  it('correctly maps DB alias, port, and type', () => {
    const envs = parseEnvsFromConfig(sampleConfig);
    const dev = envs.find(e => e.envAlias === 'dev');
    const db = dev.dbs.find(d => d.dbKey === 'mydb-dev');
    expect(db.dbAlias).toBe('dev-db');
    expect(db.port).toBe(55554);
    expect(db.type).toBe('postgresql');
  });

  it('returns all databases for each environment', () => {
    const envs = parseEnvsFromConfig(sampleConfig);
    const dev = envs.find(e => e.envAlias === 'dev');
    expect(dev.dbs).toHaveLength(2);
  });

  it('falls back to dbKey as alias if alias is missing', () => {
    const config = {
      environments: {
        'env-1': {
          databases: { 'db-without-alias': { port: 5432, type: 'postgresql' } },
        },
      },
    };
    const envs = parseEnvsFromConfig(config);
    expect(envs[0].dbs[0].dbAlias).toBe('db-without-alias');
  });

  it('falls back to envKey as envAlias if alias is missing', () => {
    const config = {
      environments: {
        'plain-env': { databases: {} },
      },
    };
    const envs = parseEnvsFromConfig(config);
    expect(envs[0].envAlias).toBe('plain-env');
  });

  it('returns empty array for null/undefined config', () => {
    expect(parseEnvsFromConfig(null)).toEqual([]);
    expect(parseEnvsFromConfig(undefined)).toEqual([]);
    expect(parseEnvsFromConfig({})).toEqual([]);
  });

  it('handles environments with no databases', () => {
    const config = { environments: { 'empty-env': { alias: 'empty', databases: {} } } };
    const envs = parseEnvsFromConfig(config);
    expect(envs[0].dbs).toHaveLength(0);
  });
});
