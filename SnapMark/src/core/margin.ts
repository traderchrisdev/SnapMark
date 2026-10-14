// Margin mode: the page shrunk to a fraction of the note page, at the top-left, leaving a writing
// margin on the right and bottom. Templates are never scaled (SPIKES.md R38), so the page goes in as
// a picture at exactly the scaled size, and the user's handwriting is scaled the same way.

import type { Point } from './highlights';
import type { Rect, Size } from './backlink';

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

export function marginLayout(page: Size, percent: number): MarginLayout {
  const scale = percent / 100;
  const imageSize = { width: Math.round(page.width * scale), height: Math.round(page.height * scale) };
  return { scale, imageSize, rect: { left: 0, top: 0, right: imageSize.width, bottom: imageSize.height } };
}

/** Doc-page coordinates -> note-page coordinates inside the scaled picture. */
export function scalePoints(points: ReadonlyArray<Point>, layout: MarginLayout): Point[] {
  return points.map(p => ({ x: Math.round(layout.rect.left + p.x * layout.scale), y: Math.round(layout.rect.top + p.y * layout.scale) }));
}

export function scaleThickness(thickness: number, layout: MarginLayout): number {
  return Math.max(MIN_THICKNESS, Math.round(thickness * layout.scale));
}
