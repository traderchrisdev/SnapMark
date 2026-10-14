// "Export page as PNG" (NOTE toolbar, showType 0): the current page of the open note, flattened
// (page image + ink + links) onto white, saved to /sdcard/EXPORT/<title> - p<N>.png.

import { EXPORT_DIR, baseName, docTitle, exportPngCandidates, tmpDir } from '../core/paths';
import { StepTimer } from '../core/timer';
import { log, logError } from '../platform/log';
import { toast } from '../platform/toast';
import { UserFacingError } from '../sdk/errors';
import { fs } from '../sdk/fs';
import { Sn } from '../sdk/sn';
import { assertUnlocked, firstFreePath } from './files';

export async function exportCurrentPage(): Promise<void> {
  const t = new StepTimer();
  const [notePath, page, pluginDir] = await Promise.all([Sn.currentFilePath(), Sn.currentPage(), Sn.pluginDir()]);
  if (!/\.note$/i.test(notePath)) {
    throw new UserFacingError('Open a note to export a page.');
  }
  // generateNotePng reads the file, so write what's on screen first.
  await Sn.saveOpenNote().catch(e => logError('save before export', e));
  t.mark('save');

  const tmp = tmpDir(pluginDir);
  await fs.makeDirs(tmp);
  const png = `${tmp}/export-${Date.now()}.png`;
  try {
    await Sn.notePagePng(notePath, page, png);
    t.mark('render');
    await assertUnlocked(EXPORT_DIR);
    await fs.makeDirs(EXPORT_DIR);
    const out = await firstFreePath(exportPngCandidates(EXPORT_DIR, docTitle(notePath), page));
    await fs.copy(png, out);
    t.mark('copy');
    toast(`Exported to EXPORT/${baseName(out)}`);
    log(`export page ${page + 1} of ${notePath} -> ${out} | ${t.summary()}`);
  } finally {
    await fs.remove(png).catch(() => undefined);
  }
}
