// "Annotate screenshot" (NOTE toolbar, showType 0): take a native screenshot anywhere (Kindle, the
// browser, a PDF...), open any note, tap: the newest screenshot becomes a new note to write on.
// If the newest one is older than the freshness window, a picker with the latest ones opens instead.
//
// Screenshots are full panel resolution, so they're used as the template as-is (SPIKES.md R39), and
// we're already in NOTE, so createNote is allowed without the helper note.

import { Image } from 'react-native';
import { SCREENSHOT_DIR, SCREENSHOTS_SUBFOLDER, baseName, formatStamp, samePath, screenshotNoteCandidates } from '../core/paths';
import { isFresh, newestFirst, type Screenshot } from '../core/screenshots';
import { INBOX_NAME, inboxPath, snapsDir, type Settings } from '../core/settings';
import { StepTimer } from '../core/timer';
import { log } from '../platform/log';
import { toast } from '../platform/toast';
import { UserFacingError } from '../sdk/errors';
import { fs } from '../sdk/fs';
import { Sn } from '../sdk/sn';
import { waitUntilCurrent } from '../sdk/wait';
import { assertUnlocked, firstFreePath } from './files';
import { appendToClosedInbox, appendToOpenInbox, reloadAndShow } from './inbox';
import { refillPool } from './pool';

export const PICKER_COUNT = 12;

export type LatestResult = { kind: 'done' } | { kind: 'pick'; shots: Screenshot[] };

/** What to do with the chosen screenshot: a note of its own (or inbox page), or a picture on the current page. */
export type ShotAction = 'annotate' | 'insert';

/** Newest screenshot if it is fresh, otherwise the latest few for the picker. */
export async function latestScreenshot(
  settings: Settings,
  action: ShotAction,
): Promise<LatestResult> {
  const shots = newestFirst(await fs.list(SCREENSHOT_DIR));
  if (!shots.length) {
    throw new UserFacingError('No screenshots yet. Take one, then tap again.');
  }
  if (isFresh(shots[0], new Date(), settings.screenshotFreshMinutes)) {
    await applyScreenshot(shots[0], settings, action);
    return { kind: 'done' };
  }
  return { kind: 'pick', shots: shots.slice(0, PICKER_COUNT) };
}

export function applyScreenshot(shot: Screenshot, settings: Settings, action: ShotAction): Promise<void> {
  return action === 'insert' ? insertScreenshot(shot) : snapScreenshot(shot, settings);
}

/** "Insert screenshot": the picture goes onto the current page of the open note. */
export async function insertScreenshot(shot: Screenshot): Promise<void> {
  const t = new StepTimer();
  const notePath = await Sn.currentFilePath();
  if (!/\.note$/i.test(notePath)) {
    throw new UserFacingError('Open a note to insert a screenshot.');
  }
  const [shotPortrait, page] = await Promise.all([isPortraitImage(shot.path), Sn.currentPage()]);
  const size = await Sn.pageSize(notePath, page);
  await Sn.insertImage(shot.path);
  t.mark('insertImage');
  const fits = shotPortrait === size.height >= size.width;
  toast(
    fits
      ? 'Screenshot inserted. Lasso it to move or resize.'
      : 'Screenshot inserted; it is wider than the page. Lasso it to resize.',
    !fits,
  );
  log(`insert ${baseName(shot.path)} into ${notePath} page ${page + 1} | ${t.summary()}`);
}

export async function snapScreenshot(shot: Screenshot, settings: Settings): Promise<void> {
  const t = new StepTimer();
  const isPortrait = await isPortraitImage(shot.path);
  if (settings.collect && (await appendScreenshotToInbox(shot, isPortrait, settings, t))) {
    await refillPool(await Sn.pluginDir());
    return;
  }
  const dir = `${snapsDir(settings)}/${SCREENSHOTS_SUBFOLDER}`;
  await assertUnlocked(dir);
  await fs.makeDirs(dir);
  const notePath = await firstFreePath(screenshotNoteCandidates(dir, formatStamp(shot.takenAt ?? new Date())));
  t.mark('paths');
  await Sn.createNote(notePath, shot.path, isPortrait);
  t.mark('createNote');
  if (settings.afterSnap === 'open') {
    await Sn.openFile(notePath, 0);
    t.mark('open');
  } else {
    toast(`Saved ${baseName(notePath)}`);
  }
  log(`screenshot ${baseName(shot.path)} -> ${notePath} (${settings.afterSnap}) | ${t.summary()}`);
  // NOTE is in front: prepare blanks so page snaps can skip the helper note.
  await refillPool(await Sn.pluginDir());
}

/**
 * Collect mode. Returns false when the screenshot should get its own note instead: its orientation
 * doesn't match the inbox (templates are never scaled, R38). Creates the inbox if needed.
 */
async function appendScreenshotToInbox(shot: Screenshot, isPortrait: boolean, settings: Settings, t: StepTimer): Promise<boolean> {
  const inbox = inboxPath(settings);
  await assertUnlocked(snapsDir(settings));
  await fs.makeDirs(snapsDir(settings));
  const open = settings.afterSnap === 'open';
  if (!(await fs.exists(inbox))) {
    await Sn.createNote(inbox, shot.path, isPortrait); // we're in NOTE: allowed, and a fresh FILE_ID
    if (open) {
      await Sn.openFile(inbox, 0);
    } else {
      toast(`Started ${INBOX_NAME} with this screenshot`);
    }
    log(`screenshot ${baseName(shot.path)} -> new ${inbox} | ${t.summary()}`);
    return true;
  }
  const size = await Sn.pageSize(inbox, 0);
  if (size.height >= size.width !== isPortrait) {
    toast(`This screenshot's orientation doesn't fit ${INBOX_NAME}; saved as its own note.`, true);
    return false;
  }
  const inboxIsOpen = samePath(await Sn.currentFilePath().catch(() => null), inbox);
  let page: number;
  if (open || inboxIsOpen) {
    if (!inboxIsOpen) {
      await Sn.openFile(inbox, -1);
      await waitUntilCurrent(inbox);
    }
    page = await appendToOpenInbox(inbox, shot.path);
    await reloadAndShow(open ? page : null);
  } else {
    page = await appendToClosedInbox(inbox, shot.path);
  }
  t.mark(`inbox page ${page + 1}`);
  if (!open) {
    toast(`Added to ${INBOX_NAME} (page ${page + 1})`);
  }
  log(`screenshot ${baseName(shot.path)} -> ${inbox} page ${page + 1} | ${t.summary()}`);
  return true;
}

/** RN's Image.getSize under-reports full-size screenshots (2× smaller) but keeps the aspect ratio (R39). */
function isPortraitImage(path: string): Promise<boolean> {
  return new Promise(resolve =>
    Image.getSize(
      `file://${path}`,
      (w, h) => resolve(h >= w),
      () => resolve(true),
    ),
  );
}
