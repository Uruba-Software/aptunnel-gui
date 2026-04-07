#!/usr/bin/env node
/**
 * postinstall — run after `npm install -g aptunnel-gui`.
 * Checks that aptunnel is installed and meets minimum version.
 * Non-fatal: warns but does not fail the install.
 */
import { execSync } from 'node:child_process';

const MIN_VERSION = '1.0.0';

function parseVersion(v) {
  return v.split('.').map(Number);
}

function isAtLeast(installed, minimum) {
  const [mj1, mn1, p1] = parseVersion(installed);
  const [mj2, mn2, p2] = parseVersion(minimum);
  if (mj1 !== mj2) return mj1 > mj2;
  if (mn1 !== mn2) return mn1 > mn2;
  return p1 >= p2;
}

try {
  const out = execSync('aptunnel --version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const match = out.match(/(\d+\.\d+\.\d+)/);
  if (match) {
    const version = match[1];
    if (!isAtLeast(version, MIN_VERSION)) {
      console.warn(`\n⚠  aptunnel ${version} is older than the recommended minimum (${MIN_VERSION}).`);
      console.warn('   Run: npm install -g aptunnel\n');
    }
  }
} catch {
  console.warn('\n⚠  aptunnel is not installed. Run: npm install -g aptunnel\n');
}
