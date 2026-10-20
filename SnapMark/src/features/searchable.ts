// Searchable snaps: a snap from a PDF or EPUB carries a "Book p. N" keyword (Search → Keyword) and the
// text it shows, in a text box on a hidden layer of its page (Search → Text finds it; the page looks
// the same). A paste into your own note gets the keyword only: SnapMark doesn't add layers to your
// pages. The text comes from DOC (core/searchText); a scan has none, and DOC refuses a document's
// last page (R80), so those snaps get the keyword alone. Never fails a snap.

import type { Rect, Size } from '../core/backlink';
import { baseName, docTitle } from '../core/paths';
import { linesInRows, searchTextOf, snapKeyword, textBandsOnly, textLines } from '../core/searchText';
import type { Settings } from '../core/settings';
import { log, logError } from '../platform/log';
import { Native } from '../platform/native';
import { errorCode } from '../sdk/errors';
import { Sn } from '../sdk/sn';
import { nativeDelay } from '../sdk/wait';
import { recordInserted } from './undo';

export interface Searchable {
  keyword: string;
  /** The text to keep on a hidden layer; null: the keyword only. */
  text: string | null;
}

/** A row with this many dark px is text; a frame's thin sides have fewer. */
const MIN_DARK_PX = 8;
/** NOTE has been seen not to answer a keyword or layer call now and then: the snap doesn't wait for it. */
const CALL_LIMIT_MS = 8000;
/** insertKeyWord's error for a keyword the page already has. */
const CODE_DUPLICATE_KEYWORD = 1001;
const LAYER_NAME = 'Searchable text';
const TEXT_LAYER = 1;
const TEXT_SIZE = 20;
const TEXT_INSET = 40;

/** DOC in front. The page's text, or null (Searchable snaps off, a scan, or DOC refused it). */
export async function readDocText(settings: Settings, page: number): Promise<string | null> {
  if (!settings.searchable) {
    return null;
  }
  try {
    const text = await Sn.docPageText(page);
    log(`searchable: page ${page + 1} has ${text.length} characters of text`);
    return text.trim() ? text : null;
  } catch (e) {
    logError(`searchable: page ${page + 1} text (keyword only)`, e);
    return null;
  }
}

/** What a page snap carries; null when Searchable snaps is off. */
export function pageSearchable(settings: Settings, docPath: string, page: number, pageText: string | null): Searchable | null {
  if (!settings.searchable) {
    return null;
  }
  return { keyword: snapKeyword(docTitle(docPath), page), text: pageText ? searchTextOf(textLines(pageText)) : null };
}

/**
 * What a region snap carries: the lines inside `renderCrop` (render px) when the page's text lines and
 * the render's line up, else the whole page's text.
 */
export async function regionSearchable(
  settings: Settings,
  docPath: string,
  page: number,
  pageText: string | null,
  render: string,
  renderCrop: Rect,
): Promise<Searchable | null> {
  const base = pageSearchable(settings, docPath, page, pageText);
  if (!base || !pageText || !Native.available) {
    return base;
  }
  try {
    const lines = textLines(pageText);
    const bands = textBandsOnly(await Native.textBands(render, MIN_DARK_PX));
    const picked = linesInRows(lines, bands, renderCrop.top, renderCrop.bottom);
    log(`searchable: ${lines.length} text lines, ${bands.length} in the render -> ${picked ? `${picked.length} in the box` : "the page's text"}`);
    return { ...base, text: searchTextOf(picked ?? lines) };
  } catch (e) {
    logError("searchable: the box's lines (using the page's text)", e);
    return base;
  }
}

/**
 * The keyword, and the text on a new hidden layer, onto `page` of a note SnapMark made (or an inbox
 * page). File level; the caller reloads NOTE as it does for the ink. The layer needs NOTE in front
 * (insertLayer); from DOC add the keyword (`what`: 'keyword') and the text once NOTE has the note.
 */
export async function addSearchable(
  notePath: string,
  page: number,
  s: Searchable | null | undefined,
  size: Size,
  what: 'all' | 'keyword' | 'text' = 'all',
): Promise<void> {
  if (!s) {
    return;
  }
  const done = await Promise.race([addSearchableNow(notePath, page, s, size, what).then(() => true), nativeDelay(CALL_LIMIT_MS).then(() => false)]);
  if (!done) {
    log(`searchable: no answer from Notes after ${CALL_LIMIT_MS} ms; the snap goes on without waiting`);
  }
}

/** True for the error insertKeyWord gives when the page has that keyword already. */
function isDuplicate(e: unknown): boolean {
  return errorCode(e) === CODE_DUPLICATE_KEYWORD;
}

async function addSearchableNow(notePath: string, page: number, s: Searchable, size: Size, what: 'all' | 'keyword' | 'text'): Promise<void> {
  try {
    let where = '';
    if (what !== 'text') {
      try {
        await Sn.insertKeyWord(notePath, page, s.keyword);
        where = 'keyword';
      } catch (e) {
        if (!isDuplicate(e)) {
          throw e;
        }
        where = 'keyword (there already)';
      }
    }
    if (s.text && what !== 'keyword') {
      // Always a page SnapMark just made (a snap note, an inbox page): layer 1 is free. Not asked
      // with getLayers, which only NOTE answers (a margin-mode snap is finished from DOC).
      try {
        await Sn.insertLayer(notePath, page, TEXT_LAYER, LAYER_NAME, false);
      } catch (e) {
        logError('searchable: hidden layer (keyword only)', e);
        log(`searchable: "${s.keyword}" ${where || 'nothing'} only -> ${baseName(notePath)} page ${page + 1}`);
        return;
      }
      const rect = { left: TEXT_INSET, top: TEXT_INSET, right: size.width - TEXT_INSET, bottom: size.height - TEXT_INSET };
      const el = await Sn.newTextElement(s.text, TEXT_SIZE, rect, page);
      el.layerNum = TEXT_LAYER;
      try {
        await Sn.insertElements(notePath, page, [el]);
        recordInserted(notePath, page, [el]);
      } finally {
        Sn.recycle([el]);
      }
      where += `${where ? ' and ' : ''}${s.text.length} characters on hidden layer ${TEXT_LAYER}`;
    }
    log(`searchable: "${s.keyword}" ${where} -> ${baseName(notePath)} page ${page + 1}`);
  } catch (e) {
    logError('searchable: keyword/text (snap kept without them)', e);
  }
}

/** A paste into your own note: the keyword only. True if it went in. */
export async function addPasteKeyword(notePath: string, page: number, keyword: string | undefined): Promise<boolean> {
  if (!keyword) {
    return false;
  }
  try {
    const added = await Promise.race([Sn.insertKeyWord(notePath, page, keyword).then(() => true), nativeDelay(CALL_LIMIT_MS).then(() => false)]);
    log(added ? `searchable: "${keyword}" -> ${baseName(notePath)} page ${page + 1}` : `searchable: no answer from Notes for the keyword after ${CALL_LIMIT_MS} ms`);
    return added;
  } catch (e) {
    if (isDuplicate(e)) {
      log(`searchable: "${keyword}" is on ${baseName(notePath)} page ${page + 1} already`);
      return false; // not ours: Undo leaves it
    }
    logError('searchable: keyword on the paste', e);
    return false;
  }
}
