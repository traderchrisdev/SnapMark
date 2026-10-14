// Settings persisted as empty folders "<key>=<value>" in the plugin's private dir (see
// core/settings.ts for why folders, core/paths.ts settingsDir for why private). Loaded on every
// button press (one directory listing) so the settings screen and the buttons can never disagree.

import { baseName, settingsDir } from '../core/paths';
import { decodeSettings, encodeSetting, entryKey, type Settings } from '../core/settings';
import { fs } from '../sdk/fs';
import { Sn } from '../sdk/sn';
import { logError } from './log';

export async function storedSettingEntries(): Promise<string[]> {
  return (await fs.list(settingsDir(await Sn.pluginDir()))).map(baseName);
}

export async function loadSettings(): Promise<Settings> {
  try {
    return decodeSettings(await storedSettingEntries());
  } catch (e) {
    logError('load settings (using defaults)', e);
    return decodeSettings([]);
  }
}

export async function saveSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  const dir = settingsDir(await Sn.pluginDir());
  await fs.makeDirs(dir);
  for (const path of await fs.list(dir)) {
    if (entryKey(baseName(path)) === key) {
      await fs.removeDir(path);
    }
  }
  await fs.makeDirs(`${dir}/${encodeSetting(key, value)}`);
}
