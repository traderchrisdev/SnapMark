// Floating capture button (SPIKES.md §1l). A bubble over every app: a tap captures the screen,
// shrunk clear of NOTE's toolbar, brings NOTE to the front and hands the capture to snapScreenshot.
// So it becomes a note (or an inbox page) exactly like "Annotate screenshot" makes one from a
// native screenshot.
//
// Until NOTE is in front only native calls are made: in other apps the SDK fails (118) or never
// answers (Ratta Settings), R64. Settings and the plugin dir come from memory for the same reason.
// The one exception is DOC, which answers like it does for Snap page: the document and page are read
// there, so the note can be named after the book and link back to the page.

import { DeviceEventEmitter } from 'react-native';
import { PluginManager } from 'sn-plugin-lib';
import { classifyApp, DOC_PACKAGE, NOTE_PACKAGE } from '../core/apps';
import { fitInsetsDp } from '../core/fit';
import { baseName, captureSourceName, hopNotePath, isDocumentPath, tmpDir, type CaptureSource } from '../core/paths';
import { inboxPath, type Settings } from '../core/settings';
import { StepTimer } from '../core/timer';
import { log, logError } from '../platform/log';
import { BUBBLE_TAP_EVENT, Native, type FrontTask } from '../platform/native';
import { hasFilePermissions } from '../platform/permissions';
import { cachedSettings } from '../platform/settingsStore';
import { CODE_NOTE_NOT_READY, errorCode, UserFacingError } from '../sdk/errors';
import { fs } from '../sdk/fs';
import { Sn } from '../sdk/sn';
import { setRoute } from '../ui/route';
import { snapScreenshot, type DocPage } from './annotateScreenshot';

const SWITCH_TIMEOUT_MS = 4000;
/** NOTE is in front a moment before PluginHost routes calls to it; meanwhile they fail with 118 (R65). */
const READY_TIMEOUT_MS = 4000;
const READY_RETRY_MS = 150;
const DOC_READ_TIMEOUT_MS = 2000;
const CAPTURE_PREFIX = 'capture-';

let pluginDir: string | null = null;
/** The last note the button wrote: a known note to open if NOTE has no task to bring back. */
let lastNote: string | null = null;

/** At plugin start: listen for taps, remove a bubble left by an earlier version, show it if enabled. */
export async function startBubble(onTap: () => void, enabled: boolean): Promise<void> {
  if (!Native.available) {
    log('bubble: native module missing from this build');
    return;
  }
  pluginDir = await Sn.pluginDir();
  // Module scope: a listener in a component would die with the plugin's screen.
  DeviceEventEmitter.addListener(BUBBLE_TAP_EVENT, onTap);
  const cleared = await Native.clearAllBubbles();
  if (enabled) {
    await Native.showBubble();
  }
  log(`bubble: ${enabled ? 'shown' : 'off'}${cleared ? ` (removed ${cleared} left by an earlier version)` : ''}`);
}

export async function setBubble(on: boolean): Promise<void> {
  await (on ? Native.showBubble() : Native.hideBubble());
}

export async function captureFromBubble(): Promise<void> {
  const t = new StepTimer();
  const settings = cachedSettings();
  if (!pluginDir) {
    throw new UserFacingError('SnapMark is still starting. Tap again in a moment.');
  }
  const capture = `${tmpDir(pluginDir)}/${CAPTURE_PREFIX}${Date.now()}.png`;
  const takenAt = new Date();
  const [front, shot] = await Promise.all([
    Native.foreground(),
    Native.captureScreen(capture, fitInsetsDp(settings.screenshotFit)),
  ]);
  t.mark(`capture (shot ${shot.shotMs}, fit ${shot.composeMs}, png ${shot.encodeMs})`);
  const app = classifyApp(front.pkg);
  if (app === 'pluginHost') {
    throw new UserFacingError('Close the plugin screen first, then tap the button.');
  }
  const doc = front.pkg === DOC_PACKAGE ? await readDocPage() : null;
  if (app === 'other') {
    await bringNoteToFront(settings);
    t.mark('NOTE in front');
  }
  // NOTE is in front: SDK calls are safe from here.
  try {
    if (!(await hasFilePermissions())) {
      setRoute({ name: 'permission' });
      await PluginManager.showPluginView();
      return;
    }
    const source = captureSourceName(await sourceOf(front, doc));
    lastNote = await whenNoteReady(() =>
      snapScreenshot({ path: capture, takenAt }, settings, {
        isPortrait: shot.height >= shot.width,
        fitted: true,
        source,
        backlink: doc ?? undefined,
      }),
    );
    t.mark('note');
    if (app === 'other' && settings.afterSnap === 'stay' && front.taskId >= 0) {
      await Native.moveTaskToFront(front.taskId);
      t.mark('back');
    }
    log(`bubble: ${front.pkg} -> ${lastNote} (${settings.afterSnap}) | ${t.summary()}`);
  } finally {
    await removeCaptures(pluginDir);
  }
}

/** The open document and page, read while DOC is still in front. Null (no link) if DOC doesn't answer. */
async function readDocPage(): Promise<DocPage | null> {
  try {
    const [docPath, page] = await Promise.race([
      Promise.all([Sn.currentFilePath(), Sn.currentPage()]),
      Native.sleep(DOC_READ_TIMEOUT_MS).then((): never => {
        throw new UserFacingError(`no answer from DOC after ${DOC_READ_TIMEOUT_MS} ms`);
      }),
    ]);
    return isDocumentPath(docPath) ? { docPath, page } : null;
  } catch (e) {
    logError('bubble: read document page (capturing without a link)', e);
    return null;
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
    log(`bubble: NOTE had no task; opened ${opened}`);
    return;
  }
  throw new UserFacingError('Could not bring up the Notes app. Open any note, then tap the button again.');
}

/**
 * Retry while PluginHost says NOTE isn't open yet. Safe for snapScreenshot: its first NOTE-only call
 * comes before it writes anything.
 */
async function whenNoteReady<T>(task: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    try {
      return await task();
    } catch (e) {
      if (errorCode(e) !== CODE_NOTE_NOT_READY || Date.now() - t0 > READY_TIMEOUT_MS) {
        throw e;
      }
    }
    await Native.sleep(READY_RETRY_MS);
  }
}

/** This tap's capture (embedded in the note by now) and any left by a tap that failed before NOTE came up. */
async function removeCaptures(dir: string): Promise<void> {
  const tmp = tmpDir(dir);
  for (const path of await fs.list(tmp).catch(() => [] as string[])) {
    if (baseName(path).startsWith(CAPTURE_PREFIX)) {
      await fs.remove(path).catch(() => undefined);
    }
  }
}
