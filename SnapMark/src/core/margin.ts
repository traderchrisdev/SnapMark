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
