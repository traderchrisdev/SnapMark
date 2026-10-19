// Searchable snaps: the text a snap carries for Supernote's search. DOC gives a page's text as one
// string in reading order, one visual line per line, without positions (getCurrentDocText). A region's
// text is found by lining the page's text lines up with the text lines seen in the render; when the two
// don't pair up one to one (two columns, a figure, a framed box), the snap carries the whole page's
// text instead, so it is still found by any word of its page. Pure, so it can be unit-tested.

/** A text line in the render: its top and bottom rows. */
export interface Band {
  top: number;
  bottom: number;
}

/** A text box holds this much at most; a page rarely has more. */
export const MAX_SEARCH_TEXT = 6000;

/** The page's text lines, without blank lines or trailing spaces. */
export function textLines(pageText: string): string[] {
  return pageText
    .split(/\r?\n/)
    .map(l => l.replace(/\s+$/, ''))
    .filter(l => l.trim().length > 0);
}

/** "Book p. N" for page index `page`. */
export function snapKeyword(title: string, page: number): string {
  return `${title} p. ${page + 1}`;
}

/**
 * The lines whose band has its middle inside [top, bottom] (render px), when the page's text lines and
 * the render's bands pair up one to one; null when they don't, or the box holds no line.
 */
export function linesInRows(lines: ReadonlyArray<string>, bands: ReadonlyArray<Band>, top: number, bottom: number): string[] | null {
  if (!lines.length || lines.length !== bands.length) {
    return null;
  }
  const picked = lines.filter((_, i) => {
    const mid = (bands[i].top + bands[i].bottom) / 2;
    return mid >= top && mid <= bottom;
  });
  return picked.length ? picked : null;
}

/** The text to store: lines joined, cut to MAX_SEARCH_TEXT. */
export function searchTextOf(lines: ReadonlyArray<string>): string {
  const text = lines.join('\n');
  return text.length > MAX_SEARCH_TEXT ? text.slice(0, MAX_SEARCH_TEXT) : text;
}

/** Bands much thinner than the page's usual line are rules and borders, not text. */
const THIN_SHARE = 0.35;

/** Text lines of the render, without rules and frame edges (bands much thinner than the usual line). */
export function textBandsOnly(bands: ReadonlyArray<Band>): Band[] {
  if (!bands.length) {
    return [];
  }
  const heights = bands.map(b => b.bottom - b.top + 1).sort((a, b) => a - b);
  const usual = heights[Math.floor(heights.length / 2)];
  return bands.filter(b => b.bottom - b.top + 1 >= usual * THIN_SHARE);
}
