// Every filesystem path SnapMark uses is built here; nothing else spells out /storage/emulated/0.
// Pure functions only (no SDK imports) so they can be unit-tested.

export const SDCARD = '/storage/emulated/0';
export const NOTE_ROOT = `${SDCARD}/Note`;
export const DEFAULT_SNAPS_FOLDER = 'Snaps';
export const DEFAULT_SNAPS_DIR = `${NOTE_ROOT}/${DEFAULT_SNAPS_FOLDER}`;
export const SCREENSHOT_DIR = `${SDCARD}/SCREENSHOT`;
export const EXPORT_DIR = `${SDCARD}/EXPORT`;
/** SnapMark's shared data (the helper note), independent of the user's snaps folder. */
export const APP_DATA_DIR = `${NOTE_ROOT}/.snapmark`;
export const SCREENSHOTS_SUBFOLDER = 'Screenshots';

const MAX_TITLE = 60;
const MAX_SUFFIX = 99;

/**
 * Fallback only (empty pool): a blank note opened for a moment to bring NOTE to the front, because
 * PluginHost refuses createNote while DOC is on top (SPIKES.md R1/R24). It shows in Recent Files (R46).
 */
export function hopNotePath(): string {
  return `${APP_DATA_DIR}/hop.note`;
}

/**
 * The same job, but a note made on this device by createNote (R79: the bundled one was made on a
 * Manta, and a Nomad shows another device's note with its toolbar on top). Preferred once it exists.
 */
export function nativeHopPath(): string {
  return `${APP_DATA_DIR}/blank.note`;
}

/** The snaps root for a folder setting such as "Snaps" or "Reading/Snaps" (always under Note/). */
export function snapsDirFor(folder: string): string {
  return `${NOTE_ROOT}/${folder}`;
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * Settings live in the plugin's private dir: changing one means deleting its old entry, and deleting
 * anything under /sdcard needs FILE:DELETE, which SnapMark doesn't ask for (SPIKES.md R43).
 */
export function settingsDir(pluginDir: string): string {
  return `${pluginDir}/settings`;
}

/** Paths the plugin may delete without FILE:DELETE: its own private dir. */
export const PRIVATE_ROOTS = [
  '/data/user/0/com.ratta.supernote.pluginhost/files/plugins/',
  '/data/data/com.ratta.supernote.pluginhost/files/plugins/',
];

export function isPrivatePath(path: string): boolean {
  return PRIVATE_ROOTS.some(root => path.startsWith(root)) && !path.includes('/../');
}

/**
 * Blank notes made by createNote in the plugin's private dir, one per orientation. A snap copies one
 * out (copies keep their FILE_ID, so each blank is used once, R49) and a fresh one is made while NOTE
 * is in front. The private dir isn't indexed or synced, and deleting there needs no FILE:DELETE.
 */
export function poolBlankPath(pluginDir: string, isPortrait: boolean): string {
  return `${pluginDir}/pool/blank-${isPortrait ? 'portrait' : 'landscape'}.note`;
}

export function tmpDir(pluginDir: string): string {
  return `${pluginDir}/tmp`;
}

export function tmpRenderPath(pluginDir: string, now: Date): string {
  return `${tmpDir(pluginDir)}/render-${now.getTime()}.png`;
}

/** Metro puts non-image assets in raw/<resource name>.<ext> inside the installed plugin dir. */
export function bundledRawAssetPath(pluginDir: string, resourceName: string, ext: string): string {
  return `${pluginDir}/raw/${resourceName}.${ext}`;
}

export function parentDir(path: string): string {
  const i = path.lastIndexOf('/');
  return i > 0 ? path.slice(0, i) : '/';
}

/** /sdcard/... and /storage/emulated/0/... name the same file. */
export function samePath(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (p: string) => p.replace(/^\/sdcard\//, `${SDCARD}/`).replace(/\/+/g, '/');
  return !!a && !!b && norm(a) === norm(b);
}

/** Make a string safe as a file or folder name on device and on synced desktops. */
export function sanitizeName(raw: string, maxLength: number = MAX_TITLE): string {
  const cleaned = raw
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');
  const chars = Array.from(cleaned); // never split a surrogate pair
  const cut = chars.length > maxLength ? chars.slice(0, maxLength).join('').trimEnd() : cleaned;
  return cut || 'Untitled';
}

/** Document file name without folder or extension, made safe for paths. */
export function docTitle(docPath: string): string {
  const file = docPath.slice(docPath.lastIndexOf('/') + 1);
  const dot = file.lastIndexOf('.');
  return sanitizeName(dot > 0 ? file.slice(0, dot) : file);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DD HHmm" in local time. */
export function formatStamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/**
 * "<dir>/<Title> - p<N> - <stamp>.note", then " (2)", " (3)"... for snaps in the same minute.
 * page is 0-based; the name uses the 1-based page number people see.
 */
export function snapNoteCandidates(dir: string, title: string, page: number, stamp: string): Generator<string> {
  return numberedNoteCandidates(dir, `${title} - p${page + 1} - ${stamp}`);
}

/** "<dir>/<source> - <stamp>.note" ("Screenshot" when the source is unknown), then " (2)"... */
export function screenshotNoteCandidates(dir: string, stamp: string, source = 'Screenshot'): Generator<string> {
  return numberedNoteCandidates(dir, `${source} - ${stamp}`);
}

/** Where a floating-button capture came from. page is 0-based. */
export type CaptureSource = { kind: 'doc'; path: string; page: number } | { kind: 'note'; path: string } | { kind: 'app'; label: string };

/** " - YYYY-MM-DD HHmm" and an optional " (N)" at the end of a SnapMark note name. */
const STAMP_SUFFIX = / - \d{4}-\d{2}-\d{2} \d{4}(?: \(\d+\))?$/;

/** What a capture's note is named after: "<Book> - p<N>", the note's title, or the app's name. */
export function captureSourceName(source: CaptureSource): string {
  switch (source.kind) {
    case 'doc':
      return `${docTitle(source.path)} - p${source.page + 1}`;
    case 'note':
      // A capture taken in a capture note: don't stack timestamps ("eBiblia - <time> - <time>").
      return docTitle(source.path).replace(STAMP_SUFFIX, '') || 'Screenshot';
    case 'app':
      return source.label.trim() ? sanitizeName(source.label) : 'Screenshot';
  }
}

/** "<dir>/<Title> - p<N>.png", then " (2)"... page is 0-based. */
export function exportPngCandidates(dir: string, title: string, page: number): Generator<string> {
  return numberedCandidates(dir, `${title} - p${page + 1}`, 'png');
}

function numberedNoteCandidates(dir: string, base: string): Generator<string> {
  return numberedCandidates(dir, base, 'note');
}

function* numberedCandidates(dir: string, base: string, ext: string): Generator<string> {
  yield `${dir}/${base}.${ext}`;
  for (let n = 2; n <= MAX_SUFFIX; n++) {
    yield `${dir}/${base} (${n}).${ext}`;
  }
}

/**
 * A user-typed folder under Note/ ("Reading / Snaps") made safe: each segment sanitized, empty
 * and dot-only segments dropped. null if nothing usable is left.
 */
export function sanitizeFolder(input: string): string | null {
  const segments = input
    .split('/')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !/^\.+$/.test(s))
    .map(s => sanitizeName(s, 40));
  return segments.length ? segments.join('/') : null;
}

const DOC_EXTENSIONS = /\.(pdf|epub|cbz|xps|fb2)$/i;

export function isDocumentPath(path: string): boolean {
  return DOC_EXTENSIONS.test(path);
}
