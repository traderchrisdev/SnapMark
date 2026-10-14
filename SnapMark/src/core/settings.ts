// User settings and their on-disk encoding. Pure, so it can be unit-tested.
//
// Neither RN core nor sn-plugin-lib can write a file from JS, and a native module would need a JDK
// to build. FileUtils can make, list and delete folders, so each setting is stored as an empty
// folder named "<key>=<URI-encoded JSON value>" in the plugin's private dir (see platform/settingsStore).

import type { HighlightStyle } from './highlights';
import { MARGIN_CHOICES } from './margin';
import { DEFAULT_SNAPS_FOLDER, sanitizeFolder, snapsDirFor } from './paths';

export type AfterSnap = 'open' | 'stay';

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
  /** Collect mode: append every snap as a page of one "Snaps inbox" notebook instead of a note each. */
  collect: boolean;
  /** Margin mode: page shrunk to this percent at the top-left, as a picture (0 = off). Own-note snaps only. */
  marginPercent: number;
  /** A screenshot newer than this is used directly; otherwise the picker opens. 0 = always pick. */
  screenshotFreshMinutes: number;
}

export const FRESHNESS_CHOICES = [0, 2, 5, 10, 30, 60] as const;

export const DEFAULT_SETTINGS: Settings = {
  folder: DEFAULT_SNAPS_FOLDER,
  keepHighlights: true,
  includeHandwriting: true,
  highlightStyle: 'underline',
  afterSnap: 'open',
  collect: false,
  marginPercent: 0,
  screenshotFreshMinutes: 10,
};

export function snapsDir(s: Settings): string {
  return snapsDirFor(s.folder);
}

export const INBOX_NAME = 'Snaps inbox';

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
  collect: bool,
  marginPercent: v => (typeof v === 'number' && (MARGIN_CHOICES as readonly number[]).includes(v) ? v : undefined),
  screenshotFreshMinutes: v => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 24 * 60 ? v : undefined),
};

export function isSettingKey(k: string): k is keyof Settings {
  return Object.prototype.hasOwnProperty.call(VALIDATE, k);
}

/** Folder name for one setting. */
export function encodeSetting<K extends keyof Settings>(key: K, value: Settings[K]): string {
  return `${key}=${encodeURIComponent(JSON.stringify(value))}`;
}

/** The key a stored folder name belongs to, or null. */
export function entryKey(entry: string): keyof Settings | null {
  const k = entry.slice(0, entry.indexOf('='));
  return entry.includes('=') && isSettingKey(k) ? k : null;
}

/** Defaults overridden by every valid stored entry; unknown or corrupt entries are ignored. */
export function decodeSettings(entries: ReadonlyArray<string>): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const entry of entries) {
    const key = entryKey(entry);
    if (!key) {
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(decodeURIComponent(entry.slice(key.length + 1)));
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
