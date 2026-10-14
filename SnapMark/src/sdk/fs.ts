// File operations, via sn-plugin-lib's undocumented FileUtils. Only the methods proven safe from a
// showType:0 button are exposed (SPIKES.md R14/R19). Never call FileUtils.getExternalDirPath:
// it throws a native NPE without an Activity and PluginHost then kills the plugin (R2).
// Deleting under /sdcard without FILE:DELETE is just as fatal (native SecurityException, R43), so
// deletes are refused in JS unless the path is in the plugin's private dir.

import { FileUtils } from 'sn-plugin-lib';
import { SDCARD, isPrivatePath, parentDir } from '../core/paths';
import { SnApiError } from './errors';

export const fs = {
  exists: async (path: string): Promise<boolean> => (await FileUtils.exists(path)) === true,

  /** mkdir -p, starting below /storage/emulated/0 (or the plugin dir for private paths). */
  makeDirs: async (dir: string): Promise<void> => {
    const missing: string[] = [];
    for (let d = dir; d.length > 1 && d !== SDCARD && !(await fs.exists(d)); d = parentDir(d)) {
      missing.unshift(d);
    }
    for (const d of missing) {
      if (!(await FileUtils.makeDir(d))) {
        throw new SnApiError('FileUtils.makeDir', null, d);
      }
    }
  },

  copy: async (src: string, dest: string): Promise<void> => {
    if (!(await FileUtils.copyFile(src, dest))) {
      throw new SnApiError('FileUtils.copyFile', null, `${src} -> ${dest}`);
    }
  },

  /** Private dir only (see header). */
  remove: async (path: string): Promise<void> => {
    assertPrivate('FileUtils.deleteFile', path);
    await FileUtils.deleteFile(path);
  },

  /** Private dir only (see header). */
  removeDir: async (path: string): Promise<void> => {
    assertPrivate('FileUtils.deleteDir', path);
    await FileUtils.deleteDir(path);
  },

  /** Typed as string[] in the SDK, but returns [{type, path}] on device (R19); accept both. */
  list: async (dir: string): Promise<string[]> => {
    if (!(await fs.exists(dir))) {
      return []; // listFiles throws "Dir is not exists"
    }
    const raw: unknown = await FileUtils.listFiles(dir);
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw
      .map((e: unknown) =>
        typeof e === 'string' ? e : typeof e === 'object' && e !== null && 'path' in e ? String((e as { path: unknown }).path) : '',
      )
      .filter(p => p.length > 0);
  },
};

function assertPrivate(api: string, path: string): void {
  if (!isPrivatePath(path)) {
    throw new SnApiError(api, null, `refusing to delete outside the plugin's private dir: ${path}`);
  }
}
