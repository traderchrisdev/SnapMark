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
import { backlinkSpec, backlinkSpecTop, linkZone, stripShrink, type Size, type TextLinkSpec } from '../core/backlink';
import {
  COLOR_DARK_GRAY,
  isLineHighlight,
  LINE_BOTTOM_SEARCH_PX,
  LINE_HIGHLIGHT_SLACK,
  SAME_LINE_PX,
  alignSameLine,
  markerBand,
  PEN_MARKER,
  PEN_TECHNICAL,
  UNDERLINE_PRESSURE,
  UNDERLINE_THICKNESS,
  underlinePoints,
  underlineUnderText,
  type HighlightStyle,
  type Point,
} from '../core/highlights';
import {
  docTitle,
  formatStamp,
  hopNotePath,
  isDocumentPath,
  nativeHopPath,
  parentDir,
  snapNoteCandidates,
  tmpDir,
  tmpRenderPath,
} from '../core/paths';
import { PixelRatio } from 'react-native';
import { fitInsetsDp } from '../core/fit';
import { docFrames, inNote, uprightView, viewedAs, widthView, fitLayout, isIdentity, marginLayout, scalePoints, scaleThickness, type DocFrames, type MarginLayout } from '../core/margin';
import { insetsToPx } from '../core/region';
import { collects, inboxPath, snapsDir, type Settings } from '../core/settings';
import { StepTimer } from '../core/timer';
import { blankNoteAssetPath } from '../platform/assets';
import { log, logError } from '../platform/log';
import { Native, type TextBand } from '../platform/native';
import { uprightScreenPx } from '../platform/screen';
import { toast } from '../platform/toast';
import { CODE_PAGE_NOT_FOUND, errorCode, UserFacingError } from '../sdk/errors';
import { fs } from '../sdk/fs';
import { Sn } from '../sdk/sn';
import { ensureStillCurrent, waitUntilCurrent } from '../sdk/wait';
import { assertUnlocked, firstFreePath } from './files';
import { appendToOpenInbox, quietReload, reloadAndShow } from './inbox';
import { BLANK_TEMPLATE, pooledBlank, refillPool } from './pool';

const TYPE_STROKE = 0;
const TYPE_GEOMETRY = 700;

interface Snap {
  notePath: string;
  docPath: string;
  title: string;
  page: number;
  /** The document page's size: the frame the handwriting is in. */
  pageSize: Size;
  render: string;
  /** Ink and underlines in document-page px; null: read them once NOTE is in front (R80). */
  handwriting: Element[] | null;
  highlightStyle: HighlightStyle;
  /** Ink px -> render px (identity unless landscape, letterboxed into the inbox or shrunk for the link). */
  inkLayout: MarginLayout;
  /** Ink px -> document page px (identity unless the page is wider than the screen, R81). */
  inkFrame: MarginLayout;
  /** The frame the ink's points are in (the screen, or sideways for a landscape page). */
  inkSize: Size;
  /** Where the backlink goes, in render px (bottom-left, or top-right when the bottom holds text, R79). */
  link: TextLinkSpec;
  renderSize: Size;
}

/** Dark pixels in a link's spot before it counts as text rather than a blank margin. */
const ZONE_INK_LIMIT = 40;

/** Highlights read from the page, before they become underlines. */
export interface Handwriting {
  strokes: Element[];
  markers: Element[];
}

export async function snapPage(settings: Settings): Promise<void> {
  const t = new StepTimer();
  toast('Snapping…');

  const [docPath, page, pluginDir] = await Promise.all([Sn.currentFilePath(), Sn.currentPage(), Sn.pluginDir()]);
  if (!isDocumentPath(docPath)) {
    throw new UserFacingError('Open a document to snap a page.');
  }
  // DOC reports the page as displayed, which matches the note page on the same device (R3, R16).
  const lastPage = await isLastPage(page);
  const pageSize = await documentPageSize(docPath, page, lastPage);
  // A page wider than the screen keeps its ink in a sideways frame (R81).
  const frames = await docFramesOf(docPath, page, pageSize);
  const inkFrame = frames.inkToRender;
  const inkSize = frames.inkSize;
  const inbox = inboxPath(settings);
  const appendToInbox = collects(settings) && (await fs.exists(inbox));
  const margin =
    !collects(settings) && settings.marginPercent > 0
      ? marginLayout(pageSize, settings.marginPercent, insetsToPx(fitInsetsDp(settings.screenshotFit), PixelRatio.get()))
      : null;
  // Appending: render at the inbox's page size, so a landscape page is letterboxed into it (R11).
  // Margin mode: render at exactly the shrunk size; the picture shows it 1:1.
  const renderSize = appendToInbox ? await Sn.pageSize(inbox, 0) : margin ? margin.imageSize : pageSize;
  t.mark('context');

  const tmp = tmpDir(pluginDir);
  await fs.makeDirs(tmp);
  await clearDir(tmp);
  let render = tmpRenderPath(pluginDir, new Date());
  await Sn.renderDocPage(page, render, renderSize, settings.keepHighlights);
  await normalizeRender(render, renderSize, frames);
  t.mark('render');

  // Ink px -> render px: the ink's frame onto the page (R81), then the page onto the render.
  const pageToRender = appendToInbox
    ? fitLayout(pageSize, renderSize)
    : margin
      ? { scale: margin.scale, imageSize: margin.imageSize, rect: { left: 0, top: 0, right: margin.imageSize.width, bottom: margin.imageSize.height } }
      : fitLayout(pageSize, pageSize);
  let inkLayout: MarginLayout = composeLayouts(inkFrame, pageToRender);
  // Ink read later with NOTE in front is upright even on a sideways screen (R83).
  const noteFrames = inNote(frames);
  let noteInkLayout: MarginLayout = composeLayouts(noteFrames.inkToRender, pageToRender);
  let link = backlinkSpec(docPath, docTitle(docPath), page, renderSize);
  // Where the link goes: bottom-left if blank, else top-right if blank, else a strip under the page (R79).
  const topLink = backlinkSpecTop(docPath, docTitle(docPath), page, renderSize);
  const zones = margin ? [] : [linkZone(link), linkZone(topLink)];
  const report = Native.available && zones.length ? await Native.inspectRender(render, [], zones) : null;
  if (report) {
    const [inkBottom, inkTop] = report.zoneInk;
    if (inkBottom > ZONE_INK_LIMIT && inkTop <= ZONE_INK_LIMIT) {
      link = topLink;
    } else if (inkBottom > ZONE_INK_LIMIT) {
      const shrink = stripShrink(renderSize, link);
      const strip = fitLayout(renderSize, renderSize, shrink);
      const shrunk = `${tmp}/render-strip.png`;
      await Native.cropInto(render, shrunk, { left: 0, top: 0, right: renderSize.width, bottom: renderSize.height }, strip.rect);
      await fs.remove(render).catch(() => undefined);
      render = shrunk;
      inkLayout = composeLayouts(inkLayout, strip);
      noteInkLayout = composeLayouts(noteInkLayout, strip);
    }
    const where = link === topLink ? 'top-right' : inkBottom > ZONE_INK_LIMIT ? `bottom, page shrunk to ${inkLayout.scale.toFixed(3)}` : 'bottom';
    log(`snap page: link ${where} (dark px at bottom ${inkBottom}, top ${inkTop})`);
  }
  // The ink, read now in DOC; on a document's last page DOC refuses (R80), so NOTE reads it later.
  let handwriting: Element[] | null = [];
  if (settings.includeHandwriting) {
    if (lastPage || frames.rotated) {
      // DOC refuses the last page (R80); sideways it reports the ink in a frame that differs by device
      // and moment (R83). NOTE reads it right, upright, in both cases.
      handwriting = null;
      log(`snap page: ${lastPage ? 'last page of the document (R80)' : 'sideways screen (R83)'}; reading the ink once Notes is in front`);
    } else {
      try {
        handwriting = await buildInk(docPath, page, inkSize, render, inkLayout, settings.highlightStyle);
      } catch (e) {
        if (errorCode(e) === CODE_PAGE_NOT_FOUND) {
          handwriting = null;
          log('snap page: DOC refused the ink; reading it once Notes is in front (R80)');
        } else {
          logError('read handwriting (snapping without it)', e);
        }
      }
    }
  }
  try {
    t.mark(`handwriting(${handwriting === null ? 'later' : handwriting.length})`);
    const title = docTitle(docPath);
    const dir = collects(settings) ? snapsDir(settings) : `${snapsDir(settings)}/${title}`;
    await assertUnlocked(dir);
    await fs.makeDirs(dir);
    // Collect mode without an inbox yet: the normal flows create it as the first snap.
    const notePath = collects(settings) ? inbox : await firstFreePath(snapNoteCandidates(dir, title, page, formatStamp(new Date())));
    const isPortrait = renderSize.height >= renderSize.width;
    const blank = appendToInbox || margin ? null : await pooledBlank(pluginDir, isPortrait);
    t.mark('paths');

    const late = handwriting === null;
    const snap: Snap = {
      notePath,
      docPath,
      title,
      page,
      pageSize,
      render,
      handwriting,
      highlightStyle: settings.highlightStyle,
      inkLayout: late ? noteInkLayout : inkLayout,
      inkFrame: late ? noteFrames.inkToRender : inkFrame,
      inkSize: late ? noteFrames.inkSize : inkSize,
      link,
      renderSize,
    };
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
        where = collects(settings) ? 'Snaps inbox' : title;
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
    if (handwriting) {
      Sn.recycle(handwriting);
    }
    await fs.remove(render).catch(() => undefined); // embedded in the note by now (R21)
  }
}

/**
 * getPageSize for a document page: always the screen size (R3). PluginHost can refuse a page DOC is
 * showing (1207, R75); then the screen size is the same answer.
 */
export async function documentPageSize(docPath: string, page: number, lastPage = false): Promise<Size> {
  if (lastPage) {
    // DOC refuses the last page (R75, R80) and may show "Note Not Found"; the answer is the screen
    // size, upright even on a sideways screen (R83).
    return uprightScreenPx();
  }
  try {
    return await Sn.pageSize(docPath, page);
  } catch (e) {
    if (errorCode(e) !== CODE_PAGE_NOT_FOUND) {
      throw e;
    }
    const total = await Sn.docTotalPages().catch(() => -1);
    const size = uprightScreenPx();
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
  await ensureStillCurrent(snap.notePath);
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
  // Last page: NOTE has to be in front to read the ink (R80). The hop path already has it there; with a
  // pooled blank, open the snap first and edit it in place (then NOTE reloads it, R52).
  const late = snap.handwriting === null;
  let opened = false;
  if (late && blank) {
    await Sn.openFile(snap.notePath, 0);
    await waitUntilCurrent(snap.notePath);
    opened = true;
    t.mark('open');
  }
  let ink: Element[] = snap.handwriting ?? [];
  if (late) {
    ink = await buildInk(snap.docPath, snap.page, snap.inkSize, snap.render, snap.inkLayout, snap.highlightStyle).catch(e => {
      logError('read the last page\'s handwriting in Notes (snapping without it)', e);
      return [] as Element[];
    });
  }
  const noteSize = await Sn.pageSize(snap.notePath, 0);
  const sameFrame = noteSize.width === snap.pageSize.width && noteSize.height === snap.pageSize.height;
  const picture = await Sn.newPictureElement(snap.render, layout.rect, 0);
  const strokes = sameFrame ? await scaledStrokes(ink, composeLayouts(snap.inkFrame, layout), snap.inkSize, noteSize) : [];
  if (late) {
    Sn.recycle(ink);
  }
  const link = await Sn.newLinkElement(backlinkSpec(snap.docPath, snap.title, snap.page, noteSize), 0);
  const elements = [picture, ...strokes, link];
  t.mark(`elements(${strokes.length} strokes)`);
  try {
    await Sn.insertElements(snap.notePath, 0, elements); // allowed in DOC too (R23)
    t.mark('insert');
  } finally {
    Sn.recycle(elements);
  }
  if (opened) {
    await ensureStillCurrent(snap.notePath);
    await reloadAndShow(null); // NOTE shows the finished page (and drops its stale copy if we leave)
    t.mark('reload');
  } else if (open) {
    await Sn.openFile(snap.notePath, 0);
    await waitUntilCurrent(snap.notePath);
    t.mark('open');
  }
  if (open || opened || !blank) {
    await refillPool(pluginDir); // only possible with NOTE in front
    t.mark('refill');
  }
  return true;
}

/** New strokes: each doc stroke (or marker underline) scaled and moved into the margin layout. */
async function scaledStrokes(handwriting: ReadonlyArray<Element>, layout: MarginLayout, fromSize: Size, toSize: Size): Promise<Element[]> {
  const out: Element[] = [];
  let skipped = 0;
  for (const e of handwriting) {
    const stroke = e.stroke;
    const count = stroke ? await stroke.points.size() : 0;
    if (!stroke || count < 2) {
      skipped++;
      continue;
    }
    const points = await Sn.strokePoints(stroke, count, fromSize);
    const pressures = await stroke.pressures.getRange(0, count).catch(() => null);
    out.push(
      await Sn.newStroke({
        page: 0,
        pageSize: toSize,
        penType: stroke.penType,
        penColor: stroke.penColor,
        thickness: scaleThickness(e.thickness, layout),
        points: scalePoints(points, layout),
        pressure: pressures && pressures.length === count ? pressures : UNDERLINE_PRESSURE,
      }),
    );
  }
  if (skipped && !isIdentity(layout)) {
    log(`${skipped} non-stroke element(s) (e.g. shapes) not copied: the page was moved or scaled`);
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
  // The rendered page goes in front and the blank is removed behind it: NOTE reloads the current
  // page by itself after each edit, so it shows the finished page even before our reload (R78).
  await Sn.insertNotePage(snap.notePath, 0, snap.render);
  const linked = await addHandwritingAndBacklink(snap, 0);
  await Sn.removeNotePage(snap.notePath, 1);
  t.mark('page');
  await refillPool(pluginDir);
  t.mark('refill');
  await ensureStillCurrent(snap.notePath);
  if (stay) {
    await reloadAndShow(null); // let NOTE drop its stale copy before we leave
  } else {
    await quietReload(); // NOTE picks up the page count; it may never answer (R48)
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
 * The page's handwriting (strokes and shapes) and, when highlights are wanted, its marker strokes,
 * still raw: see markerInfos/underlinesFrom. The caller recycles both lists.
 */
export async function readHandwriting(docPath: string, page: number, highlights: HighlightStyle): Promise<Handwriting> {
  const all = await Sn.pageElements(docPath, page);
  const isMarker = (e: Element) => e.type === TYPE_STROKE && e.stroke?.penType === PEN_MARKER;
  const strokes = all.filter(e => (e.type === TYPE_STROKE || e.type === TYPE_GEOMETRY) && !isMarker(e));
  const markers = highlights === 'underline' ? all.filter(isMarker) : [];
  for (const e of strokes) {
    e.pageNum = 0;
    e.layerNum = 0;
  }
  Sn.recycle(all.filter(e => !strokes.includes(e) && !markers.includes(e)));
  return { strokes, markers };
}

/**
 * The page's ink as elements in document-page px: strokes and shapes as they are, each marker as an
 * underline just under the text line it covers in `render` (whose px map from the page by `layout`).
 * Throws what getElements throws (1207 on a document's last page in DOC, R80).
 */
async function buildInk(docPath: string, page: number, pageSize: Size, render: string, layout: MarginLayout, style: HighlightStyle): Promise<Element[]> {
  const read = await readHandwriting(docPath, page, style);
  try {
    const infos = await markerInfos(read.markers, pageSize);
    const bands: TextBand[] = infos.map(i => {
      const [l, r] = scalePoints([{ x: i.band.left, y: i.band.y }, { x: i.band.right, y: i.band.y }], layout);
      return { left: l.x, right: r.x, y: l.y, maxDy: Math.round(LINE_BOTTOM_SEARCH_PX * layout.scale) };
    });
    const report = Native.available && bands.length ? await Native.inspectRender(render, bands, []).catch(() => null) : null;
    const bottoms = report
      ? alignSameLine(report.lineBottoms.map(y => (y < 0 ? -1 : Math.round((y - layout.rect.top) / layout.scale))), SAME_LINE_PX / layout.scale)
      : null;
    const underlines = await underlinesFrom(infos, pageSize, bottoms);
    if (infos.length) {
      log(`snap page: ${infos.length} marker(s) -> ${underlines.length} underline(s); line bottoms ${JSON.stringify(bottoms)}; thickness ${infos.map(i => i.thickness).join(',')}`);
    }
    return [...underlines, ...read.strokes];
  } finally {
    Sn.recycle(read.markers);
  }
}

/**
 * The page's frames: only a PDF page wider than the screen (R81), or a document on a device turned
 * sideways (R83), differs from the screen itself.
 */
export async function docFramesOf(docPath: string, page: number, pageSize: Size): Promise<DocFrames> {
  const isPdf = /\.pdf$/i.test(docPath);
  const pdf = isPdf && Native.available ? await Native.pdfPageSize(docPath, page).catch(e => {
    logError('PDF page size (assuming a portrait page)', e);
    return null;
  }) : null;
  // An EPUB keeps its upright layout on a sideways screen: a page the size of the screen (R83).
  const frames = docFrames(pdf, pageSize, await isSideways());
  if (frames.rotated) {
    log(`page ${page + 1}${pdf ? ` is ${pdf.width}x${pdf.height} pt,` : ''} shown on a sideways screen; ink frame ${frames.inkSize.width}x${frames.inkSize.height}, to the render x${frames.inkToRender.scale.toFixed(4)} +${frames.inkToRender.rect.left},${frames.inkToRender.rect.top}`);
  } else if (frames.landscape && pdf) {
    log(`page ${page + 1} is ${pdf.width}x${pdf.height} pt: landscape; ink frame ${frames.inkSize.width}x${frames.inkSize.height}, to the render x${frames.inkToRender.scale.toFixed(4)} +${frames.inkToRender.rect.left},${frames.inkToRender.rect.top}`);
  }
  return frames;
}

/**
 * DOC renders a landscape page as a landscape image whatever size it is asked for (R81). Letterbox it
 * into the asked size, so the render is in the frame everything else assumes (the page fitted and
 * centred). No-op for any other page.
 */
export async function normalizeRender(render: string, size: Size, frames: DocFrames): Promise<void> {
  if ((!frames.landscape && !frames.rotated) || !Native.available) {
    return;
  }
  const got = await Native.imageSize(render).catch(() => null);
  if (got && (got.width !== size.width || got.height !== size.height)) {
    const fitted = `${render}.fit.png`;
    await Native.letterbox(render, fitted, size.width, size.height);
    await fs.copy(fitted, render).catch(async () => {
      await fs.remove(render).catch(() => undefined);
      await fs.copy(fitted, render);
    });
    await fs.remove(fitted).catch(() => undefined);
    log(`${got.width}x${got.height} render letterboxed into ${size.width}x${size.height}`);
  }
}

/**
 * On a sideways screen DOC shows the page upright or zoomed to the width, scrolled (R83): the frames
 * for whichever, at whatever scroll, lines the screen capture up best with the render. Unchanged
 * (upright, at the top) when the search fails.
 */
export async function scrolledView(frames: DocFrames, capture: string, render: string): Promise<DocFrames> {
  if (!frames.rotated || !Native.available) {
    return frames;
  }
  const v = frames.view;
  const band = { x0: Math.round(v.width * 0.1), x1: Math.round(v.width * 0.9), y0: Math.round(v.height * 0.04), y1: Math.round(v.height * 0.92) };
  const upright = uprightView(0);
  const zoomed = widthView(frames, 0);
  const pageHeight = frames.inkToRender.imageSize.height + frames.inkToRender.rect.top;
  try {
    const [a, b] = await Promise.all([
      Native.findScroll(capture, render, { ...upright, ...band, maxScroll: Math.max(0, pageHeight - v.height) }),
      Native.findScroll(capture, render, { ...zoomed, ...band, maxScroll: Math.max(0, frames.inkSize.height - v.height) }),
    ]);
    const useZoomed = b.score < a.score;
    log(`sideways screen: upright, scrolled ${a.scroll} px: ${a.score.toFixed(4)}; zoomed to the width, scrolled ${b.scroll} px: ${b.score.toFixed(4)} -> ${useZoomed ? 'zoomed' : 'upright'}`);
    return viewedAs(frames, useZoomed ? widthView(frames, b.scroll) : uprightView(a.scroll));
  } catch (e) {
    logError('sideways screen: finding the view (assuming upright, at the top)', e);
    return frames;
  }
}

/** True when the device is turned sideways (R83; React's screen size flips mid-snap, the display's doesn't). */
export async function isSideways(): Promise<boolean> {
  return Native.available ? (await Native.displayRotation().catch(() => 0)) % 2 === 1 : false;
}

/** True when `page` (0-based) is the open document's last page, which DOC refuses some calls for (R80). */
export async function isLastPage(page: number): Promise<boolean> {
  const total = await Sn.docTotalPages().catch(() => -1);
  return total > 0 && page === total - 1;
}

/** A marker's points in page px, its thickness and its band (x-extent and centre row). */
export interface MarkerInfo {
  points: Point[];
  thickness: number;
  band: { left: number; right: number; y: number };
}

export async function markerInfos(markers: ReadonlyArray<Element>, pageSize: Size): Promise<MarkerInfo[]> {
  const out: MarkerInfo[] = [];
  for (const marker of markers) {
    const stroke = marker.stroke;
    const count = stroke ? await stroke.points.size() : 0;
    if (!stroke || count < 2) {
      continue;
    }
    const points = await Sn.strokePoints(stroke, count, pageSize);
    out.push({ points, thickness: marker.thickness, band: markerBand(points) });
  }
  return out;
}

/**
 * Each marker as a thin underline (new strokes in page px; the caller recycles them). With
 * `lineBottoms` (from the render, Native.inspectRender) a single-line highlight is underlined just
 * under its text; otherwise, or when the render had no text there, the thickness-based offset is used.
 */
export async function underlinesFrom(infos: ReadonlyArray<MarkerInfo>, pageSize: Size, lineBottoms: ReadonlyArray<number> | null): Promise<Element[]> {
  const out: Element[] = [];
  for (const [i, info] of infos.entries()) {
    const bottom = lineBottoms?.[i] ?? -1;
    const points =
      bottom >= 0 && isLineHighlight(info.points, info.thickness, LINE_HIGHLIGHT_SLACK)
        ? underlineUnderText(info.points, bottom, pageSize.height)
        : underlinePoints(info.points, info.thickness, pageSize.height);
    try {
      out.push(
        await Sn.newStroke({
          page: 0,
          pageSize,
          penType: PEN_TECHNICAL,
          penColor: COLOR_DARK_GRAY,
          thickness: UNDERLINE_THICKNESS,
          points,
          pressure: UNDERLINE_PRESSURE,
        }),
      );
    } catch (e) {
      logError('marker -> underline (skipped)', e);
    }
  }
  return out;
}

/** inner first, then outer (both as page-px transforms). */
export function composeLayouts(inner: MarginLayout, outer: MarginLayout): MarginLayout {
  const scale = inner.scale * outer.scale;
  const left = Math.round(outer.rect.left + inner.rect.left * outer.scale);
  const top = Math.round(outer.rect.top + inner.rect.top * outer.scale);
  const imageSize = { width: Math.round(inner.imageSize.width * outer.scale), height: Math.round(inner.imageSize.height * outer.scale) };
  return { scale, imageSize, rect: { left, top, right: left + imageSize.width, bottom: top + imageSize.height } };
}


/**
 * Onto page `notePage` of the snap: the ink as new strokes placed where the render went (so it never
 * depends on the frames matching, R79), shapes as they are when nothing moved, and the backlink.
 * Returns false if the backlink could not be added (the snap is still usable).
 */
async function addHandwritingAndBacklink(snap: Snap, notePage: number): Promise<boolean> {
  const { notePath, renderSize } = snap;
  let handwriting = snap.handwriting;
  let late: Element[] = [];
  if (handwriting === null) {
    // NOTE is in front now and reads the document's ink itself, last page included (R80).
    late = await buildInk(snap.docPath, snap.page, snap.inkSize, snap.render, snap.inkLayout, snap.highlightStyle).catch(e => {
      logError('read the last page\'s handwriting in Notes (snapping without it)', e);
      return [] as Element[];
    });
    handwriting = late;
  }
  const noteSize = await Sn.pageSize(notePath, notePage);
  let layout = snap.inkLayout;
  let link = snap.link;
  if (noteSize.width !== renderSize.width || noteSize.height !== renderSize.height) {
    // A template is drawn unscaled and centred on a page of another size (R38): follow it.
    const dx = Math.round((noteSize.width - renderSize.width) / 2);
    const dy = Math.round((noteSize.height - renderSize.height) / 2);
    log(`note page ${noteSize.width}x${noteSize.height} != render ${renderSize.width}x${renderSize.height}; ink moved by ${dx},${dy}`);
    layout = composeLayouts(layout, { scale: 1, imageSize: renderSize, rect: { left: dx, top: dy, right: dx + renderSize.width, bottom: dy + renderSize.height } });
    link = backlinkSpec(snap.docPath, snap.title, snap.page, noteSize);
  }
  const strokes = await scaledStrokes(handwriting, layout, snap.inkSize, noteSize);
  const shapes = isIdentity(layout) ? handwriting.filter(e => e.type === TYPE_GEOMETRY) : [];
  for (const e of [...strokes, ...shapes]) {
    e.pageNum = notePage;
  }
  const linkEl = await Sn.newLinkElement(link, notePage);
  try {
    const all = [...strokes, ...shapes, linkEl];
    try {
      await Sn.insertElements(notePath, notePage, all);
      log(`snap page: inserted ${strokes.length} strokes, ${shapes.length} shapes and the link`);
      return true;
    } catch (e) {
      if (all.length === 1) {
        throw e;
      }
      logError(`insert ${strokes.length} strokes + ${shapes.length} shapes + link (retrying link only)`, e);
      await Sn.insertElements(notePath, notePage, [linkEl]);
      toast('Snapped, but your handwriting could not be copied.', true);
      return true;
    }
  } catch (e) {
    logError('insert backlink', e);
    return false;
  } finally {
    Sn.recycle([...strokes, linkEl, ...late]);
  }
}

/** The helper note is a copy of the bundled blank (it is never written to, so its shared FILE_ID is harmless). */
async function ensureHopNote(pluginDir: string): Promise<string> {
  // A blank made on this device by createNote, once one exists (the bundled one is a Manta's, R79).
  if (await fs.exists(nativeHopPath())) {
    return nativeHopPath();
  }
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
