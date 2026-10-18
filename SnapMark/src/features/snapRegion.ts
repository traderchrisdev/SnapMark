// "Snap region" (DOC toolbar, showType 0): drag a box over part of the page. It becomes a note with the
// page cut to the box at the top (enlarged up to 2x), your ink inside it as strokes you can still edit,
// and the "↩ <Book>, p. N" link back. "Whole page" on the region screen does a normal Snap page.
// The floating button lands here too when it's tapped in a document (features/bubble).
//
// The region screen shows a capture of the screen (instant; it has your ink). While you draw, the clean
// page is rendered and your ink read from DOC behind the screen (the render takes ~2 s), and
// the cut comes from that render, so the ink isn't in the picture twice. The page fills the screen in
// DOC, so screen and page coordinates match (R3, R16).

import type { Element } from 'sn-plugin-lib';
import type { Rect, Size } from '../core/backlink';
import { LINE_BOTTOM_SEARCH_PX, UNDERLINE_PRESSURE } from '../core/highlights';
import { scalePoints, scaleThicknessBy, type DocFrames, type MarginLayout } from '../core/margin';
import { isDocumentPath, tmpDir } from '../core/paths';
import { captureToPage, mapToRegion, mostlyInside, regionScale } from '../core/region';
import { fitInsetsDp } from '../core/fit';
import type { Settings } from '../core/settings';
import { StepTimer } from '../core/timer';
import { log, logError } from '../platform/log';
import { Native, type Capture, type FrontTask } from '../platform/native';
import { CODE_PAGE_NOT_FOUND, errorCode, UserFacingError } from '../sdk/errors';
import { fs } from '../sdk/fs';
import { Sn } from '../sdk/sn';
import { CAPTURE_PREFIX, closeRegionScreen, cutRegion, deliverToNote, pasteIntoNote, placeRegion, removeCaptures, type Pasted } from './capture';
import type { DocPage } from './annotateScreenshot';
import { askForRegion, type RegionChoice } from './region';
import { docFramesOf, documentPageSize, isLastPage, markerInfos, normalizeRender, readHandwriting, snapPage, underlinesFrom, type Handwriting } from './snapPage';

/** Lets the plugin menu that held the button close before the screen is captured. */
const MENU_CLOSE_MS = 300;

/** A screen capture the floating button already took (it hides itself for it). */
export interface Captured {
  front: FrontTask;
  raw: string;
  shot: Capture;
}

export async function snapRegion(settings: Settings, from?: Captured): Promise<void> {
  const t = new StepTimer();
  const [docPath, page, pluginDir] = await Promise.all([Sn.currentFilePath(), Sn.currentPage(), Sn.pluginDir()]);
  if (!isDocumentPath(docPath)) {
    throw new UserFacingError('Open a document to snap a region.');
  }
  const pageSize = await documentPageSize(docPath, page, await isLastPage(page));
  const tmp = tmpDir(pluginDir);
  await fs.makeDirs(tmp);
  const stamp = Date.now();
  const render = `${tmp}/${CAPTURE_PREFIX}${stamp}-render.png`;
  const out = `${tmp}/${CAPTURE_PREFIX}${stamp}-page.png`;
  const takenAt = new Date();
  let raw: string;
  let front: FrontTask;
  let shot: Capture;
  if (from) {
    ({ raw, front, shot } = from);
  } else {
    await removeCaptures(pluginDir); // anything left by a run that failed
    raw = `${tmp}/${CAPTURE_PREFIX}${stamp}.png`;
    await Native.sleep(MENU_CLOSE_MS);
    [front, shot] = await Promise.all([Native.foreground(), Native.captureScreen(raw, fitInsetsDp('off'))]);
    t.mark('capture');
  }

  if (settings.destination === 'current') {
    await pasteRegion(settings, { front, raw, shot }, { docPath, page }, out, pluginDir, t);
    return;
  }

  // Started now, used after the user has drawn the box.
  const rendering = Sn.renderDocPage(page, render, pageSize, settings.keepHighlights).then(
    () => true,
    e => {
      logError('snap region: render (cutting from the screen instead)', e);
      return false;
    },
  );
  // The ink, read in DOC while you draw the box. On a document's last page DOC refuses it (R80): then it
  // is read once the new note is open in Notes (Delivery.lateInk).
  const lastPage = await isLastPage(page);
  const reading: Promise<Handwriting | null> = !settings.includeHandwriting
    ? Promise.resolve({ strokes: [], markers: [] })
    : lastPage
      ? Promise.resolve(null)
      : readHandwriting(docPath, page, settings.highlightStyle).catch(e => {
          if (errorCode(e) === CODE_PAGE_NOT_FOUND) {
            return null;
          }
          logError('snap region: read ink (snapping without it)', e);
          return { strokes: [], markers: [] };
        });

  let choice: RegionChoice = null;
  let strokes: Element[] = [];
  let lateInk: (() => Promise<Element[]>) | undefined;
  let isPortrait = pageSize.height >= pageSize.width;
  try {
    choice = await askForRegion({ path: raw, width: shot.width, height: shot.height }, 'Whole page');
    t.mark('region');
    if (choice && choice !== 'whole') {
      const box = choice;
      const [rendered, read] = await Promise.all([rendering, reading]);
      t.mark('render');
      if (rendered) {
        // The box is drawn on the screen, which shows the page the way its ink is kept (R81); the render
        // may show it differently (a landscape page), so the cut is mapped onto the render.
        const crop = captureToPage(box, shot, pageSize);
        const frames = await docFramesOf(docPath, page, pageSize);
        await normalizeRender(render, pageSize, frames);
        const renderCrop = mapRect(crop, frames.viewToRender);
        const dst = await placeRegion(render, out, renderCrop, pageSize, settings);
        const inkCrop = mapRect(crop, frames.viewToInk);
        if (frames.landscape) {
          log(`snap region: landscape page; box ${JSON.stringify(crop)} -> render ${JSON.stringify(renderCrop)} -> ${JSON.stringify(dst)}`);
        }
        if (read) {
          strokes = await regionInk(read, render, inkCrop, dst, pageSize, frames);
        } else {
          log('snap region: last page of the document; reading the ink once Notes has the note (R80)');
          lateInk = async () => regionInk(await readHandwriting(docPath, page, settings.highlightStyle), render, inkCrop, dst, pageSize, frames);
        }
      } else {
        // No render: cut the screen capture, which has the ink in it already.
        if (read) {
          Sn.recycle([...read.strokes, ...read.markers]);
        }
        await placeRegion(raw, out, box, shot, settings);
        isPortrait = shot.height >= shot.width;
      }
      t.mark(`cut (${strokes.length} strokes)`);
    }
  } finally {
    await closeRegionScreen('snap region', choice);
  }

  if (choice === null || choice === 'whole') {
    // DOC is in front again: wait for the background work, clean up, and for "Whole page" snap it all.
    await rendering;
    const read = await reading;
    if (read) {
      Sn.recycle([...read.strokes, ...read.markers]);
    }
    await removeCaptures(pluginDir);
    if (choice === 'whole') {
      await snapPage(settings);
    }
    return;
  }
  try {
    await deliverToNote(
      'snap region',
      { page: out, takenAt, isPortrait, front, doc: { docPath, page }, elements: strokes, inkPageSize: pageSize, lateInk },
      settings,
      pluginDir,
      t,
    );
  } finally {
    Sn.recycle(strokes);
  }
}

/**
 * "Into the note I'm working in": the box is cut from the screen capture, so your ink and highlights
 * come along flattened into the picture (a picture can't hold strokes).
 */
async function pasteRegion(settings: Settings, from: Captured, doc: DocPage, out: string, pluginDir: string, t: StepTimer): Promise<void> {
  let choice: RegionChoice = null;
  let pasted: Pasted | null = null;
  try {
    choice = await askForRegion({ path: from.raw, width: from.shot.width, height: from.shot.height }, 'Whole page');
    t.mark('region');
    if (choice && choice !== 'whole') {
      pasted = await cutRegion(from.raw, out, choice);
    }
  } finally {
    await closeRegionScreen('snap region', choice);
  }
  if (!pasted) {
    await removeCaptures(pluginDir);
    if (choice === 'whole') {
      await snapPage(settings);
    }
    return;
  }
  await pasteIntoNote('snap region', pasted, from.front, doc, null, settings, pluginDir, t);
}

/**
 * The ink inside the box, moved and scaled into the placed cut-out: the strokes as they are, each
 * marker as an underline just under its text line in `render` (page px). Recycles `read`.
 */
async function regionInk(read: Handwriting, render: string, crop: Rect, dst: Rect, pageSize: Size, frames: DocFrames): Promise<Element[]> {
  const inkFrame = frames.inkToRender;
  const infos = await markerInfos(read.markers, frames.inkSize).catch(() => []);
  Sn.recycle(read.markers);
  // The render shows the page in its own frame: bands go there and the line bottoms come back (R81).
  const report =
    infos.length && Native.available
      ? await Native.inspectRender(
          render,
          infos.map(i => {
            const [l, r] = scalePoints([{ x: i.band.left, y: i.band.y }, { x: i.band.right, y: i.band.y }], inkFrame);
            return { left: l.x, right: r.x, y: l.y, maxDy: Math.round(LINE_BOTTOM_SEARCH_PX * inkFrame.scale) };
          }),
          [],
        ).catch(e => {
          logError('snap region: find the highlighted lines (thickness-based underlines)', e);
          return null;
        })
      : null;
  const bottoms = report ? report.lineBottoms.map(y => (y < 0 ? -1 : Math.round((y - inkFrame.rect.top) / inkFrame.scale))) : null;
  const handwriting = [...(await underlinesFrom(infos, frames.inkSize, bottoms)), ...read.strokes];
  if (infos.length) {
    log(`snap region: ${infos.length} marker(s); line bottoms ${JSON.stringify(bottoms)}`);
  }
  try {
    return await regionStrokes(handwriting, crop, dst, frames.inkSize, pageSize);
  } finally {
    Sn.recycle(handwriting);
  }
}

/** A rect through a layout (corner by corner; the layouts here only scale and move). */
function mapRect(r: Rect, layout: MarginLayout): Rect {
  const [a, b] = scalePoints([{ x: r.left, y: r.top }, { x: r.right, y: r.bottom }], layout);
  return { left: a.x, top: a.y, right: b.x, bottom: b.y };
}

/** The page's strokes that are mostly inside the box, moved and scaled into the placed cut-out. */
/** `crop` in ink px (points read in `inkSize`), `dst` on a note page of `pageSize`. */
async function regionStrokes(handwriting: ReadonlyArray<Element>, crop: Rect, dst: Rect, inkSize: Size, pageSize: Size): Promise<Element[]> {
  const scale = regionScale(crop, dst);
  const out: Element[] = [];
  let shapes = 0;
  for (const e of handwriting) {
    const stroke = e.stroke;
    const count = stroke ? await stroke.points.size() : 0;
    if (!stroke || count < 2) {
      shapes++;
      continue;
    }
    const points = await Sn.strokePoints(stroke, count, inkSize);
    if (!mostlyInside(points, crop)) {
      continue;
    }
    const pressures = await stroke.pressures.getRange(0, count).catch(() => null);
    out.push(
      await Sn.newStroke({
        page: 0,
        pageSize,
        penType: stroke.penType,
        penColor: stroke.penColor,
        thickness: scaleThicknessBy(e.thickness, scale),
        points: points.map(p => mapToRegion(p, crop, dst)),
        pressure: pressures && pressures.length === count ? pressures : UNDERLINE_PRESSURE,
      }),
    );
  }
  if (shapes) {
    log(`snap region: ${shapes} non-stroke element(s) (e.g. shapes) not copied`);
  }
  return out;
}
