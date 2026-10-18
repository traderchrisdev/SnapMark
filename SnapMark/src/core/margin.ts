// Margin mode: the page shrunk to a fraction of the note page, at the top-left but clear of NOTE's
// toolbar (the insets), leaving a writing margin on the right and bottom. Templates are never scaled (SPIKES.md R38), so the page goes in as
// a picture at exactly the scaled size, and the user's handwriting is scaled the same way.

import type { Point } from './highlights';
import type { Rect, Size } from './backlink';
import type { Insets } from './fit';

/** Percent of the page width/height; 0 = off. */
export const MARGIN_CHOICES = [0, 80, 75, 66] as const;

/** Stroke thickness is in 1/100 px and never below the thinnest pen. */
const MIN_THICKNESS = 100;

export interface MarginLayout {
  scale: number;
  /** Render size of the page image. */
  imageSize: Size;
  /** Where the picture goes on the note page. */
  rect: Rect;
}

const NO_INSETS: Insets = { left: 0, top: 0, right: 0, bottom: 0 };

/** `insets` (px): NOTE's toolbar and page bar; the picture starts after them. */
export function marginLayout(page: Size, percent: number, insets: Insets = NO_INSETS): MarginLayout {
  const scale = percent / 100;
  const imageSize = { width: Math.round(page.width * scale), height: Math.round(page.height * scale) };
  const left = insets.left;
  const top = insets.top;
  return { scale, imageSize, rect: { left, top, right: left + imageSize.width, bottom: top + imageSize.height } };
}

/** Doc-page coordinates -> note-page coordinates inside the scaled picture. */
export function scalePoints(points: ReadonlyArray<Point>, layout: MarginLayout): Point[] {
  return points.map(p => ({ x: Math.round(layout.rect.left + p.x * layout.scale), y: Math.round(layout.rect.top + p.y * layout.scale) }));
}

export function scaleThickness(thickness: number, layout: MarginLayout): number {
  return scaleThicknessBy(thickness, layout.scale);
}

/** Also used for strokes copied into a region snap. */
export function scaleThicknessBy(thickness: number, scale: number): number {
  return Math.max(MIN_THICKNESS, Math.round(thickness * scale));
}

/**
 * Where a `src`-sized page lands when drawn into a `frame` of another size, keeping its aspect ratio
 * (what generateCurrentDocImage does, R11): scaled to fit, centred. `shrink` scales it further
 * (the backlink strip, R79), then it sits at the top, centred horizontally.
 */
export function fitLayout(src: Size, frame: Size, shrink = 1): MarginLayout {
  const scale = Math.min(frame.width / src.width, frame.height / src.height) * shrink;
  const imageSize = { width: Math.round(src.width * scale), height: Math.round(src.height * scale) };
  const left = Math.round((frame.width - imageSize.width) / 2);
  const top = shrink < 1 ? 0 : Math.round((frame.height - imageSize.height) / 2);
  return { scale, imageSize, rect: { left, top, right: left + imageSize.width, bottom: top + imageSize.height } };
}

export const IDENTITY_LAYOUT_SCALE = 1;

/** True when points pass through unchanged (same frame, no shrink): shapes can be copied as they are. */
export function isIdentity(layout: MarginLayout): boolean {
  return layout.scale === IDENTITY_LAYOUT_SCALE && layout.rect.left === 0 && layout.rect.top === 0;
}

/** How a document page sits in the three frames SnapMark deals with (R81). */
export interface DocFrames {
  /** The page is wider than the screen's shape (a landscape PDF page). */
  landscape: boolean;
  /** The frame the page's ink is kept in: the screen, or the page zoomed to the screen height (wider). */
  inkSize: Size;
  /** Ink px -> render px (the render shows the page fitted to the screen and centred). */
  inkToRender: MarginLayout;
  /** Screen px (what DOC shows: a landscape page zoomed to the screen height, from the left) -> ink px. */
  viewToInk: MarginLayout;
  /** Screen px -> render px. */
  viewToRender: MarginLayout;
}

function affine(scale: number, left: number, top: number, size: Size): MarginLayout {
  const imageSize = { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
  const l = Math.round(left);
  const t = Math.round(top);
  return { scale, imageSize, rect: { left: l, top: t, right: l + imageSize.width, bottom: t + imageSize.height } };
}

/**
 * `pagePt`: the page's own size (any unit; null if unknown). A page as wide as the screen's shape or
 * narrower is the same in all three frames. A wider one is shown, and its ink kept, zoomed to the
 * screen height from the left edge (a frame wider than the screen), and rendered fitted to the width
 * and centred (R81).
 */
export function docFrames(pagePt: Size | null, screen: Size): DocFrames {
  const id = affine(1, 0, 0, screen);
  if (!pagePt || pagePt.width <= 0 || pagePt.height <= 0 || pagePt.width * screen.height <= screen.width * pagePt.height) {
    return { landscape: false, inkSize: screen, inkToRender: id, viewToInk: id, viewToRender: id };
  }
  const sV = screen.height / pagePt.height;
  const inkSize = { width: Math.round(pagePt.width * sV), height: screen.height };
  const sR = Math.min(screen.width / pagePt.width, screen.height / pagePt.height);
  const offRx = (screen.width - pagePt.width * sR) / 2;
  const offRy = (screen.height - pagePt.height * sR) / 2;
  const viewToRender = affine(sR / sV, offRx, offRy, inkSize);
  return { landscape: true, inkSize, inkToRender: viewToRender, viewToInk: affine(1, 0, 0, screen), viewToRender };
}
