// Settings persisted as empty folders "<key>=<value>" in the plugin's private dir (see
// core/settings.ts for why folders, core/paths.ts settingsDir for why private). Loaded on every
// button press (one directory listing) so the settings screen and the buttons can never disagree.
// The floating button reads the in-memory copy instead: it may run while an app is in front where
// SDK calls fail or never answer (SPIKES.md R64). The settings screen shares this JS context, so
// saving keeps the copy current.

import { baseName, settingsDir } from '../core/paths';
import { decodeSettings, encodeSetting, entryKey, type Settings } from '../core/settings';
import { fs } from '../sdk/fs';
import { Sn } from '../sdk/sn';
import { logError } from './log';

export async function storedSettingEntries(): Promise<string[]> {
  return (await fs.list(settingsDir(await Sn.pluginDir()))).map(baseName);
}

let cached: Settings = decodeSettings([]);

/** The settings as last loaded or saved, without touching the disk. */
export function cachedSettings(): Settings {
  return cached;
}

export async function loadSettings(): Promise<Settings> {
  try {
    cached = decodeSettings(await storedSettingEntries());
  } catch (e) {
    logError('load settings (using defaults)', e);
    cached = decodeSettings([]);
  }
  return cached;
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
  cached = { ...cached, [key]: value };
}
