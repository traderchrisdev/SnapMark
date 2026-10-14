// logcat: adb logcat -s ReactNativeJS  →  lines start with "[SnapMark]".

export function log(msg: string): void {
  console.log(`[SnapMark] ${msg}`);
}

export function logError(context: string, e: unknown): void {
  const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  console.log(`[SnapMark] ERROR ${context}: ${detail}`);
}
