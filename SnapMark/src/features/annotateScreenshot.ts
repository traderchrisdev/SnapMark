// "Annotate screenshot" (NOTE toolbar, showType 0): take a native screenshot anywhere (Kindle, the
// browser, a PDF...), open any note, tap: the newest screenshot becomes a new note to write on.
// If the newest one is older than the freshness window, a picker with the latest ones opens instead.
//
// Screenshots are full panel resolution, so they become the page template at the same size (SPIKES.md
// R39), shrunk clear of NOTE's toolbar unless that's turned off (R62). We're already in NOTE, so
// createNote is allowed without the helper note. The floating button ends up here too (features/bubble).

import { Image } from 'react-native';
import type { Element } from 'sn-plugin-lib';
import { backlinkSpec } from '../core/backlink';
import { fitInsetsDp } from '../core/fit';
import {
  SCREENSHOT_DIR,
  SCREENSHOTS_SUBFOLDER,
  baseName,
  docTitle,
  formatStamp,
  samePath,
  screenshotNoteCandidates,
  tmpDir,
} from '../core/paths';
import { isFresh, newestFirst, type Screenshot } from '../core/screenshots';
import { collects, INBOX_NAME, inboxPath, snapsDir, type Settings } from '../core/settings';
import { StepTimer } from '../core/timer';
import { log, logError } from '../platform/log';
import { Native } from '../platform/native';
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

export async function applyScreenshot(shot: Screenshot, settings: Settings, action: ShotAction): Promise<void> {
  if (action === 'insert') {
    await insertScreenshot(shot);
  } else {
    await snapScreenshot(shot, settings);
  }
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

export interface SnapScreenshotOptions {
  /** Known orientation (skips reading the image). */
  isPortrait?: boolean;
  /** The image is already shrunk clear of the toolbar (the floating button's captures are). */
  fitted?: boolean;
  /** Name the note after this instead of "Screenshot" (see core/paths captureSourceName). */
  source?: string;
  /** Captured from a document page: add the same "↩ <title>, p. N" link as Snap page does. */
  backlink?: DocPage;
  /** Ink to put on the new page (already placed in its coordinates). The caller recycles them. */
  elements?: Element[];
}

/** What goes onto the new page besides its image. */
interface PageExtras {
  backlink?: DocPage;
  elements?: Element[];
}

const hasExtras = (x: PageExtras) => !!x.backlink || !!x.elements?.length;

export interface DocPage {
  docPath: string;
  /** 0-based. */
  page: number;
}

/** Makes the screenshot a note (or an inbox page) and returns that note's path. NOTE must be in front. */
export async function snapScreenshot(shot: Screenshot, settings: Settings, opts: SnapScreenshotOptions = {}): Promise<string> {
  const t = new StepTimer();
  const isPortrait = opts.isPortrait ?? (await isPortraitImage(shot.path));
  const page = await pageImage(shot, settings, opts.fitted ?? false);
  if (page !== shot.path) {
    t.mark('fit');
  }
  try {
    if (collects(settings)) {
      const inbox = await appendScreenshotToInbox(shot, page, isPortrait, settings, t, opts);
      if (inbox) {
        await refillPool(await Sn.pluginDir());
        return inbox;
      }
    }
    const dir = `${snapsDir(settings)}/${SCREENSHOTS_SUBFOLDER}`;
    await assertUnlocked(dir);
    await fs.makeDirs(dir);
    const notePath = await firstFreePath(screenshotNoteCandidates(dir, formatStamp(shot.takenAt ?? new Date()), opts.source));
    t.mark('paths');
    await Sn.createNote(notePath, page, isPortrait);
    t.mark('createNote');
    if (hasExtras(opts)) {
      // Before opening, so the note is finished when NOTE shows it (R56).
      await addToPage(notePath, 0, opts);
      t.mark(opts.elements?.length ? `ink(${opts.elements.length}) + link` : 'link');
    }
    if (settings.afterSnap === 'open') {
      await Sn.openFile(notePath, 0);
      t.mark('open');
    } else {
      toast(`Saved ${baseName(notePath)}`);
    }
    log(`screenshot ${baseName(shot.path)} -> ${notePath} (${settings.afterSnap}) | ${t.summary()}`);
    // NOTE is in front: prepare blanks so page snaps can skip the helper note.
    await refillPool(await Sn.pluginDir());
    return notePath;
  } finally {
    if (page !== shot.path) {
      await fs.remove(page).catch(() => undefined); // embedded in the note by now (R21)
    }
  }
}

/** The page image: the screenshot shrunk clear of NOTE's toolbar (a temp file), or the screenshot itself. */
async function pageImage(shot: Screenshot, settings: Settings, fitted: boolean): Promise<string> {
  if (fitted || settings.screenshotFit === 'off' || !Native.available) {
    return shot.path;
  }
  const dir = tmpDir(await Sn.pluginDir());
  await fs.makeDirs(dir);
  const out = `${dir}/fit-${Date.now()}.png`;
  await Native.fitImage(shot.path, out, fitInsetsDp(settings.screenshotFit));
  return out;
}

/**
 * Collect mode. Returns null when the screenshot should get its own note instead: its orientation
 * doesn't match the inbox (templates are never scaled, R38). Creates the inbox if needed.
 */
async function appendScreenshotToInbox(
  shot: Screenshot,
  page: string,
  isPortrait: boolean,
  settings: Settings,
  t: StepTimer,
  extras: PageExtras,
): Promise<string | null> {
  const inbox = inboxPath(settings);
  await assertUnlocked(snapsDir(settings));
  await fs.makeDirs(snapsDir(settings));
  const open = settings.afterSnap === 'open';
  if (!(await fs.exists(inbox))) {
    await Sn.createNote(inbox, page, isPortrait); // we're in NOTE: allowed, and a fresh FILE_ID
    if (hasExtras(extras)) {
      await addToPage(inbox, 0, extras);
    }
    if (open) {
      await Sn.openFile(inbox, 0);
    } else {
      toast(`Started ${INBOX_NAME} with this screenshot`);
    }
    log(`screenshot ${baseName(shot.path)} -> new ${inbox} | ${t.summary()}`);
    return inbox;
  }
  const size = await Sn.pageSize(inbox, 0);
  if (size.height >= size.width !== isPortrait) {
    toast(`This screenshot's orientation doesn't fit ${INBOX_NAME}; saved as its own note.`, true);
    return null;
  }
  const inboxIsOpen = samePath(await Sn.currentFilePath().catch(() => null), inbox);
  let pageIndex: number;
  if (open || inboxIsOpen) {
    if (!inboxIsOpen) {
      await Sn.openFile(inbox, -1);
      await waitUntilCurrent(inbox);
    }
    pageIndex = await appendToOpenInbox(inbox, page);
    if (hasExtras(extras)) {
      await addToPage(inbox, pageIndex, extras);
    }
    await reloadAndShow(open ? pageIndex : null);
  } else {
    pageIndex = await appendToClosedInbox(inbox, page);
    if (hasExtras(extras)) {
      await addToPage(inbox, pageIndex, extras);
    }
  }
  t.mark(`inbox page ${pageIndex + 1}`);
  if (!open) {
    toast(`Added to ${INBOX_NAME} (page ${pageIndex + 1})`);
  }
  log(`screenshot ${baseName(shot.path)} -> ${inbox} page ${pageIndex + 1} | ${t.summary()}`);
  return inbox;
}

/**
 * Ink and the backlink, at file level like Snap page. The note is still useful without them, so a
 * failure only warns.
 */
async function addToPage(notePath: string, notePage: number, extras: PageExtras): Promise<void> {
  const ink = extras.elements ?? [];
  let link: Element | null = null;
  try {
    for (const e of ink) {
      e.pageNum = notePage;
    }
    if (extras.backlink) {
      const from = extras.backlink;
      const size = await Sn.pageSize(notePath, notePage);
      link = await Sn.newLinkElement(backlinkSpec(from.docPath, docTitle(from.docPath), from.page, size), notePage);
    }
    await Sn.insertElements(notePath, notePage, link ? [...ink, link] : ink);
  } catch (e) {
    logError('add ink/link to the new page (note kept without them)', e);
    toast(ink.length ? 'Saved, but your ink and the link back could not be added.' : 'Saved, but the link back to the page could not be added.', true);
  } finally {
    if (link) {
      Sn.recycle([link]);
    }
  }
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
