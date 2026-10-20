// "Paste queued snaps" (Notes toolbar): everything in the capture queue (queueStore.ts) goes onto the
// page of the note you're working in, oldest first, each below the last (a new page when the page is
// full), with its ink (read now, with NOTE in front, any page, R80), its link or caption and its
// keyword. Each pasted snap leaves the queue; one that fails stays for the next try. Undo last snap
// takes the whole batch back.

import { baseName, hopNotePath, samePath, tmpDir } from '../core/paths';
import type { Settings } from '../core/settings';
import { log, logError } from '../platform/log';
import { toast } from '../platform/toast';
import { UserFacingError } from '../sdk/errors';
import { Sn } from '../sdk/sn';
import { openNotePath, placeOnPage, removeCaptures, type Pasted } from './capture';
import { cutPath, dropQueued, queuedSnaps, renderPath, type QueuedSnap } from './queueStore';
import { readHandwriting } from './snapPage';
import { regionInk } from './snapRegion';
import { endBatch, startBatch } from './undo';

function pastedOf(q: QueuedSnap): Pasted {
  const ink = q.ink;
  const doc = q.doc;
  return {
    path: cutPath(q),
    width: q.width,
    height: q.height,
    keyword: q.keyword ?? undefined,
    ink:
      ink && doc
        ? async (dst, noteSize) =>
            regionInk(await readHandwriting(doc.docPath, doc.page, ink.highlightStyle), renderPath(q), ink.crop, dst, noteSize, ink.frames)
        : undefined,
  };
}

/** NOTE in front with a note open. */
export async function pasteQueue(settings: Settings, pluginDir: string): Promise<void> {
  const queue = await queuedSnaps(pluginDir);
  if (!queue.length) {
    toast('No snaps queued. On the region screen, box a part and tap Queue.');
    return;
  }
  const notePath = await openNotePath();
  if (samePath(notePath, hopNotePath())) {
    throw new UserFacingError('Open the note to paste into, then tap Paste queued snaps again.');
  }
  let page = await Sn.currentPage();
  let pasted = 0;
  startBatch();
  try {
    for (const q of queue) {
      try {
        const placed = await placeOnPage(notePath, page, pastedOf(q), q.doc, q.caption, settings, tmpDir(pluginDir));
        page = placed.page;
        pasted++;
        await dropQueued(q).catch(e => logError('queue: remove a pasted snap', e));
      } catch (e) {
        logError(`queue: paste ${baseName(q.dir)} (kept in the queue)`, e);
        break;
      }
    }
  } finally {
    endBatch();
    await removeCaptures(pluginDir);
  }
  const left = queue.length - pasted;
  log(`queue: pasted ${pasted} of ${queue.length} into ${notePath}, last on page ${page + 1}`);
  if (left) {
    toast(`Pasted ${pasted} of ${queue.length}; ${left} still queued (see the log).`, true);
  } else {
    toast(`Pasted ${pasted} queued snap${pasted === 1 ? '' : 's'}.`);
  }
}
