// "Undo last snap" (Notes toolbar): takes back the last snap that went into a notebook you already
// had: a paste into the note you're working in (the picture, its ink, the link or caption), or a page
// appended to the Snaps inbox. Only what SnapMark added is removed, and only while it is still as the
// snap left it: if the page changed since, nothing is touched. A snap that made a note of its own is
// not deleted (SnapMark never deletes your files); the button says where it is instead.
// "Paste queued snaps" is one action: Undo takes the whole batch back, newest first.
// The record lives in memory: after the plugin restarts there is nothing to undo.

import type { Rect } from '../core/backlink';
import { baseName, samePath } from '../core/paths';
import { log, logError } from '../platform/log';
import { toast } from '../platform/toast';
import type { Element } from 'sn-plugin-lib';
import { Sn } from '../sdk/sn';
import { reloadAndShow } from './inbox';

const TYPE_PICTURE = 200;

/** What a snap added to an existing notebook, and how to recognise it later. */
interface AddedToNote {
  kind: 'paste' | 'inbox';
  notePath: string;
  page: number;
  /** numInPage of the elements the snap added (the inbox: every element on its page). */
  nums: number[];
  /** Their types, in that order. */
  types: number[];
  /** The pasted picture's rect, to tell it from anything else in that slot. */
  pictureRect: Rect | null;
  /** The snap made this page: it goes too once nothing else is on it. */
  ownPage: boolean;
  /** The notebook's page count right after the snap (a page added since shifts the numbering). */
  pages: number;
  /** A "Book p. N" keyword the snap added to that page (searchable snaps). */
  keyword?: string;
}

interface MadeNote {
  kind: 'note';
  notePath: string;
}

/** The last action: what it added (one snap, or a batch from the queue), or the note it made. */
let action: { added: AddedToNote[] } | MadeNote | null = null;
/** The snap being recorded (recordInserted / recordKeyword add to it). */
let last: AddedToNote | null = null;
let batching = false;

/** "Paste queued snaps": the snaps until endBatch are one action for Undo. */
export function startBatch(): void {
  batching = true;
  action = null;
  last = null;
}

export function endBatch(): void {
  batching = false;
}

/** The highest numInPage on a page (0 when it is empty), read before a paste adds to it. */
export async function lastNumInPage(notePath: string, page: number): Promise<number> {
  const all = await Sn.pageElements(notePath, page);
  try {
    return all.reduce((m, e) => Math.max(m, e.numInPage), 0);
  } finally {
    Sn.recycle(all);
  }
}

/**
 * A snap starts adding to `page` of a notebook you already have, whose highest numInPage is `after`
 * (0 for a page the snap made). What it inserts is then journalled by `recordInserted`: a file-level
 * insert appends, numbered after+1, after+2, … Nothing is read back afterwards (NOTE answers with its
 * open copy until it reloads). `pages`: the notebook's page count once the snap is done.
 */
export function beginAdding(kind: AddedToNote['kind'], notePath: string, page: number, after: number, ownPage: boolean, pages: number): void {
  last = { kind, notePath, page, nums: [], types: [], pictureRect: null, ownPage, pages };
  if (batching && action && 'added' in action) {
    action.added.push(last);
  } else {
    action = { added: [last] };
  }
  next = after + 1;
}

let next = 1;

/** Elements just inserted (in this order) at file level; journalled when they belong to the snap being recorded. */
export function recordInserted(notePath: string, page: number, elements: ReadonlyArray<Element>): void {
  const r = last;
  if (!r || !samePath(r.notePath, notePath) || r.page !== page) {
    return;
  }
  for (const e of elements) {
    r.nums.push(next++);
    r.types.push(e.type);
    if (e.type === TYPE_PICTURE && e.picture && !r.pictureRect) {
      r.pictureRect = { ...e.picture.rect };
    }
  }
  log(`undo: ${baseName(r.notePath)} page ${r.page + 1}, elements ${r.nums.join(',')}`);
}

/** The snap also added this keyword to that page. */
export function recordKeyword(notePath: string, page: number, keyword: string): void {
  const r = last;
  if (r && samePath(r.notePath, notePath) && r.page === page) {
    r.keyword = keyword;
  }
}

/** A snap that made a note of its own: Undo points to it rather than deleting it. */
export function rememberNewNote(notePath: string): void {
  action = { kind: 'note', notePath };
  last = null;
}

/** The snap failed half-way: what it left is not a whole snap to undo. */
export function forgetSnap(): void {
  if (!batching) {
    action = null;
  }
  last = null;
}

/** The answer, on screen and in the log. */
function say(text: string, long = false): void {
  log(`undo: ${text}`);
  toast(text, long);
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  return !a || !b ? a === b : a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
}

export async function undoLastSnap(): Promise<void> {
  const a = action;
  if (!a) {
    say('Nothing to undo.');
    return;
  }
  if (!('added' in a)) {
    action = null;
    say(`The last snap made its own note, “${baseName(a.notePath)}”. Delete it in Files if you don't want it.`, true);
    return;
  }
  const todo = a.added.filter(r => r.nums.length || r.ownPage);
  if (!todo.length) {
    action = null;
    say('Nothing to undo.');
    return;
  }
  await Sn.saveOpenNote().catch(e => logError('undo: save the open note', e));
  let removed = 0;
  let refused = '';
  let show: { notePath: string; page: number } | null = null;
  // Newest first: each earlier snap is then back to the page count it left.
  for (const r of [...todo].reverse()) {
    const why = await undoOne(r);
    if (why) {
      refused = why;
      break;
    }
    removed++;
    show = { notePath: r.notePath, page: r.page };
  }
  action = removed === todo.length ? null : { added: todo.slice(0, todo.length - removed) };
  if (show && samePath(await Sn.currentFilePath().catch(() => null), show.notePath)) {
    await reloadAndShow(Math.min(show.page, Math.max(0, (await Sn.noteTotalPages(show.notePath).catch(() => 1)) - 1)));
  }
  const kind = todo[0].kind;
  if (refused && !removed) {
    say(refused, true);
  } else if (refused) {
    say(`Removed the last ${removed} of ${todo.length} queued snaps; the rest has changed since.`, true);
  } else if (todo.length > 1) {
    say(`Removed the ${todo.length} queued snaps.`);
  } else {
    say(kind === 'inbox' ? 'Removed the last snap from the Snaps inbox.' : 'Removed the last paste.');
  }
}

/** Takes one snap's additions back; returns why not (nothing touched) or '' when done. */
async function undoOne(r: AddedToNote): Promise<string> {
  const pages = await Sn.noteTotalPages(r.notePath);
  const all = await Sn.pageElements(r.notePath, r.page);
  let others: number;
  let intact: boolean;
  try {
    const byNum = new Map(all.map(e => [e.numInPage, e]));
    const ours = r.nums.map(n => byNum.get(n));
    const picture = ours.find(e => e?.type === TYPE_PICTURE);
    intact =
      pages === r.pages &&
      ours.every((e, i) => e && e.type === r.types[i]) &&
      sameRect(picture?.picture?.rect ?? null, r.pictureRect);
    others = all.length - r.nums.length;
  } finally {
    Sn.recycle(all);
  }
  if (!intact) {
    log(`undo: ${baseName(r.notePath)} page ${r.page + 1} changed since the snap (${pages} pages, was ${r.pages}); nothing removed`);
    return "Can't undo: that page has changed since the snap.";
  }
  if (r.kind === 'inbox' && others > 0) {
    return "Can't undo: you've written on that page since the snap.";
  }
  const removePage = r.ownPage && others === 0 && pages > 1;
  if (removePage) {
    await Sn.removeNotePage(r.notePath, r.page);
  } else {
    await Sn.deleteElements(r.notePath, r.page, r.nums);
  }
  if (r.keyword && !removePage) {
    // The page stays: take the snap's keyword off it too (the last one with that text).
    try {
      const kws = (await Sn.keyWords(r.notePath, r.page)).filter(k => k.keyword === r.keyword);
      const kw = kws[kws.length - 1];
      if (kw) {
        await Sn.deleteKeyWord(r.notePath, r.page, kw.index);
      }
    } catch (e) {
      logError('undo: the keyword (left in place)', e);
    }
  }
  log(`undo: removed ${removePage ? `page ${r.page + 1}` : `elements ${r.nums.join(',')} on page ${r.page + 1}`} of ${baseName(r.notePath)}`);
  return '';
}
