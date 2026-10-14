import { NOTE_ROOT, SDCARD, parentDir } from '../core/paths';
import { UserFacingError } from '../sdk/errors';
import { fs } from '../sdk/fs';
import { Sn } from '../sdk/sn';
import { logError } from '../platform/log';

const LOCKED = 1;

/** First candidate path that doesn't exist yet. */
export async function firstFreePath(candidates: Iterable<string>): Promise<string> {
  for (const path of candidates) {
    if (!(await fs.exists(path))) {
      return path;
    }
  }
  throw new UserFacingError('Too many files with the same name. Rename or move some, then try again.');
}

/**
 * Fail early with a clear message if the destination (or its nearest existing parent) is an
 * encrypted folder that is locked; writing there fails with 1217 otherwise.
 */
export async function assertUnlocked(dir: string): Promise<void> {
  let existing = dir;
  while (existing.length > SDCARD.length && !(await fs.exists(existing))) {
    existing = parentDir(existing);
  }
  const status = await Sn.encryptionStatus(existing).catch(e => {
    logError('encryption status (assuming unlocked)', e);
    return 0;
  });
  if (status === LOCKED) {
    const shown = existing.startsWith(NOTE_ROOT) ? `Note${existing.slice(NOTE_ROOT.length)}` : existing;
    throw new UserFacingError(`${shown} is encrypted and locked. Unlock it in Files, then try again.`);
  }
}
