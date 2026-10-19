// User settings and their on-disk encoding. Pure, so it can be unit-tested.
//
// Neither RN core nor sn-plugin-lib can write a file from JS, but FileUtils can make, list and delete
// folders, so each setting is stored as an empty folder named "<key>=<URI-encoded JSON value>" in the
// plugin's private dir (see platform/settingsStore). It predates SnapMark's native module and still
// works across plugin updates, so it stays.

import { SCREENSHOT_FITS, type ScreenshotFit } from './fit';
import type { HighlightStyle } from './highlights';
import { MARGIN_CHOICES } from './margin';
import { DEFAULT_SNAPS_FOLDER, sanitizeFolder, snapsDirFor } from './paths';

export type AfterSnap = 'open' | 'stay';

/**
 * Where a snap goes. "note": a new note each. "inbox": the next page of the Snaps inbox. "current": a
 * region snap is pasted as a picture onto the page of the note open in NOTE (others make a note each).
 */
export type Destination = 'note' | 'inbox' | 'current';

/** What a tap on the floating button does first. */
export type BubbleAction = 'region' | 'whole';

export interface Settings {
  /** Snaps folder under Note/, e.g. "Snaps" or "Reading/Snaps". Each document gets a subfolder. */
  folder: string;
  /** Render text-selection highlights/underlines into the page image (generateCurrentDocImage type 1). */
  keepHighlights: boolean;
  /** Copy the user's handwriting on the page into the snap as editable strokes. */
  includeHandwriting: boolean;
  /** Marker highlights can't stay markers (they'd hide the text, SPIKES.md R41). */
  highlightStyle: HighlightStyle;
  /** "open": go to the new note. "stay": save it, stay where you are, show a short confirmation. */
  afterSnap: AfterSnap;
  /** Where snaps go (see Destination). Stored as "collect" (true/false) before 0.12. */
  destination: Destination;
  /** Margin mode: page shrunk to this percent at the top-left, as a picture (0 = off). Own-note snaps only. */
  marginPercent: number;
  /** A screenshot newer than this is used directly; otherwise the picker opens. 0 = always pick. */
  screenshotFreshMinutes: number;
  /** The floating capture button over every app (SPIKES.md §1l). */
  bubble: boolean;
  /** "region": a tap opens a screen to drag a box over the part to keep. "whole": capture it all right away. */
  bubbleAction: BubbleAction;
  /** Which side NOTE's toolbar is on, so screenshot notes are shrunk clear of it ("off": full size). */
  screenshotFit: ScreenshotFit;
  /** Snaps from a PDF or EPUB carry the page's text (hidden) and a "Book p. N" keyword for search. */
  searchable: boolean;
}

export const FRESHNESS_CHOICES = [0, 2, 5, 10, 30, 60] as const;

export const DEFAULT_SETTINGS: Settings = {
  folder: DEFAULT_SNAPS_FOLDER,
  keepHighlights: true,
  includeHandwriting: true,
  highlightStyle: 'underline',
  afterSnap: 'open',
  destination: 'note',
  marginPercent: 0,
  screenshotFreshMinutes: 10,
  bubble: false,
  bubbleAction: 'region',
  screenshotFit: 'left',
  searchable: true,
};

export function snapsDir(s: Settings): string {
  return snapsDirFor(s.folder);
}

export const INBOX_NAME = 'Snaps inbox';

/** Collect mode: snaps are appended as pages of one "Snaps inbox" notebook. */
export function collects(s: Settings): boolean {
  return s.destination === 'inbox';
}

/** The collect-mode notebook, at the root of the snaps folder. */
export function inboxPath(s: Settings): string {
  return `${snapsDir(s)}/${INBOX_NAME}.note`;
}

type Validators = { [K in keyof Settings]: (v: unknown) => Settings[K] | undefined };

const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);

const VALIDATE: Validators = {
  folder: v => (typeof v === 'string' ? sanitizeFolder(v) ?? undefined : undefined),
  keepHighlights: bool,
  includeHandwriting: bool,
  highlightStyle: v => (v === 'underline' || v === 'omit' ? v : undefined),
  afterSnap: v => (v === 'open' || v === 'stay' ? v : undefined),
  destination: v =>
    v === 'note' || v === 'inbox' || v === 'current' ? v : v === true ? 'inbox' : v === false ? 'note' : undefined,
  marginPercent: v => (typeof v === 'number' && (MARGIN_CHOICES as readonly number[]).includes(v) ? v : undefined),
  screenshotFreshMinutes: v => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 24 * 60 ? v : undefined),
  bubble: bool,
  bubbleAction: v => (v === 'region' || v === 'whole' ? v : undefined),
  screenshotFit: v => (SCREENSHOT_FITS as readonly unknown[]).includes(v) ? (v as ScreenshotFit) : undefined,
  searchable: bool,
};

export function isSettingKey(k: string): k is keyof Settings {
  return Object.prototype.hasOwnProperty.call(VALIDATE, k);
}

/** Folder name for one setting. */
export function encodeSetting<K extends keyof Settings>(key: K, value: Settings[K]): string {
  return `${key}=${encodeURIComponent(JSON.stringify(value))}`;
}

/** Keys renamed since; their stored values are read by the new key's validator. */
const LEGACY_KEYS: Readonly<Record<string, keyof Settings>> = { collect: 'destination' };

/** The key a stored folder name belongs to (legacy names mapped), or null. */
export function entryKey(entry: string): keyof Settings | null {
  if (!entry.includes('=')) {
    return null;
  }
  const k = entry.slice(0, entry.indexOf('='));
  return isSettingKey(k) ? k : LEGACY_KEYS[k] ?? null;
}

/** Defaults overridden by every valid stored entry; unknown or corrupt entries are ignored. */
export function decodeSettings(entries: ReadonlyArray<string>): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const entry of entries) {
    const key = entryKey(entry);
    if (!key) {
      continue;
    }
    const legacy = !entry.startsWith(`${key}=`);
    if (legacy && entries.some(e => e.startsWith(`${key}=`))) {
      continue; // the current key wins
    }
    let raw: unknown;
    try {
      raw = JSON.parse(decodeURIComponent(entry.slice(entry.indexOf('=') + 1)));
    } catch {
      continue;
    }
    const value = VALIDATE[key](raw);
    if (value !== undefined) {
      (out as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}
