// Thin typed wrapper over sn-plugin-lib. The SDK's .d.ts types every API as
// Promise<Object | null | undefined>; here each call is checked for APIResponse.success and
// failures become SnApiError carrying the API name and error code.

import {
  Link,
  PluginCommAPI,
  PluginDocAPI,
  PluginFileAPI,
  PluginManager,
  PluginNoteAPI,
  type Element,
} from 'sn-plugin-lib';
import type { Rect, Size, TextLinkSpec } from '../core/backlink';
import { SnApiError } from './errors';

interface RawResponse<T> {
  success: boolean;
  result: T | null;
  error: { code: number; message: string } | null;
}

function isResponse(v: unknown): v is RawResponse<unknown> {
  return typeof v === 'object' && v !== null && 'success' in v;
}

function codeOf(e: unknown): number | null {
  if (typeof e === 'object' && e !== null && 'code' in e) {
    const n = Number((e as { code: unknown }).code);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

/** Await an APIResponse<T>; return result or throw SnApiError(api, code). */
export async function call<T>(api: string, pending: Promise<unknown>): Promise<T> {
  let raw: unknown;
  try {
    raw = await pending;
  } catch (e) {
    throw new SnApiError(api, codeOf(e), e instanceof Error ? e.message : String(e));
  }
  if (!isResponse(raw)) {
    throw new SnApiError(api, null, 'unexpected response shape');
  }
  if (!raw.success) {
    throw new SnApiError(api, raw.error?.code ?? null, raw.error?.message ?? 'no error message');
  }
  return raw.result as T;
}

/** For APIs whose result is a success flag: false is a failure too. */
async function callOk(api: string, pending: Promise<unknown>): Promise<void> {
  const ok = await call<boolean>(api, pending);
  if (ok !== true) {
    throw new SnApiError(api, null, `returned ${String(ok)}`);
  }
}

const TYPE_STROKE = 0;
const TYPE_PICTURE = 200;
const TYPE_LINK = 600;
const RENDER_WITH_HIGHLIGHTS = 1;
const RENDER_PLAIN = 0;
const CREATE_MODE_NORMAL = 0;
const PNG_WHITE_BACKGROUND = 1;
/** insertTextLink-style status codes. */
const LINK_OK = 0;

export const Sn = {
  currentFilePath: () => call<string>('getCurrentFilePath', PluginCommAPI.getCurrentFilePath()),
  currentPage: () => call<number>('getCurrentPageNum', PluginCommAPI.getCurrentPageNum()),
  pageSize: (path: string, page: number) => call<Size>('getPageSize', PluginFileAPI.getPageSize(path, page)),
  deviceType: () => PluginManager.getDeviceType(),
  pluginDir: async (): Promise<string> => {
    const dir = await PluginManager.getPluginDirPath();
    if (!dir) {
      throw new SnApiError('getPluginDirPath', null, 'returned nothing');
    }
    return dir;
  },

  /** DOC only. Letterboxes the page onto opaque white at exactly `size` (SPIKES.md R11). */
  renderDocPage: (page: number, pngPath: string, size: Size, keepHighlights: boolean) =>
    callOk(
      'generateCurrentDocImage',
      PluginDocAPI.generateCurrentDocImage(page, pngPath, size, keepHighlights ? RENDER_WITH_HIGHLIGHTS : RENDER_PLAIN),
    ),

  /** NOTE only (102 inside DOC). The template image is embedded in the .note (SPIKES.md R21). */
  createNote: (notePath: string, template: string, isPortrait: boolean) =>
    callOk('createNote', PluginFileAPI.createNote({ notePath, template, mode: CREATE_MODE_NORMAL, isPortrait })),

  /** A note page flattened (template + all layers) onto white, at the note's own size. Reads the file: save first. */
  notePagePng: (notePath: string, page: number, pngPath: string) =>
    callOk('generateNotePng', PluginFileAPI.generateNotePng({ notePath, page, times: 1, pngPath, type: PNG_WHITE_BACKGROUND })),

  /** NOTE only (102 inside DOC). Inserts before page `page`; the template image is embedded (R26). */
  insertNotePage: (notePath: string, page: number, template: string) =>
    callOk('insertNotePage', PluginFileAPI.insertNotePage({ notePath, page, template })),

  /** NOTE only (102 inside DOC). */
  noteTotalPages: (notePath: string) => call<number>('getNoteTotalPageNum', PluginFileAPI.getNoteTotalPageNum(notePath)),

  /** Current file only. */
  jumpToPage: (page: number) => callOk('jumpToPage', PluginCommAPI.jumpToPage(page)),

  /** NOTE only: write NOTE's in-memory edits of the open note to disk before file-level edits. */
  saveOpenNote: () => callOk('saveCurrentNote', PluginNoteAPI.saveCurrentNote()),

  /** NOTE only. */
  removeNotePage: (notePath: string, page: number) => callOk('removeNotePage', PluginFileAPI.removeNotePage(notePath, page)),

  /**
   * Make NOTE re-read the open file after file-level edits. Fire and forget: NOTE reloads, but the
   * call sometimes never answers (SPIKES.md R48); later calls still work.
   */
  reloadOpenFile: (): void => {
    PluginCommAPI.reloadFile().then(
      () => undefined,
      () => undefined,
    );
  },

  /** Resolves before PluginHost re-targets calls to the opened app: follow with waitUntilCurrent(). */
  openFile: (path: string, page: number) => callOk('openFile', PluginFileAPI.openFile(path, page)),

  /** 0 not encrypted, 1 encrypted and locked, 2 encrypted and unlocked for this plugin session. */
  encryptionStatus: (path: string) => call<number>('getPathEncryptionStatus', PluginFileAPI.getPathEncryptionStatus(path)),

  pageElements: (path: string, page: number) => call<Element[]>('getElements', PluginFileAPI.getElements(page, path)),

  insertElements: (path: string, page: number, elements: Element[]) =>
    callOk('insertElements', PluginFileAPI.insertElements(path, page, elements)),

  /** A text-link element for file-level insertion (links must be on the main layer). */
  newLinkElement: async (spec: TextLinkSpec, page: number): Promise<Element> => {
    const el = await call<Element>('createElement', PluginCommAPI.createElement(TYPE_LINK));
    el.pageNum = page;
    el.layerNum = 0;
    el.link = Object.assign(el.link ?? new Link(), {
      category: 0,
      X: spec.rect.left,
      Y: spec.rect.top,
      width: spec.rect.right - spec.rect.left,
      height: spec.rect.bottom - spec.rect.top,
      page,
      style: spec.style,
      linkType: spec.linkType,
      destPath: spec.destPath,
      destPage: spec.destPage,
      fontSize: spec.fontSize,
      fullText: spec.fullText,
      showText: spec.showText,
      italic: spec.isItalic,
      controlTrailNums: [],
    });
    return el;
  },

  /** A picture element showing `picturePath` in `rect` (main layer). */
  newPictureElement: async (picturePath: string, rect: Rect, page: number): Promise<Element> => {
    const el = await call<Element>('createElement', PluginCommAPI.createElement(TYPE_PICTURE));
    el.pageNum = page;
    el.layerNum = 0;
    el.picture = { picturePath, rect };
    return el;
  },

  /** A new stroke with its point and pressure data written native-side. */
  newStroke: async (opts: {
    page: number;
    penType: number;
    penColor: number;
    thickness: number;
    points: Array<{ x: number; y: number }>;
    /** One value for every point, or one per point. */
    pressure: number | number[];
  }): Promise<Element> => {
    const el = await call<Element>('createElement', PluginCommAPI.createElement(TYPE_STROKE));
    if (!el.stroke) {
      throw new SnApiError('createElement', null, 'stroke element without stroke data');
    }
    el.pageNum = opts.page;
    el.layerNum = 0;
    el.thickness = opts.thickness;
    el.stroke.penType = opts.penType;
    el.stroke.penColor = opts.penColor;
    const last = opts.points.length - 1;
    await el.stroke.points.setRange(0, last, opts.points);
    const pressures = Array.isArray(opts.pressure) ? opts.pressure : opts.points.map(() => opts.pressure as number);
    await el.stroke.pressures.setRange(0, last, pressures);
    return el;
  },

  /**
   * NOTE only: a picture on the current layer of the open note's current page, at the image's own
   * pixel size, centered (SPIKES.md R38). Movable/resizable with the lasso.
   */
  insertImage: (path: string) => callOk('insertImage', PluginNoteAPI.insertImage(path)),

  /** NOTE only; current page of the open note. */
  insertTextLink: async (spec: TextLinkSpec): Promise<void> => {
    const status = await call<number | boolean>('insertTextLink', PluginNoteAPI.insertTextLink(spec));
    if (status !== LINK_OK && status !== true) {
      throw new SnApiError('insertTextLink', null, `status ${String(status)}`);
    }
  },

  /** Release native-side caches for elements we created or read. */
  recycle: (elements: ReadonlyArray<Element>) => {
    for (const e of elements) {
      PluginCommAPI.recycleElement(e.uuid);
    }
  },
};
