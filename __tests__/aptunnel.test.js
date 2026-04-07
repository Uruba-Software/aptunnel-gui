import { describe, it, expect } from '@jest/globals';
import { parseTunnelOutput, parseStatusOutput } from '../src/services/aptunnel.js';

describe('parseTunnelOutput', () => {
  const sampleOutput = `✔ dev-db tunnel opened
  Port:      55554
  Host:      localhost.aptible.in
  User:      aptible
  Password:  s3cr3t!
  URL:       postgresql://aptible:s3cr3t!@localhost.aptible.in:55554/db
  PID:       12345`;

  it('parses port as a number', () => {
    const info = parseTunnelOutput(sampleOutput);
    expect(info.port).toBe(55554);
  });

  it('parses host', () => {
    const info = parseTunnelOutput(sampleOutput);
    expect(info.host).toBe('localhost.aptible.in');
  });

  it('parses user', () => {
    const info = parseTunnelOutput(sampleOutput);
    expect(info.user).toBe('aptible');
  });

  it('parses password', () => {
    const info = parseTunnelOutput(sampleOutput);
    expect(info.password).toBe('s3cr3t!');
  });

  it('parses URL', () => {
    const info = parseTunnelOutput(sampleOutput);
    expect(info.url).toContain('postgresql://');
  });

  it('parses PID as a number', () => {
    const info = parseTunnelOutput(sampleOutput);
    expect(info.pid).toBe(12345);
  });

  it('returns null for missing fields', () => {
    const info = parseTunnelOutput('✔ dev-db tunnel opened');
    expect(info.port).toBeNull();
    expect(info.host).toBeNull();
    expect(info.pid).toBeNull();
  });

  it('handles empty string gracefully', () => {
    const info = parseTunnelOutput('');
    expect(info.port).toBeNull();
    expect(info.user).toBeNull();
  });

  it('handles extra whitespace in values', () => {
    const info = parseTunnelOutput('  Port:      9200   ');
    expect(info.port).toBe(9200);
  });
});

describe('parseStatusOutput', () => {
  it('marks UP tunnels as active', () => {
    const raw = `prod-postgres  UP   :5432\nprod-redis  DOWN`;
    const result = parseStatusOutput(raw);
    expect(result['prod-postgres']).toBe(true);
    expect(result['prod-redis']).toBe(false);
  });

  it('handles CONN status as active', () => {
    const raw = 'dev-db  CONN   :5432';
    const result = parseStatusOutput(raw);
    expect(result['dev-db']).toBe(true);
  });

  it('returns empty object for empty string', () => {
    expect(parseStatusOutput('')).toEqual({});
  });

  it('ignores blank lines', () => {
    const raw = '\n\nprod-postgres  UP   :5432\n\n';
    const result = parseStatusOutput(raw);
    expect(Object.keys(result)).toHaveLength(1);
  });
});
