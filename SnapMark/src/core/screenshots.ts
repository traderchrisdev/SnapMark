// Native Supernote screenshots: /sdcard/SCREENSHOT/YYYYMMDD_HHMMSS.png, full panel resolution
// (SPIKES.md R17, R39). The SDK lists paths without dates, so time comes from the name.

export interface Screenshot {
  path: string;
  /** Local time from the file name, or null for files not named by the system. */
  takenAt: Date | null;
}

const NATIVE_NAME = /(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.png$/i;

export function parseScreenshotTime(path: string): Date | null {
  const m = NATIVE_NAME.exec(path);
  if (!m) {
    return null;
  }
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  const date = new Date(y, mo - 1, d, h, mi, s);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** PNGs, newest first; files without a system timestamp go last, by name. */
export function newestFirst(paths: ReadonlyArray<string>): Screenshot[] {
  return paths
    .filter(p => /\.png$/i.test(p))
    .map(path => ({ path, takenAt: parseScreenshotTime(path) }))
    .sort((a, b) => {
      if (a.takenAt && b.takenAt) {
        return b.takenAt.getTime() - a.takenAt.getTime();
      }
      if (a.takenAt || b.takenAt) {
        return a.takenAt ? -1 : 1;
      }
      return b.path.localeCompare(a.path);
    });
}

/** freshMinutes 0 means "never fresh" (always pick). */
export function isFresh(shot: Screenshot, now: Date, freshMinutes: number): boolean {
  if (!shot.takenAt || freshMinutes <= 0) {
    return false;
  }
  const age = now.getTime() - shot.takenAt.getTime();
  return age >= -60_000 && age <= freshMinutes * 60_000;
}

/** "just now", "5 min ago", "3 h ago", or a date for older shots. */
export function describeAge(shot: Screenshot, now: Date): string {
  if (!shot.takenAt) {
    return '';
  }
  const minutes = Math.round((now.getTime() - shot.takenAt.getTime()) / 60_000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  if (minutes < 24 * 60) {
    return `${Math.round(minutes / 60)} h ago`;
  }
  const d = shot.takenAt;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
