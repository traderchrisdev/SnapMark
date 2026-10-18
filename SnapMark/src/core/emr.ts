// sn-plugin-lib 0.1.65 and earlier (the only versions every plugin-capable firmware accepts, SPIKES.md
// R77) give stroke points in EMR digitizer coordinates instead of page pixels. Only stroke points: the
// library's comments say picture rects are EMR too, but NOTE takes those in page pixels (R77). The
// digitizer is rotated against the page: EMR x runs down the page, EMR y runs right to left. Same math
// as PointUtils in sn-plugin-lib 0.1.65, plus the frame of a landscape PDF page (R81); pure, so it can
// be unit-tested.

import type { Size } from './backlink';

export interface Point {
  x: number;
  y: number;
}

/** EMR range [maxX, maxY] for a page of this pixel size (portrait or landscape). */
function emrRange(page: Size): [number, number] {
  const portrait = page.width < page.height;
  const long = Math.max(page.width, page.height);
  const short = Math.min(page.width, page.height);
  const key = `${short}x${long}`;
  const ranges: Record<string, [number, number]> = {
    '1920x2560': [21632, 16224], // Manta
    '1404x1872': [15819, 11864], // Nomad, A5 X, A6 X
    '2560x3414': [28854, 21632],
    '1872x2496': [21098, 15819],
  };
  const r = ranges[key];
  if (!r) {
    throw new Error(`no EMR range for a ${page.width}x${page.height} page`);
  }
  // Landscape swaps them (PointUtils.getRealMaxX/Y).
  return portrait ? r : [r[1], r[0]];
}

const PORTRAIT_SCREENS: ReadonlyArray<Size> = [
  { width: 1920, height: 2560 },
  { width: 1404, height: 1872 },
  { width: 2560, height: 3414 },
  { width: 1872, height: 2496 },
];

/**
 * EMR units per px down the page (kx) and across it (ky), and the width the x axis is flipped around.
 * A known page size uses its own range. A wider frame as tall as a screen is a landscape PDF page
 * zoomed to the screen height (R81); a frame as wide as a screen's long side is a page zoomed to the
 * width of the sideways screen (R83). Both keep the screen's units, flipped around their own width.
 */
function emrAxes(page: Size): { kx: number; ky: number; width: number } {
  const known = PORTRAIT_SCREENS.some(
    s => (s.width === page.width && s.height === page.height) || (s.width === page.height && s.height === page.width),
  );
  if (known) {
    const [maxX, maxY] = emrRange(page);
    return { kx: maxX / (page.height - 1), ky: maxY / (page.width - 1), width: page.width };
  }
  const screen =
    PORTRAIT_SCREENS.find(s => s.height === page.height && page.width > s.width) ??
    PORTRAIT_SCREENS.find(s => s.height === page.width);
  if (!screen) {
    throw new Error(`no EMR range for a ${page.width}x${page.height} page`);
  }
  const [maxX, maxY] = emrRange(screen);
  return { kx: maxX / (screen.height - 1), ky: maxY / (screen.width - 1), width: page.width };
}

export function toEmr(p: Point, page: Size): Point {
  const a = emrAxes(page);
  return { x: p.y * a.kx, y: (a.width - 1 - p.x) * a.ky };
}

export function fromEmr(p: Point, page: Size): Point {
  const a = emrAxes(page);
  return { x: a.width - 1 - p.y / a.ky, y: p.x / a.kx };
}
