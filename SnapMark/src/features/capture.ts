// What the floating button and "Snap region" share once the page image exists: closing the region
// screen, getting NOTE in front, making the note (via snapScreenshot), going back for "Stay here",
// and cleaning up the temp images. Or, with "Into the note I'm working in", pasting the cut-out onto the
// page of the note NOTE has open (pasteIntoNote).

import { PixelRatio } from 'react-native';
import { PluginManager, type Element } from 'sn-plugin-lib';
import { backlinkSpec, captionUnder, linkUnder, type Rect, type Size } from '../core/backlink';
import { classifyApp, NOTE_PACKAGE } from '../core/apps';
import { fitInsetsDp } from '../core/fit';
import { baseName, captureSourceName, docTitle, hopNotePath, nativeHopPath, samePath, tmpDir, type CaptureSource } from '../core/paths';
import { insetsToPx, MARGIN_DP, pastePlacement, regionPlacement } from '../core/region';
import { inboxPath, type Settings } from '../core/settings';
import type { StepTimer } from '../core/timer';
import { log, logError } from '../platform/log';
import { toast } from '../platform/toast';
import { Native, type FrontTask } from '../platform/native';
import { hasFilePermissions } from '../platform/permissions';
import { CODE_NOT_ALLOWED_HERE, CODE_NOTE_NOT_READY, errorCode, UserFacingError } from '../sdk/errors';
import { fs } from '../sdk/fs';
import { Sn } from '../sdk/sn';
import { ensureStillCurrent, waitUntilCurrent } from '../sdk/wait';
import { setRoute } from '../ui/route';

import { snapScreenshot, type DocPage } from './annotateScreenshot';
import { reloadAndShow } from './inbox';
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

/** Just the box, as its own image `out`, for pasting into a note (it goes in at its own size, R38). */
export async function cutRegion(src: string, out: string, crop: Rect): Promise<Pasted> {
  const size = await Native.cutOut(src, out, crop);
  return { path: out, width: size.width, height: size.height };
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
  /** The page size that ink was made for. */
  inkPageSize?: Size;
  /**
   * Ink that can only be read with NOTE in front (a document's last page, R80): added to the note
   * once it is open. Returns elements in the note page's px; the caller of the callback recycles them.
   */
  lateInk?: () => Promise<Element[]>;
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
        inkPageSize: d.inkPageSize,
      }),
    );
    t.mark('note');
    if (d.lateInk && lastNote) {
      await addLateInk(lastNote, d, settings);
      t.mark('late ink');
    }
    if (app === 'other' && settings.afterSnap === 'stay' && d.front.taskId >= 0) {
      await Native.moveTaskToFront(d.front.taskId);
      t.mark('back');
    }
    log(`${label}: ${d.front.pkg} -> ${lastNote} (${settings.afterSnap}) | ${t.summary()}`);
  } finally {
    await removeCaptures(pluginDir);
  }
}

const TYPE_PICTURE = 200;
const LINK_GAP = 12;
const NO_RECT: Rect = { left: 0, top: 0, right: 0, bottom: 0 };

/** An image to paste and its size in px. */
export interface Pasted {
  path: string;
  width: number;
  height: number;
  /**
   * The handwriting that belongs on the picture, once its place `dst` on a note page of `noteSize` is
   * known (NOTE is in front then, which reads any page's ink, R80). The caller of this recycles them.
   */
  ink?: (dst: Rect, noteSize: Size) => Promise<Element[]>;
}

/**
 * "Into the note I'm working in": bring back NOTE with the note it had open and paste the image onto
 * its current page as a picture (lasso to move it), below what's already there or on a new page after
 * it, with a "↩ Book, p. N" link under it for a document or a caption naming the app. NOTE must already have a note open: opening
 * some other note to paste into would be a surprise.
 */
export async function pasteIntoNote(
  label: string,
  image: Pasted,
  front: FrontTask,
  doc: DocPage | null,
  caption: string | null,
  settings: Settings,
  pluginDir: string,
  t: StepTimer,
): Promise<void> {
  const app = classifyApp(front.pkg);
  try {
    if (app !== 'note') {
      if (!(await Native.bringNoteToFront()) || (await Native.waitForForeground(NOTE_PACKAGE, SWITCH_TIMEOUT_MS)) < 0) {
        throw new UserFacingError('Open the note to paste into, then snap again.');
      }
      t.mark('NOTE in front');
    }
    if (!(await hasFilePermissions())) {
      setRoute({ name: 'permission' });
      await PluginManager.showPluginView();
      return;
    }
    const notePath = await openNotePath();
    if (samePath(notePath, hopNotePath())) {
      throw new UserFacingError('Open the note to paste into, then snap again.');
    }
    const page = await Sn.currentPage();
    let where = `page ${page + 1}`;
    let linked = true;
    try {
      const placed = await placeOnPage(notePath, page, image, doc, caption, settings, tmpDir(pluginDir));
      where = placed.newPage ? `new page ${placed.page + 1}` : `page ${page + 1}, below its content`;
      t.mark('placed');
    } catch (e) {
      // Still paste, the way "Insert screenshot" does: centered, maybe over what's there.
      logError('place the paste (inserting it centered instead)', e);
      await Sn.insertImage(image.path);
      linked = doc ? await addLinkUnderPicture(notePath, page, doc) : true;
      where = `page ${page + 1}, centered`;
      t.mark('insertImage');
    }
    if (app !== 'note' && settings.afterSnap === 'stay' && front.taskId >= 0) {
      await Native.moveTaskToFront(front.taskId);
      t.mark('back');
      toast(`Pasted into ${baseName(notePath)}`);
    } else if (!linked) {
      toast('Pasted, but the link back to the page could not be added.', true);
    }
    log(`${label}: ${front.pkg} -> pasted into ${notePath}, ${where} | ${t.summary()}`);
  } finally {
    await removeCaptures(pluginDir);
  }
}

/**
 * Put the picture (and link) on the page at file level, where it's free, then reload the note (R52).
 * Free space is found in a render of the page: what differs from its background, or for an image
 * background (a snap or capture note) the background too.
 */
async function placeOnPage(
  notePath: string,
  page: number,
  image: Pasted,
  doc: DocPage | null,
  caption: string | null,
  settings: Settings,
  tmp: string,
): Promise<{ page: number; newPage: boolean }> {
  await Sn.saveOpenNote();
  const size = await Sn.pageSize(notePath, page);
  const stamp = Date.now();
  const render = `${tmp}/${CAPTURE_PREFIX}${stamp}-note.png`;
  await Sn.notePagePng(notePath, page, render);
  const template = await Sn.pageTemplate(notePath, page).catch(e => {
    logError('paste: page template', e);
    return null;
  });
  let background: string | null = null;
  if (template && !template.name.startsWith('user_')) {
    background = `${tmp}/${CAPTURE_PREFIX}${stamp}-template.png`;
    await Sn.templatePng(notePath, page, background).catch(e => {
      logError('paste: template image', e);
      background = null;
    });
  }
  const bottom = await Native.contentBottom(render, background);
  const spec = doc ? backlinkSpec(doc.docPath, docTitle(doc.docPath), doc.page, size) : null;
  const below = spec?.rect ?? (caption ? captionUnder(caption, NO_RECT, size).rect : null);
  const reserve = below ? below.bottom - below.top + LINK_GAP : 0;
  const density = PixelRatio.get();
  const plan = pastePlacement(size, image, bottom, insetsToPx(fitInsetsDp(settings.screenshotFit), density), Math.round(MARGIN_DP * density), reserve);
  log(`paste: template ${template?.name ?? '?'}, content ends at ${bottom}, picture ${JSON.stringify(plan.rect)}${plan.newPage ? ' on a new page' : ''}`);
  let target = page;
  if (plan.newPage) {
    target = page + 1;
    if (!background) {
      background = `${tmp}/${CAPTURE_PREFIX}${stamp}-blank.png`;
      await Native.whitePng(background, size.width, size.height);
    }
    await Sn.insertNotePage(notePath, target, background);
  }
  const elements = [await Sn.newPictureElement(image.path, plan.rect, target)];
  let text: Element | null = null;
  let ink: Element[] = [];
  if (image.ink) {
    ink = await image.ink(plan.rect, size).catch(e => {
      logError('paste: handwriting (pasting the picture without it)', e);
      return [] as Element[];
    });
    for (const e of ink) {
      e.pageNum = target;
    }
    log(`paste: ${ink.length} strokes onto the picture`);
  }
  try {
    if (spec) {
      elements.push(await Sn.newLinkElement(linkUnder(spec, plan.rect, size), target));
    }
    if (caption) {
      const c = captionUnder(caption, plan.rect, size);
      text = await Sn.newTextElement(c.text, c.fontSize, c.rect, target).catch(e => {
        logError('paste: caption', e);
        return null;
      });
    }
    const extras = [...ink, ...(text ? [text] : [])];
    try {
      await Sn.insertElements(notePath, target, [elements[0], ...ink, ...elements.slice(1), ...(text ? [text] : [])]);
    } catch (e) {
      if (!extras.length) {
        throw e;
      }
      logError(`paste: insert with ${ink.length} strokes${text ? ' and the caption' : ''} (pasting without them)`, e);
      await Sn.insertElements(notePath, target, elements);
      if (ink.length) {
        toast('Pasted, but your handwriting could not be added.', true);
      }
    }
  } finally {
    Sn.recycle([...elements, ...ink, ...(text ? [text] : [])]);
  }
  await reloadAndShow(plan.newPage ? target : null);
  return { page: target, newPage: plan.newPage };
}

/** The note NOTE has open, once PluginHost talks to NOTE (from DOC it answers for the document a moment longer). */
async function openNotePath(): Promise<string> {
  const t0 = Date.now();
  for (;;) {
    const path = await Sn.currentFilePath().catch(e => {
      const code = errorCode(e);
      if (code !== CODE_NOTE_NOT_READY && code !== CODE_NOT_ALLOWED_HERE) {
        throw e;
      }
      return null;
    });
    if (path && /\.note$/i.test(path)) {
      return path;
    }
    if (Date.now() - t0 > READY_TIMEOUT_MS) {
      throw new UserFacingError('Open the note to paste into, then snap again.');
    }
    await Native.sleep(READY_RETRY_MS);
  }
}

/** Fallback: the link just under the picture insertImage placed (found after saving the note), or at the page bottom. */
async function addLinkUnderPicture(notePath: string, page: number, doc: DocPage): Promise<boolean> {
  try {
    const size = await Sn.pageSize(notePath, page);
    let spec = backlinkSpec(doc.docPath, docTitle(doc.docPath), doc.page, size);
    try {
      await Sn.saveOpenNote();
      const elements = await Sn.pageElements(notePath, page);
      const pictures = elements.filter(e => e.type === TYPE_PICTURE && e.picture?.rect);
      const pasted = pictures[pictures.length - 1]?.picture?.rect;
      Sn.recycle(elements);
      if (pasted) {
        spec = linkUnder(spec, pasted, size);
      }
    } catch (e) {
      logError('find the pasted picture (link at the page bottom)', e);
    }
    await Sn.insertTextLink(spec);
    return true;
  } catch (e) {
    logError('add the link under the pasted picture', e);
    return false;
  }
}

/**
 * A document's last page: its ink can only be read with NOTE in front (R80). Open the new note (it is
 * already open with "Open the snap"), read the ink, write it into the snap's page and make NOTE reload
 * it; for "Stay here", go back to the page afterwards. In the Snaps inbox the snap is the last page
 * (snaps are always appended).
 */
async function addLateInk(notePath: string, d: Delivery, settings: Settings): Promise<void> {
  if (!d.lateInk) {
    return;
  }
  const stay = settings.afterSnap === 'stay';
  const inInbox = samePath(notePath, inboxPath(settings));
  const page = inInbox ? Math.max(0, (await Sn.noteTotalPages(notePath).catch(() => 1)) - 1) : 0;
  if (stay) {
    await Sn.openFile(notePath, page);
  }
  await waitUntilCurrent(notePath);
  const ink = await d.lateInk().catch(e => {
    logError('read the last page\'s handwriting in Notes (snapping without it)', e);
    return [] as Element[];
  });
  try {
    if (ink.length) {
      for (const e of ink) {
        e.pageNum = page;
      }
      await Sn.saveOpenNote().catch(e => logError('save before adding ink', e));
      await Sn.insertElements(notePath, page, ink);
    }
    log(`late ink: ${ink.length} strokes into ${baseName(notePath)} page ${page + 1}`);
  } catch (e) {
    logError('add the last page\'s handwriting', e);
    toast('Snapped, but your handwriting could not be copied.', true);
  } finally {
    Sn.recycle(ink);
  }
  await ensureStillCurrent(notePath);
  await reloadAndShow(stay || !inInbox ? null : page);
  if (stay && d.doc) {
    await Sn.openFile(d.doc.docPath, d.doc.page);
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
  const known = [lastNote, inboxPath(settings), nativeHopPath(), hopNotePath()].filter((p): p is string => p !== null);
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
export async function whenNoteReady<T>(task: () => Promise<T>): Promise<T> {
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
