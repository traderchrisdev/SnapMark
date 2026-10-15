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
import type { Rect } from '../core/backlink';
import { UNDERLINE_PRESSURE } from '../core/highlights';
import { scaleThicknessBy } from '../core/margin';
import { isDocumentPath, tmpDir } from '../core/paths';
import { captureToPage, mapToRegion, mostlyInside, regionScale } from '../core/region';
import { fitInsetsDp } from '../core/fit';
import type { Settings } from '../core/settings';
import { StepTimer } from '../core/timer';
import { log, logError } from '../platform/log';
import { Native, type Capture, type FrontTask } from '../platform/native';
import { UserFacingError } from '../sdk/errors';
import { fs } from '../sdk/fs';
import { Sn } from '../sdk/sn';
import { CAPTURE_PREFIX, closeRegionScreen, deliverToNote, placeRegion, removeCaptures } from './capture';
import { askForRegion, type RegionChoice } from './region';
import { readHandwriting, snapPage } from './snapPage';

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
  const pageSize = await Sn.pageSize(docPath, page);
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

  // Started now, used after the user has drawn the box.
  const rendering = Sn.renderDocPage(page, render, pageSize, settings.keepHighlights).then(
    () => true,
    e => {
      logError('snap region: render (cutting from the screen instead)', e);
      return false;
    },
  );
  const reading = settings.includeHandwriting
    ? readHandwriting(docPath, page, pageSize, settings.highlightStyle).catch(e => {
        logError('snap region: read ink (snapping without it)', e);
        return [] as Element[];
      })
    : Promise.resolve([] as Element[]);

  let choice: RegionChoice = null;
  let strokes: Element[] = [];
  let isPortrait = pageSize.height >= pageSize.width;
  try {
    choice = await askForRegion({ path: raw, width: shot.width, height: shot.height }, 'Whole page');
    t.mark('region');
    if (choice && choice !== 'whole') {
      const box = choice;
      const [rendered, handwriting] = await Promise.all([rendering, reading]);
      t.mark('render');
      try {
        if (rendered) {
          const crop = captureToPage(box, shot, pageSize);
          const dst = await placeRegion(render, out, crop, pageSize, settings);
          strokes = await regionStrokes(handwriting, crop, dst);
        } else {
          // No render: cut the screen capture, which has the ink in it already.
          await placeRegion(raw, out, box, shot, settings);
          isPortrait = shot.height >= shot.width;
        }
      } finally {
        Sn.recycle(handwriting);
      }
      t.mark(`cut (${strokes.length} strokes)`);
    }
  } finally {
    await closeRegionScreen('snap region', choice);
  }

  if (choice === null || choice === 'whole') {
    // DOC is in front again: wait for the background work, clean up, and for "Whole page" snap it all.
    await rendering;
    Sn.recycle(await reading);
    await removeCaptures(pluginDir);
    if (choice === 'whole') {
      await snapPage(settings);
    }
    return;
  }
  try {
    await deliverToNote('snap region', { page: out, takenAt, isPortrait, front, doc: { docPath, page }, elements: strokes }, settings, pluginDir, t);
  } finally {
    Sn.recycle(strokes);
  }
}

/** The page's strokes that are mostly inside the box, moved and scaled into the placed cut-out. */
async function regionStrokes(handwriting: ReadonlyArray<Element>, crop: Rect, dst: Rect): Promise<Element[]> {
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
    const points = await stroke.points.getRange(0, count);
    if (!mostlyInside(points, crop)) {
      continue;
    }
    const pressures = await stroke.pressures.getRange(0, count).catch(() => null);
    out.push(
      await Sn.newStroke({
        page: 0,
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
