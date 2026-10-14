// Blank-note pool in the plugin's private dir (see core/paths poolBlankPath for why).

import { parentDir, poolBlankPath } from '../core/paths';
import { logError } from '../platform/log';
import { fs } from '../sdk/fs';
import { Sn } from '../sdk/sn';

/** "style_white" is the plain system template on every device (getNoteSystemTemplates). */
export const BLANK_TEMPLATE = 'style_white';

/** A fresh blank for this orientation, or null if the pool is empty (first snap ever). */
export async function pooledBlank(pluginDir: string, isPortrait: boolean): Promise<string | null> {
  const path = poolBlankPath(pluginDir, isPortrait);
  return (await fs.exists(path)) ? path : null;
}

/** NOTE must be in front (createNote is refused in DOC). Never throws: a missing blank only means a slower next snap. */
export async function refillPool(pluginDir: string): Promise<void> {
  for (const isPortrait of [true, false]) {
    const path = poolBlankPath(pluginDir, isPortrait);
    try {
      if (!(await fs.exists(path))) {
        await fs.makeDirs(parentDir(path));
        await Sn.createNote(path, BLANK_TEMPLATE, isPortrait);
      }
    } catch (e) {
      logError(`refill pool (${isPortrait ? 'portrait' : 'landscape'})`, e);
    }
  }
}
