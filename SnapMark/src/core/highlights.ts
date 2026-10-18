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
/** Below the lowest row of the text line (its descenders), when the render was consulted (R79). */
export const UNDER_TEXT_GAP_PX = 3;
/** How far below a marker's centre the text line's bottom may be: a line is rarely taller than this. */
export const LINE_BOTTOM_SEARCH_PX = 60;

export interface Point {
  x: number;
  y: number;
}

/** The marker path runs through the middle of its band; the underline sits just below the band. */
export function underlineOffsetPx(markerThickness: number): number {
  return Math.round(markerThickness / STROKE_UNITS_PER_PX / 2) + GAP_PX;
}

/** A marker's x-extent and centre row: where to look in the render for the text line it covers. */
export function markerBand(markerPoints: ReadonlyArray<Point>): { left: number; right: number; y: number } {
  let [left, right, sumY] = [Infinity, -Infinity, 0];
  for (const p of markerPoints) {
    left = Math.min(left, p.x);
    right = Math.max(right, p.x);
    sumY += p.y;
  }
  return { left: Math.round(left), right: Math.round(right), y: Math.round(sumY / markerPoints.length) };
}

/**
 * When the render shows a text line at the marker's centre, a marker up to this many band heights
 * tall still highlights just that line (a hand-drawn stroke wobbles or goes back and forth); one
 * across two lines is taller than a line pitch plus a band.
 */
export const LINE_HIGHLIGHT_SLACK = 2.2;

/** True when the marker stays within `slack` band heights vertically: a single highlighted line. */
export function isLineHighlight(markerPoints: ReadonlyArray<Point>, markerThickness: number, slack = 1): boolean {
  let [top, bottom] = [Infinity, -Infinity];
  for (const p of markerPoints) {
    top = Math.min(top, p.y);
    bottom = Math.max(bottom, p.y);
  }
  return markerPoints.length >= 2 && bottom - top <= (slack * markerThickness) / STROKE_UNITS_PER_PX;
}

/**
 * A straight underline across the marker's x-extent, just under `lineBottom` (the lowest row of the
 * highlighted text line in the page render). Device-independent: the marker's thickness and the text
 * size no longer matter (on a Nomad the thickness-based offset landed one line too low, R79).
 */
export function underlineUnderText(markerPoints: ReadonlyArray<Point>, lineBottom: number, pageHeight: number): Point[] {
  const { left, right } = markerBand(markerPoints);
  const y = Math.min(pageHeight - 1, lineBottom + UNDER_TEXT_GAP_PX);
  const steps = Math.max(1, Math.ceil((right - left) / STEP_PX));
  return Array.from({ length: steps + 1 }, (_, i) => ({ x: Math.round(left + ((right - left) * i) / steps), y }));
}

/**
 * Without a render to consult: a marker that stays within one band height vertically is a line
 * highlight: underline it with a straight line at its average height (a hand-drawn path wobbles
 * ±10 px). Anything else keeps its shape.
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
