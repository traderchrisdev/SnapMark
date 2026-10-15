// "Choose a region": the user drags a box over a capture of the screen; the cut-out goes at the top of
// a fresh page, as wide as the toolbar allows and enlarged up to MAX_SCALE, leaving the rest to write on.
// Pure, so it can be unit-tested.

import type { Rect, Size } from './backlink';
import type { Insets } from './fit';

/** Small selections are enlarged, but not so much that the pixels show. */
export const MAX_SCALE = 2;
/** The cut-out never takes more than this share of the usable page height: there's always room to write. */
export const MAX_HEIGHT_SHARE = 0.75;
/** Space around the cut-out, in dp. */
export const MARGIN_DP = 24;
/** A drag smaller than this (dp, either side) is a slip, not a selection. */
export const MIN_BOX_DP = 24;

export interface Point {
  x: number;
  y: number;
}

/** Where an image of `image` size sits when shown "contain" inside `area` (both in the same units). */
export function containFrame(area: Size, image: Size): Rect {
  const scale = Math.min(area.width / image.width, area.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const left = (area.width - width) / 2;
  const top = (area.height - height) / 2;
  return { left, top, right: left + width, bottom: top + height };
}

export function clampPoint(p: Point, r: Rect): Point {
  return { x: Math.min(r.right, Math.max(r.left, p.x)), y: Math.min(r.bottom, Math.max(r.top, p.y)) };
}

/** The box spanned by two corners, in any order. */
export function boxFrom(a: Point, b: Point): Rect {
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) };
}

/** The corner of `box` opposite the one within `reach` of `p`, or null if p isn't near a corner. */
export function oppositeCorner(box: Rect, p: Point, reach: number): Point | null {
  const corners: Array<[Point, Point]> = [
    [{ x: box.left, y: box.top }, { x: box.right, y: box.bottom }],
    [{ x: box.right, y: box.top }, { x: box.left, y: box.bottom }],
    [{ x: box.left, y: box.bottom }, { x: box.right, y: box.top }],
    [{ x: box.right, y: box.bottom }, { x: box.left, y: box.top }],
  ];
  for (const [corner, opposite] of corners) {
    if (Math.abs(corner.x - p.x) <= reach && Math.abs(corner.y - p.y) <= reach) {
      return opposite;
    }
  }
  return null;
}

export function isBigEnough(box: Rect, min: number): boolean {
  return box.right - box.left >= min && box.bottom - box.top >= min;
}

/** A box drawn on the image shown at `frame` → the same box in the capture's pixels. */
export function boxToCapturePx(box: Rect, frame: Rect, capture: Size): Rect {
  const sx = capture.width / (frame.right - frame.left);
  const sy = capture.height / (frame.bottom - frame.top);
  const x = (v: number) => Math.min(capture.width, Math.max(0, Math.round((v - frame.left) * sx)));
  const y = (v: number) => Math.min(capture.height, Math.max(0, Math.round((v - frame.top) * sy)));
  return { left: x(box.left), top: y(box.top), right: x(box.right), bottom: y(box.bottom) };
}

export function insetsToPx(insetsDp: Insets, density: number): Insets {
  return {
    left: Math.round(insetsDp.left * density),
    top: Math.round(insetsDp.top * density),
    right: Math.round(insetsDp.right * density),
    bottom: Math.round(insetsDp.bottom * density),
  };
}

/**
 * Where the cut-out `crop` (capture px) goes on a page of `page` size: at the top, centered between
 * the insets (NOTE's toolbar and page bar), as large as fits but at most MAX_SCALE and MAX_HEIGHT_SHARE.
 */
export function regionPlacement(page: Size, crop: Rect, insets: Insets, margin: number): Rect {
  const cropW = crop.right - crop.left;
  const cropH = crop.bottom - crop.top;
  const availW = page.width - insets.left - insets.right - 2 * margin;
  const availH = (page.height - insets.top - insets.bottom - 2 * margin) * MAX_HEIGHT_SHARE;
  const scale = Math.min(MAX_SCALE, availW / cropW, availH / cropH);
  const width = Math.round(cropW * scale);
  const height = Math.round(cropH * scale);
  const left = insets.left + margin + Math.round((availW - width) / 2);
  const top = insets.top + margin;
  return { left, top, right: left + width, bottom: top + height };
}

/** A box in capture pixels → the same box on a page of `page` size (DOC shows the page fitted to the screen). */
export function captureToPage(box: Rect, capture: Size, page: Size): Rect {
  const sx = page.width / capture.width;
  const sy = page.height / capture.height;
  return {
    left: Math.round(box.left * sx),
    top: Math.round(box.top * sy),
    right: Math.round(box.right * sx),
    bottom: Math.round(box.bottom * sy),
  };
}

/** How much the cut-out was enlarged (or shrunk) on its way from `crop` to `dst`. */
export function regionScale(crop: Rect, dst: Rect): number {
  return (dst.right - dst.left) / (crop.right - crop.left);
}

/** A point on the source page → the same spot inside the placed cut-out. */
export function mapToRegion(p: Point, crop: Rect, dst: Rect): Point {
  const s = regionScale(crop, dst);
  return { x: Math.round(dst.left + (p.x - crop.left) * s), y: Math.round(dst.top + (p.y - crop.top) * s) };
}

/** A stroke belongs to the region if at least half of its points are inside the box. */
export function mostlyInside(points: ReadonlyArray<Point>, box: Rect): boolean {
  const inside = points.filter(p => p.x >= box.left && p.x <= box.right && p.y >= box.top && p.y <= box.bottom).length;
  return points.length > 0 && inside * 2 >= points.length;
}
