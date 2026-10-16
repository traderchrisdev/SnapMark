// sn-plugin-lib 0.1.65 and earlier (the only versions every plugin-capable firmware accepts, SPIKES.md
// R77) give stroke points in EMR digitizer coordinates instead of page pixels. Only stroke points: the
// library's comments say picture rects are EMR too, but NOTE takes those in page pixels (R77). The
// digitizer is rotated against the page: EMR x runs down the page, EMR y runs right to left. Same math
// as PointUtils in sn-plugin-lib 0.1.65; pure, so it can be unit-tested.

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

export function toEmr(p: Point, page: Size): Point {
  const [maxX, maxY] = emrRange(page);
  return { x: p.y * (maxX / (page.height - 1)), y: (page.width - 1 - p.x) * (maxY / (page.width - 1)) };
}

export function fromEmr(p: Point, page: Size): Point {
  const [maxX, maxY] = emrRange(page);
  return { x: page.width - 1 - p.y / (maxY / (page.width - 1)), y: p.x / (maxX / (page.height - 1)) };
}
