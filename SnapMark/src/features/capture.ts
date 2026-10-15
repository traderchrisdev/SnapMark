// What the floating button and "Snap region" share once the page image exists: closing the region
// screen, getting NOTE in front, making the note (via snapScreenshot), going back for "Stay here",
// and cleaning up the temp images.

import { PixelRatio } from 'react-native';
import { PluginManager, type Element } from 'sn-plugin-lib';
import type { Rect, Size } from '../core/backlink';
import { classifyApp, NOTE_PACKAGE } from '../core/apps';
import { fitInsetsDp } from '../core/fit';
import { baseName, captureSourceName, hopNotePath, tmpDir, type CaptureSource } from '../core/paths';
import { insetsToPx, MARGIN_DP, regionPlacement } from '../core/region';
import { inboxPath, type Settings } from '../core/settings';
import type { StepTimer } from '../core/timer';
import { log, logError } from '../platform/log';
import { Native, type FrontTask } from '../platform/native';
import { hasFilePermissions } from '../platform/permissions';
import { CODE_NOT_ALLOWED_HERE, CODE_NOTE_NOT_READY, errorCode, UserFacingError } from '../sdk/errors';
import { fs } from '../sdk/fs';
import { Sn } from '../sdk/sn';
import { setRoute } from '../ui/route';
import { snapScreenshot, type DocPage } from './annotateScreenshot';
import type { RegionChoice } from './region';

/** Temp images of a capture run all start with this, so a later run can sweep up after a failed one. */
export const CAPTURE_PREFIX = 'capture-';

const SWITCH_TIMEOUT_MS = 4000;
/**
 * NOTE is in front a moment before PluginHost routes calls to it. Meanwhile they fail with 118 (coming
 * from an app without a plugin client, R65) or are refused with 102 by the app we came from (DOC).
 */
const READY_TIMEOUT_MS = 4000;
const READY_RETRY_MS = 150;

/** The last note a capture wrote: a known note to open if NOTE has no task to bring back. */
let lastNote: string | null = null;

/** The box placed at the top of a fresh page of `page` size, as the image `out`. Returns where it went. */
export async function placeRegion(src: string, out: string, crop: Rect, page: Size, settings: Settings): Promise<Rect> {
  const density = PixelRatio.get();
  const dst = regionPlacement(page, crop, insetsToPx(fitInsetsDp(settings.screenshotFit), density), Math.round(MARGIN_DP * density));
  await Native.cropInto(src, out, crop, dst);
  return dst;
}

/** Close the region screen and give the pen back to NOTE/DOC (closing alone doesn't always, per SuperDashboard). */
export async function closeRegionScreen(label: string, choice: RegionChoice): Promise<void> {
  await PluginManager.closePluginView().catch(e => logError('close region screen', e));
  const released = await Native.releasePenLock().catch(e => {
    logError('release pen', e);
    return false;
  });
  const what = choice === null ? 'cancelled' : choice === 'whole' ? 'whole' : `box ${JSON.stringify(choice)}`;
  log(`${label}: region screen: ${what}; pen released: ${String(released)}`);
}

export interface Delivery {
  /** The page image (already fitted or cut). */
  page: string;
  takenAt: Date;
  isPortrait: boolean;
  /** The app in front when the user started. */
  front: FrontTask;
  /** Set when that was a document page: names the note after it and links back. */
  doc: DocPage | null;
  /** Ink for the new page, already placed. The caller recycles them. */
  elements?: Element[];
}

/**
 * Get NOTE in front (unless it is), make the note, and go back to the starting app for "Stay here".
 * Until NOTE is in front no SDK call is made: in other apps they fail (118) or never answer (R64).
 */
export async function deliverToNote(label: string, d: Delivery, settings: Settings, pluginDir: string, t: StepTimer): Promise<void> {
  const app = classifyApp(d.front.pkg);
  if (app === 'other') {
    await bringNoteToFront(settings);
    t.mark('NOTE in front');
  }
  try {
    if (!(await hasFilePermissions())) {
      setRoute({ name: 'permission' });
      await PluginManager.showPluginView();
      return;
    }
    const source = captureSourceName(await sourceOf(d.front, d.doc));
    lastNote = await whenNoteReady(() =>
      snapScreenshot({ path: d.page, takenAt: d.takenAt }, settings, {
        isPortrait: d.isPortrait,
        fitted: true,
        source,
        backlink: d.doc ?? undefined,
        elements: d.elements,
      }),
    );
    t.mark('note');
    if (app === 'other' && settings.afterSnap === 'stay' && d.front.taskId >= 0) {
      await Native.moveTaskToFront(d.front.taskId);
      t.mark('back');
    }
    log(`${label}: ${d.front.pkg} -> ${lastNote} (${settings.afterSnap}) | ${t.summary()}`);
  } finally {
    await removeCaptures(pluginDir);
  }
}

/** NOTE must be in front (the open note is asked for when the capture was taken in NOTE). */
async function sourceOf(front: FrontTask, doc: DocPage | null): Promise<CaptureSource> {
  if (doc) {
    return { kind: 'doc', path: doc.docPath, page: doc.page };
  }
  if (front.pkg === NOTE_PACKAGE) {
    const note = await Sn.currentFilePath().catch(() => null);
    if (note) {
      return { kind: 'note', path: note };
    }
  }
  return { kind: 'app', label: front.pkg === NOTE_PACKAGE ? '' : front.label };
}

/** Bring back NOTE's task (with whatever note it had open); if it has none, open a note we know. */
async function bringNoteToFront(settings: Settings): Promise<void> {
  if ((await Native.bringNoteToFront()) && (await Native.waitForForeground(NOTE_PACKAGE, SWITCH_TIMEOUT_MS)) >= 0) {
    return;
  }
  const known = [lastNote, inboxPath(settings), hopNotePath()].filter((p): p is string => p !== null);
  const opened = await Native.openFirstNote(known);
  if (opened && (await Native.waitForForeground(NOTE_PACKAGE, SWITCH_TIMEOUT_MS)) >= 0) {
    log(`capture: NOTE had no task; opened ${opened}`);
    return;
  }
  throw new UserFacingError('Could not bring up the Notes app. Open any note, then try again.');
}

/**
 * Retry while PluginHost still routes to the app we came from. Safe for snapScreenshot: its first
 * NOTE-only call (createNote, or the inbox page count) comes before it writes anything.
 */
async function whenNoteReady<T>(task: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    try {
      return await task();
    } catch (e) {
      const code = errorCode(e);
      if ((code !== CODE_NOTE_NOT_READY && code !== CODE_NOT_ALLOWED_HERE) || Date.now() - t0 > READY_TIMEOUT_MS) {
        throw e;
      }
    }
    await Native.sleep(READY_RETRY_MS);
  }
}

/** Every capture temp image: this run's (embedded in the note by now) and any left by a run that failed. */
export async function removeCaptures(pluginDir: string): Promise<void> {
  for (const path of await fs.list(tmpDir(pluginDir)).catch(() => [] as string[])) {
    if (baseName(path).startsWith(CAPTURE_PREFIX)) {
      await fs.remove(path).catch(() => undefined);
    }
  }
}
