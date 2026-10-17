// logcat: adb logcat -s ReactNativeJS  →  lines start with "[SnapMark]".
// The last lines are also kept in memory, so "Save a log file" in the settings can write them for
// someone without adb (features/saveLog).

const KEEP = 400;
const lines: string[] = [];

function keep(line: string): void {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  lines.push(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${line}`);
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
