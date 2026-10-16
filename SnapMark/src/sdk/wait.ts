// Waiting without timers. Once our button's app leaves the foreground (any openFile that switches
// app), PluginHost pauses the plugin's RN host and setTimeout stops firing until the next button
// press, while native calls still resolve (SPIKES.md R34). So waits spin on a cheap native call.

import { PluginManager } from 'sn-plugin-lib';
import { samePath } from '../core/paths';
import { log } from '../platform/log';
import { UserFacingError } from './errors';
import { Sn } from './sn';

export async function nativeDelay(ms: number): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await PluginManager.getDeviceType();
  }
}

/** The flip-back seen on the Manta came 230 ms after the first report. */
const STABLE_MS = 500;

/**
 * After openFile(path): wait until PluginHost reports it as the current file. That flips at the same
 * moment PluginHost starts routing calls to the opened app; before it, NOTE-only calls still go to
 * DOC and fail with 102 (SPIKES.md R37). When NOTE is switching away from another note it can report
 * the new file, then the old one, then the new one again while it loads (R77), and a file-level edit
 * made in between is half-loaded and never reloaded. So the path must hold for `stableMs` (the window
 * may run past `timeoutMs`: the deadline is for the first sighting). Returns the ms waited.
 */
export async function waitUntilCurrent(path: string, timeoutMs = 6000, everyMs = 30, stableMs = STABLE_MS): Promise<number> {
  const t0 = Date.now();
  let since: number | null = null;
  for (;;) {
    const current = await Sn.currentFilePath().catch(() => null);
    if (samePath(current, path)) {
      since ??= Date.now();
      if (Date.now() - since >= stableMs) {
        return Date.now() - t0;
      }
    } else {
      since = null;
      if (Date.now() - t0 >= timeoutMs) {
        throw new UserFacingError('The Notes app did not open in time. Please try again.');
      }
    }
    await nativeDelay(everyMs);
  }
}

/**
 * Before reloading the note after file-level edits: if NOTE flipped to another file meanwhile (a
 * flip-back longer than STABLE_MS), wait for it to settle on `path` again, or the reload is lost.
 */
export async function ensureStillCurrent(path: string): Promise<void> {
  const current = await Sn.currentFilePath().catch(() => null);
  if (!samePath(current, path)) {
    log(`NOTE moved to ${current ?? '?'} during the edit; waiting for ${path} again`);
    await waitUntilCurrent(path);
  }
}
