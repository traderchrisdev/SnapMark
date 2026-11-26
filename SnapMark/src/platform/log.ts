// logcat: adb logcat -s ReactNativeJS  →  lines start with "[SnapMark]".
// The last lines are also kept in memory, so "Save a log file" in the settings can write them for
// someone without adb (features/saveLog), and in a file (native appendLog), so a crash that ends the
// process still leaves the lines before it (R92).

import { Native } from './native';

const KEEP = 400;
const lines: string[] = [];

function keep(line: string): void {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamped = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${line}`;
  lines.push(stamped);
  Native.appendLog(stamped);
  if (lines.length > KEEP) {
    lines.splice(0, lines.length - KEEP);
  }
}

export function log(msg: string): void {
  console.log(`[SnapMark] ${msg}`);
  keep(msg);
}

export function logError(context: string, e: unknown): void {
  const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  console.log(`[SnapMark] ERROR ${context}: ${detail}`);
  keep(`ERROR ${context}: ${detail}`);
}

/** The kept lines, oldest first. */
export function recentLog(): string[] {
  return [...lines];
}
