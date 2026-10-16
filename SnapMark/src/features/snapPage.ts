// "Snap page" (DOC toolbar, showType 0): turn the current document page into a new note you can
// write on, with your existing handwriting copied over and a link back to the page.
//
// Why it looks like this (SPIKES.md): createNote is refused while DOC is on top (R1), and copies of a
// note share its FILE_ID (R49). So the page is rendered in DOC, a unique blank from the private pool
// is copied to the snap's path and opened, and once NOTE is in front (R37, waited for without timers,
// R34) the render becomes its page via insertNotePage, with handwriting and backlink added at file
// level. Only the snap itself appears in Recent Files (R46, R47). With an empty pool (first snap) a
// helper note brings NOTE forward instead, and the pool is filled for next time.

import type { Element } from 'sn-plugin-lib';
import { backlinkSpec, type Size } from '../core/backlink';
import {
  COLOR_DARK_GRAY,
  PEN_MARKER,
  PEN_TECHNICAL,
  UNDERLINE_PRESSURE,
  UNDERLINE_THICKNESS,
  underlinePoints,
  type HighlightStyle,
} from '../core/highlights';
import {
  docTitle,
  formatStamp,
  hopNotePath,
  isDocumentPath,
  parentDir,
  snapNoteCandidates,
  tmpDir,
  tmpRenderPath,
} from '../core/paths';
import { marginLayout, scalePoints, scaleThickness, type MarginLayout } from '../core/margin';
import { inboxPath, snapsDir, type Settings } from '../core/settings';
import { StepTimer } from '../core/timer';
import { blankNoteAssetPath } from '../platform/assets';
import { log, logError } from '../platform/log';
import { screenSizePx } from '../platform/screen';
import { toast } from '../platform/toast';
import { CODE_PAGE_NOT_FOUND, errorCode, UserFacingError } from '../sdk/errors';
import { fs } from '../sdk/fs';
import { Sn } from '../sdk/sn';
import { waitUntilCurrent } from '../sdk/wait';
import { assertUnlocked, firstFreePath } from './files';
import { appendToOpenInbox, reloadAndShow } from './inbox';
import { BLANK_TEMPLATE, pooledBlank, refillPool } from './pool';

const TYPE_STROKE = 0;
const TYPE_GEOMETRY = 700;

interface Snap {
  notePath: string;
  docPath: string;
  title: string;
  page: number;
  pageSize: Size;
  render: string;
  handwriting: Element[];
}

export async function snapPage(settings: Settings): Promise<void> {
  const t = new StepTimer();
  toast('Snapping…');

  const [docPath, page, pluginDir] = await Promise.all([Sn.currentFilePath(), Sn.currentPage(), Sn.pluginDir()]);
  if (!isDocumentPath(docPath)) {
    throw new UserFacingError('Open a document to snap a page.');
  }
  // DOC reports the page as displayed, which matches the note page on the same device (R3, R16).
  const pageSize = await documentPageSize(docPath, page);
  const inbox = inboxPath(settings);
  const appendToInbox = settings.collect && (await fs.exists(inbox));
  const margin = !settings.collect && settings.marginPercent > 0 ? marginLayout(pageSize, settings.marginPercent) : null;
  // Appending: render at the inbox's page size, so a landscape page is letterboxed into it (R11).
  // Margin mode: render at exactly the shrunk size; the picture shows it 1:1.
  const renderSize = appendToInbox ? await Sn.pageSize(inbox, 0) : margin ? margin.imageSize : pageSize;
  t.mark('context');

  const tmp = tmpDir(pluginDir);
  await fs.makeDirs(tmp);
  await clearDir(tmp);
  const render = tmpRenderPath(pluginDir, new Date());
  await Sn.renderDocPage(page, render, renderSize, settings.keepHighlights);
  t.mark('render');

  const handwriting = settings.includeHandwriting ? await readHandwriting(docPath, page, pageSize, settings.highlightStyle) : [];
  try {
    t.mark(`handwriting(${handwriting.length})`);
    const title = docTitle(docPath);
    const dir = settings.collect ? snapsDir(settings) : `${snapsDir(settings)}/${title}`;
    await assertUnlocked(dir);
    await fs.makeDirs(dir);
    // Collect mode without an inbox yet: the normal flows create it as the first snap.
    const notePath = settings.collect ? inbox : await firstFreePath(snapNoteCandidates(dir, title, page, formatStamp(new Date())));
    const isPortrait = renderSize.height >= renderSize.width;
    const blank = appendToInbox || margin ? null : await pooledBlank(pluginDir, isPortrait);
    t.mark('paths');

    const snap: Snap = { notePath, docPath, title, page, pageSize, render, handwriting };
    const stay = settings.afterSnap === 'stay';
    let linked: boolean;
    let where: string;
    try {
      if (appendToInbox) {
        const r = await viaInbox(snap, pluginDir, stay, t);
        linked = r.linked;
        where = `Snaps inbox, page ${r.notePage + 1}`;
      } else if (margin) {
        linked = await viaMargin(snap, margin, pluginDir, isPortrait, !stay, t);
        where = title;
      } else {
        linked = blank ? await viaOpenedSnap(snap, blank, pluginDir, stay, t) : await viaHelperNote(snap, pluginDir, isPortrait, !stay, t);
        where = settings.collect ? 'Snaps inbox' : title;
      }
    } catch (e) {
      // Leave the user on their document, not on a helper or half-made note.
      await Sn.openFile(docPath, page).catch(() => undefined);
      throw e;
    }

    const how = appendToInbox ? 'inbox' : margin ? `margin ${settings.marginPercent}%` : blank ? 'pool' : 'helper note';
    if (stay) {
      await Sn.openFile(docPath, page);
      t.mark('back');
      log(`snap page ${page + 1} -> ${notePath} (${how}, stay) | ${t.summary()}`);
      toast(linked ? `Snapped p. ${page + 1} → ${where}` : `Snapped p. ${page + 1} → ${where} (no link back)`);
    } else {
      log(`snap page ${page + 1} -> ${notePath} (${how}) | ${t.summary()}`);
      if (!linked) {
        toast('Snap ready, but the link back to the page could not be added.', true);
      }
    }
  } finally {
    Sn.recycle(handwriting);
    await fs.remove(render).catch(() => undefined); // embedded in the note by now (R21)
  }
}

/**
 * getPageSize for a document page: always the screen size (R3). PluginHost can refuse a page DOC is
 * showing (1207, R75); then the screen size is the same answer.
 */
export async function documentPageSize(docPath: string, page: number): Promise<Size> {
  try {
    return await Sn.pageSize(docPath, page);
  } catch (e) {
    if (errorCode(e) !== CODE_PAGE_NOT_FOUND) {
      throw e;
    }
    const total = await Sn.docTotalPages().catch(() => -1);
    const size = screenSizePx();
    log(`getPageSize refused page ${page + 1} (DOC says ${total} pages); using the screen size ${size.width}x${size.height}`);
    return size;
  }
}

/** Collect mode: open the inbox, append the page, add ink + backlink, show it. */
async function viaInbox(snap: Snap, pluginDir: string, stay: boolean, t: StepTimer): Promise<{ linked: boolean; notePage: number }> {
  await Sn.openFile(snap.notePath, -1);
  await waitUntilCurrent(snap.notePath); // NOTE in front: NOTE-only file APIs are allowed now
  t.mark('open');
  const notePage = await appendToOpenInbox(snap.notePath, snap.render);
  const linked = await addHandwritingAndBacklink(snap, notePage);
  t.mark(`page ${notePage + 1}`);
  await refillPool(pluginDir);
  await reloadAndShow(stay ? null : notePage);
  t.mark('show');
  return { linked, notePage };
}

/**
 * Margin mode: the page as a picture at the top-left (exact size, so no scaling), the handwriting
 * scaled to match, and the backlink in the bottom margin, all written into the snap file at file level
 * BEFORE it is opened. A current-page insert right after openFile can land in the note NOTE is still
 * switching away from (R56); a finished file avoids that and needs no reload. With a pooled blank and
 * "stay here", NOTE is never involved.
 */
async function viaMargin(snap: Snap, layout: MarginLayout, pluginDir: string, isPortrait: boolean, open: boolean, t: StepTimer): Promise<boolean> {
  const blank = await pooledBlank(pluginDir, isPortrait);
  if (blank) {
    await fs.copy(blank, snap.notePath);
    await fs.remove(blank); // each blank once: copies keep its FILE_ID (R49)
  } else {
    const hop = await ensureHopNote(pluginDir); // createNote needs NOTE in front (R1)
    await Sn.openFile(hop, 0);
    await waitUntilCurrent(hop);
    await Sn.createNote(snap.notePath, BLANK_TEMPLATE, isPortrait);
    t.mark('hop+createNote');
  }
  const noteSize = await Sn.pageSize(snap.notePath, 0);
  const sameFrame = noteSize.width === snap.pageSize.width && noteSize.height === snap.pageSize.height;
  const picture = await Sn.newPictureElement(snap.render, layout.rect, 0);
  const strokes = sameFrame ? await scaledStrokes(snap.handwriting, layout) : [];
  const link = await Sn.newLinkElement(backlinkSpec(snap.docPath, snap.title, snap.page, noteSize), 0);
  const elements = [picture, ...strokes, link];
  t.mark(`elements(${strokes.length} strokes)`);
  try {
    await Sn.insertElements(snap.notePath, 0, elements); // allowed in DOC too (R23)
    t.mark('insert');
  } finally {
    Sn.recycle(elements);
  }
  if (open) {
    await Sn.openFile(snap.notePath, 0);
    await waitUntilCurrent(snap.notePath);
    t.mark('open');
  }
  if (open || !blank) {
    await refillPool(pluginDir); // only possible with NOTE in front
    t.mark('refill');
  }
  return true;
}

/** New strokes: each doc stroke (or marker underline) scaled and moved into the margin layout. */
async function scaledStrokes(handwriting: ReadonlyArray<Element>, layout: MarginLayout): Promise<Element[]> {
  const out: Element[] = [];
  let skipped = 0;
  for (const e of handwriting) {
    const stroke = e.stroke;
    const count = stroke ? await stroke.points.size() : 0;
    if (!stroke || count < 2) {
      skipped++;
      continue;
    }
    const points = await stroke.points.getRange(0, count);
    const pressures = await stroke.pressures.getRange(0, count).catch(() => null);
    out.push(
      await Sn.newStroke({
        page: 0,
        penType: stroke.penType,
        penColor: stroke.penColor,
        thickness: scaleThickness(e.thickness, layout),
        points: scalePoints(points, layout),
        pressure: pressures && pressures.length === count ? pressures : UNDERLINE_PRESSURE,
      }),
    );
  }
  if (skipped) {
    log(`margin mode: ${skipped} non-stroke element(s) (e.g. shapes) not copied`);
  }
  return out;
}

/** Normal path: open the snap itself, then give it its page from NOTE. */
async function viaOpenedSnap(snap: Snap, blank: string, pluginDir: string, stay: boolean, t: StepTimer): Promise<boolean> {
  await fs.copy(blank, snap.notePath);
  await fs.remove(blank); // each blank once: copies keep its FILE_ID (R49)
  await Sn.openFile(snap.notePath, 0);
  await waitUntilCurrent(snap.notePath); // NOTE in front: NOTE-only file APIs are allowed now
  t.mark('open');
  await Sn.insertNotePage(snap.notePath, 1, snap.render);
  const linked = await addHandwritingAndBacklink(snap, 1);
  await Sn.removeNotePage(snap.notePath, 0);
  t.mark('page');
  await refillPool(pluginDir);
  t.mark('refill');
  if (stay) {
    await reloadAndShow(null); // let NOTE drop its stale copy before we leave
  } else {
    Sn.reloadOpenFile(); // NOTE shows the new page; last, because it may never answer (R48)
  }
  return linked;
}

/** First snap (empty pool): a helper note brings NOTE forward so createNote is allowed. */
async function viaHelperNote(snap: Snap, pluginDir: string, isPortrait: boolean, open: boolean, t: StepTimer): Promise<boolean> {
  const hop = await ensureHopNote(pluginDir);
  await Sn.openFile(hop, 0);
  await waitUntilCurrent(hop);
  t.mark('hop');
  await Sn.createNote(snap.notePath, snap.render, isPortrait);
  const linked = await addHandwritingAndBacklink(snap, 0);
  t.mark('createNote');
  await refillPool(pluginDir); // NOTE is in front: the next snaps skip the helper note
  t.mark('refill');
  if (open) {
    await Sn.openFile(snap.notePath, 0);
    t.mark('open');
  }
  return linked;
}

/**
 * Strokes and shapes on the document page, retargeted to page 0 / main layer of the snap.
 * Marker strokes become underlines (or are dropped): copied as markers they'd hide the text (R41).
 */
export async function readHandwriting(docPath: string, page: number, pageSize: Size, highlights: HighlightStyle): Promise<Element[]> {
  const all = await Sn.pageElements(docPath, page).catch(e => {
    logError('read handwriting (snapping without it)', e);
    return [] as Element[];
  });
  const isMarker = (e: Element) => e.type === TYPE_STROKE && e.stroke?.penType === PEN_MARKER;
  const keep = all.filter(e => (e.type === TYPE_STROKE || e.type === TYPE_GEOMETRY) && !isMarker(e));
  for (const e of keep) {
    e.pageNum = 0;
    e.layerNum = 0;
  }
  const underlines: Element[] = [];
  if (highlights === 'underline') {
    for (const marker of all.filter(isMarker)) {
      const line = await markerToUnderline(marker, pageSize).catch(e => {
        logError('marker -> underline (skipped)', e);
        return null;
      });
      if (line) {
        underlines.push(line);
      }
    }
  }
  Sn.recycle(all.filter(e => !keep.includes(e)));
  return [...underlines, ...keep];
}

async function markerToUnderline(marker: Element, pageSize: Size): Promise<Element | null> {
  const points = marker.stroke?.points;
  const count = points ? await points.size() : 0;
  if (!points || count < 2) {
    return null;
  }
  return Sn.newStroke({
    page: 0,
    penType: PEN_TECHNICAL,
    penColor: COLOR_DARK_GRAY,
    thickness: UNDERLINE_THICKNESS,
    points: underlinePoints(await points.getRange(0, count), marker.thickness, pageSize.height),
    pressure: UNDERLINE_PRESSURE,
  });
}

/** Onto page `notePage` of the snap. Returns false if the backlink could not be added (the snap is still usable). */
async function addHandwritingAndBacklink(snap: Snap, notePage: number): Promise<boolean> {
  const { notePath, docPath, title, page, pageSize: docPageSize, handwriting } = snap;
  const noteSize = await Sn.pageSize(notePath, notePage);
  // Element coordinates are page pixels; only copy them if both pages share the same frame.
  const sameFrame = noteSize.width === docPageSize.width && noteSize.height === docPageSize.height;
  if (handwriting.length && !sameFrame) {
    log(`note page ${noteSize.width}x${noteSize.height} != doc page ${docPageSize.width}x${docPageSize.height}; handwriting not copied`);
  }
  for (const e of handwriting) {
    e.pageNum = notePage;
  }
  const link = await Sn.newLinkElement(backlinkSpec(docPath, title, page, noteSize), notePage);
  try {
    const withHandwriting = sameFrame ? [...handwriting, link] : [link];
    try {
      await Sn.insertElements(notePath, notePage, withHandwriting);
      return true;
    } catch (e) {
      if (withHandwriting.length === 1) {
        throw e;
      }
      logError('insert handwriting + link (retrying link only)', e);
      await Sn.insertElements(notePath, notePage, [link]);
      return true;
    }
  } catch (e) {
    logError('insert backlink', e);
    return false;
  } finally {
    Sn.recycle([link]);
  }
}

/** The helper note is a copy of the bundled blank (it is never written to, so its shared FILE_ID is harmless). */
async function ensureHopNote(pluginDir: string): Promise<string> {
  const hop = hopNotePath();
  if (!(await fs.exists(hop))) {
    await fs.makeDirs(parentDir(hop));
    await fs.copy(blankNoteAssetPath(pluginDir), hop);
  }
  return hop;
}

/** Leftovers from an interrupted snap. */
async function clearDir(dir: string): Promise<void> {
  for (const path of await fs.list(dir)) {
    await fs.remove(path).catch(() => undefined);
  }
}
