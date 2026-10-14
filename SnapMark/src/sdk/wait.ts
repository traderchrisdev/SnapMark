// Waiting without timers. Once our button's app leaves the foreground (any openFile that switches
// app), PluginHost pauses the plugin's RN host and setTimeout stops firing until the next button
// press, while native calls still resolve (SPIKES.md R34). So waits spin on a cheap native call.

import { PluginManager } from 'sn-plugin-lib';
import { samePath } from '../core/paths';
import { UserFacingError } from './errors';
import { Sn } from './sn';

export async function nativeDelay(ms: number): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await PluginManager.getDeviceType();
  }
}

/**
 * After openFile(path): wait until PluginHost reports it as the current file. That flips at the same
 * moment PluginHost starts routing calls to the opened app; before it, NOTE-only calls still go to
 * DOC and fail with 102 (SPIKES.md R37). Returns the ms waited.
 */
export async function waitUntilCurrent(path: string, timeoutMs = 6000, everyMs = 30): Promise<number> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const current = await Sn.currentFilePath().catch(() => null);
    if (samePath(current, path)) {
      return Date.now() - t0;
    }
    await nativeDelay(everyMs);
  }
  throw new UserFacingError('The Notes app did not open in time. Please try again.');
}
