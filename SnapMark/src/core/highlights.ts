// Marker highlights can't be copied as markers: NOTE paints them opaque over the page template and
// hides the text (SPIKES.md R41). SnapMark turns each one into a thin underline instead.

export type HighlightStyle = 'underline' | 'omit';

export const PEN_TECHNICAL = 10;
export const PEN_MARKER = 11;
export const COLOR_DARK_GRAY = 157;

/** Stroke thickness is in 1/100 px: a 3800 marker paints a 38 px band (SPIKES.md R42). */
export const STROKE_UNITS_PER_PX = 100;
/** 3 px line. */
export const UNDERLINE_THICKNESS = 300;
export const UNDERLINE_PRESSURE = 1500;
/** Below the band: clears descenders for a marker drawn across the middle of a text line (measured on device). */
const GAP_PX = 6;
/** Spacing of points on a straightened underline. */
const STEP_PX = 24;

export interface Point {
  x: number;
  y: number;
}

/** The marker path runs through the middle of its band; the underline sits just below the band. */
export function underlineOffsetPx(markerThickness: number): number {
  return Math.round(markerThickness / STROKE_UNITS_PER_PX / 2) + GAP_PX;
}

/**
 * A marker that stays within one band height vertically is a line highlight: underline it with a
 * straight line at its average height (a hand-drawn path wobbles ±10 px). Anything else keeps its shape.
 */
export function underlinePoints(markerPoints: ReadonlyArray<Point>, markerThickness: number, pageHeight: number): Point[] {
  const dy = underlineOffsetPx(markerThickness);
  const clampY = (y: number) => Math.min(pageHeight - 1, Math.round(y + dy));
  let [left, right, top, bottom, sumY] = [Infinity, -Infinity, Infinity, -Infinity, 0];
  for (const p of markerPoints) {
    left = Math.min(left, p.x);
    right = Math.max(right, p.x);
    top = Math.min(top, p.y);
    bottom = Math.max(bottom, p.y);
    sumY += p.y;
  }
  const bandPx = markerThickness / STROKE_UNITS_PER_PX;
  if (markerPoints.length < 2 || bottom - top > bandPx) {
    return markerPoints.map(p => ({ x: p.x, y: clampY(p.y) }));
  }
  const y = clampY(sumY / markerPoints.length);
  const steps = Math.max(1, Math.ceil((right - left) / STEP_PX));
  return Array.from({ length: steps + 1 }, (_, i) => ({ x: Math.round(left + ((right - left) * i) / steps), y }));
}
