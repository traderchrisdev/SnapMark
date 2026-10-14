import { PluginManager } from 'sn-plugin-lib';
import { log } from './log';

const READ = 'plugin.permission.FILE:READ';
const WRITE = 'plugin.permission.FILE:WRITE';
const GRANTED = 1;
const ANSWER_DENIED = 0;
const ANSWER_ONCE = 1;
const ANSWER_ALWAYS = 2;

/** Shown by the system only on the "go to Settings" prompt after an earlier "Don't allow". */
const SETTINGS_PROMPT = 'SnapMark saves snaps to your Note folder and reads screenshots. Allow file access for SnapMark.';

export type PermissionAnswer = 'always' | 'once' | 'denied' | 'cancelled';

/** Cheap; checked on every tap. "Allow this time only" expires when the plugin stops. */
export async function hasFilePermissions(): Promise<boolean> {
  for (const p of [READ, WRITE]) {
    if ((await PluginManager.hasPermission(p)) !== GRANTED) {
      return false;
    }
  }
  return true;
}

/**
 * Ask for READ then WRITE. Called from the permission screen (plugin UI visible), so the system
 * dialog has a window to show over. The weakest answer wins.
 */
export async function requestFilePermissions(): Promise<PermissionAnswer> {
  let result: PermissionAnswer = 'always';
  for (const p of [READ, WRITE]) {
    if ((await PluginManager.hasPermission(p)) === GRANTED) {
      continue;
    }
    const answer = await PluginManager.requestPermission(p, SETTINGS_PROMPT);
    log(`requestPermission(${p}) -> ${answer}`);
    if (answer === ANSWER_DENIED) {
      return 'denied';
    }
    if (answer !== ANSWER_ONCE && answer !== ANSWER_ALWAYS) {
      return 'cancelled';
    }
    if (answer === ANSWER_ONCE) {
      result = 'once';
    }
  }
  return result;
}
