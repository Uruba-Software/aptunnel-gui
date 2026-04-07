import { describe, it, expect, jest } from '@jest/globals';
import semver from 'semver';
import { MIN_APTUNNEL_VERSION } from '../src/constants.js';

describe('versionCheck helpers', () => {
  it('MIN_APTUNNEL_VERSION is a valid semver', () => {
    expect(semver.valid(MIN_APTUNNEL_VERSION)).toBeTruthy();
  });

  it('semver.gte correctly identifies sufficient versions', () => {
    expect(semver.gte('1.1.0', MIN_APTUNNEL_VERSION)).toBe(true);
    expect(semver.gte('2.0.0', MIN_APTUNNEL_VERSION)).toBe(true);
    expect(semver.gte('1.0.0', MIN_APTUNNEL_VERSION)).toBe(false); // 1.0.0 < 1.1.0
  });
});
