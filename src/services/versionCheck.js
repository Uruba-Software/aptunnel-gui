import semver from 'semver';
import { getAptunnelVersion, installAptunnel } from './aptunnel.js';
import { MIN_APTUNNEL_VERSION } from '../constants.js';

/**
 * Ensure aptunnel is installed and meets MIN_APTUNNEL_VERSION.
 * @param {(msg: string) => void} [onProgress]
 * @returns {Promise<{ status: 'ok'|'installed'|'updated', version: string }>}
 */
export async function ensureAptunnel(onProgress) {
  onProgress?.('Checking aptunnel installation…');
  const version = await getAptunnelVersion();

  if (!version) {
    onProgress?.('aptunnel not found — installing…');
    await installAptunnel();
    const v = await getAptunnelVersion();
    onProgress?.(`aptunnel installed (${v})`);
    return { status: 'installed', version: v ?? '?' };
  }

  if (!semver.gte(version, MIN_APTUNNEL_VERSION)) {
    onProgress?.(`aptunnel ${version} is outdated (need >=${MIN_APTUNNEL_VERSION}) — updating…`);
    await installAptunnel();
    const v = await getAptunnelVersion();
    onProgress?.(`aptunnel updated to ${v}`);
    return { status: 'updated', version: v ?? '?' };
  }

  onProgress?.(`aptunnel ${version} ✓`);
  return { status: 'ok', version };
}
