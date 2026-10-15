// Typed errors for everything that goes through sn-plugin-lib.

/** PluginHost: "This app is not allowed to use this API" — the API isn't allowed in the app on top (SPIKES.md R1/R37). */
export const CODE_NOT_ALLOWED_HERE = 102;
/**
 * PluginHost: "The handwriting app is not open, so related APIs cannot be called". Another app is in
 * front, or NOTE was just brought to the front and calls aren't routed to it yet (SPIKES.md R64, R65).
 */
export const CODE_NOTE_NOT_READY = 118;
/** Target path is encrypted and locked. */
export const CODE_ENCRYPTED_LOCKED = 1217;
/** Write / read API called without FILE:WRITE / FILE:READ. */
export const CODE_NO_WRITE_PERMISSION = 1501;
export const CODE_NO_READ_PERMISSION = 1503;

export class SnApiError extends Error {
  constructor(
    readonly api: string,
    readonly code: number | null,
    detail: string,
  ) {
    super(`${api} failed${code === null ? '' : ` [${code}]`}: ${detail}`);
    this.name = 'SnApiError';
  }
}

/** A problem the user can act on; its message is shown as-is in a toast. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

export function errorCode(e: unknown): number | null {
  return e instanceof SnApiError ? e.code : null;
}

/** Short, human message for a toast. */
export function describeError(e: unknown): string {
  if (e instanceof UserFacingError) {
    return e.message;
  }
  switch (errorCode(e)) {
    case CODE_ENCRYPTED_LOCKED:
      return 'The destination folder is encrypted and locked.';
    case CODE_NO_READ_PERMISSION:
    case CODE_NO_WRITE_PERMISSION:
      return 'SnapMark has no file access. Allow it in Settings → Apps → Plugins.';
    case CODE_NOT_ALLOWED_HERE:
      return 'The system refused this step in the current app. Please try again.';
    case CODE_NOTE_NOT_READY:
      return 'The Notes app was not ready. Please try again.';
    default:
      return e instanceof Error ? e.message : String(e);
  }
}
