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
  /** The device is turned sideways: DOC shows the page zoomed to the screen's width and scrolls it (R83). */
  rotated: boolean;
  /** The screen as DOC shows it (sideways when rotated). The box is drawn in it. */
  view: Size;
  /** The frame the page's ink is kept in: the screen, or the page zoomed to the screen height (wider). */
  inkSize: Size;
  /** Ink px -> render px (the render shows the page fitted to the screen and centred). */
  inkToRender: MarginLayout;
  /** Screen px (what DOC shows: a landscape page zoomed to the screen height, from the left) -> ink px. */
  viewToInk: MarginLayout;
  /** Screen px -> render px. */
  viewToRender: MarginLayout;
  /** On a sideways screen: the frames NOTE reads the document's ink in, which stay upright (R83). */
  upright?: DocFrames;
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
 *
 * `rotated`: the device is turned sideways (R83). DOC then shows the page either as it would upright
 * (the render's frame, from the left) or zoomed to the sideways screen's width, scrolled up and down;
 * either way it keeps the ink in the page zoomed to that width (as wide as the screen's long side).
 * The view starts upright at scroll 0; `viewedAs` sets how it is really shown.
 */
export function docFrames(pagePt: Size | null, screen: Size, rotated = false): DocFrames {
  const known = !!pagePt && pagePt.width > 0 && pagePt.height > 0;
  const page = known && pagePt ? pagePt : screen;
  const landscape = known && page.width * screen.height > screen.width * page.height;
  const sR = Math.min(screen.width / page.width, screen.height / page.height);
  const offRx = (screen.width - page.width * sR) / 2;
  const offRy = (screen.height - page.height * sR) / 2;
  if (rotated) {
    const view = { width: screen.height, height: screen.width };
    const z = view.width / page.width;
    const inkSize = { width: view.width, height: Math.round(page.height * z) };
    const frames = { landscape, rotated, view, inkSize, inkToRender: affine(sR / z, offRx, offRy, inkSize), upright: docFrames(pagePt, screen) };
    return viewedAs({ ...frames, viewToInk: frames.inkToRender, viewToRender: frames.inkToRender }, { scale: 1, left: 0, top: 0 });
  }
  const id = affine(1, 0, 0, screen);
  if (!landscape) {
    return { landscape, rotated, view: screen, inkSize: screen, inkToRender: id, viewToInk: id, viewToRender: id };
  }
  const sV = screen.height / page.height;
  const inkSize = { width: Math.round(page.width * sV), height: screen.height };
  const viewToRender = affine(sR / sV, offRx, offRy, inkSize);
  return { landscape, rotated, view: screen, inkSize, inkToRender: viewToRender, viewToInk: affine(1, 0, 0, screen), viewToRender };
}

/** Screen px -> render px for a sideways screen (R83): render = screen * scale + (left, top). */
export interface ViewMapping {
  scale: number;
  left: number;
  top: number;
}

/** How DOC shows the page on a sideways screen: as it would upright, scrolled `scroll` screen px. */
export function uprightView(scroll: number): ViewMapping {
  return { scale: 1, left: 0, top: scroll };
}

/** How DOC shows the page on a sideways screen: zoomed to the screen's width, scrolled `scroll` screen px. */
export function widthView(frames: DocFrames, scroll: number): ViewMapping {
  const r = frames.inkToRender;
  return { scale: r.scale, left: r.rect.left, top: r.rect.top + scroll * r.scale };
}

/** `frames` with the view (the sideways screen, R83) mapped onto the render by `m`. */
export function viewedAs(frames: DocFrames, m: ViewMapping): DocFrames {
  const r = frames.inkToRender;
  const q = 1 / r.scale; // render px -> ink px
  return {
    ...frames,
    viewToRender: affine(m.scale, m.left, m.top, frames.view),
    viewToInk: affine(m.scale * q, (m.left - r.rect.left) * q, (m.top - r.rect.top) * q, frames.view),
  };
}

/**
 * The frames for ink read with NOTE in front (a document's last page, R80, or a paste): NOTE reports
 * it upright even on a sideways screen (R83), so only the view stays sideways.
 */
export function inNote(frames: DocFrames): DocFrames {
  const u = frames.upright;
  if (!frames.rotated || !u) {
    return frames;
  }
  const r = u.inkToRender;
  const m = frames.viewToRender;
  const q = 1 / r.scale;
  return {
    ...frames,
    inkSize: u.inkSize,
    inkToRender: r,
    viewToInk: affine(m.scale * q, (m.rect.left - r.rect.left) * q, (m.rect.top - r.rect.top) * q, frames.view),
  };
}
