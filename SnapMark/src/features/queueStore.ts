// The capture queue's storage: boxes kept while you read, pasted together into your note later
// (queuePaste.ts). Each lives in its own folder in the plugin's private dir, so the queue survives a
// restart or an update: the cut-out (cut.png), the page render its underlines are measured on
// (render.png, documents only) and item.json. The ink is not stored: it is read when the queue is
// pasted, with NOTE in front (any page, R80), so it is what the page has then.

import type { Rect } from '../core/backlink';
import type { HighlightStyle } from '../core/highlights';
import type { DocFrames } from '../core/margin';
import { log, logError } from '../platform/log';
import { Native } from '../platform/native';
import { fs } from '../sdk/fs';
import type { DocPage } from './annotateScreenshot';

export interface QueuedSnap {
  /** Its folder (named by the time it was queued, so the folders sort in queue order). */
  dir: string;
  takenAt: number;
  width: number;
  height: number;
  doc: DocPage | null;
  /** From another app: where and when (as a paste's caption). */
  caption: string | null;
  /** "Book p. N" for search (searchable snaps). */
  keyword: string | null;
  /** The box in the ink frame NOTE reads the page's ink in (inNote), for the ink; null: none to add. */
  ink: { crop: Rect; frames: DocFrames; highlightStyle: HighlightStyle } | null;
}

export function queueDir(pluginDir: string): string {
  return `${pluginDir}/queue`;
}

export const cutPath = (q: QueuedSnap) => `${q.dir}/cut.png`;
export const renderPath = (q: QueuedSnap) => `${q.dir}/render.png`;

/** Keep the cut-out (and the render, for a document) at the end of the queue. Returns the queue's length. */
export async function enqueue(pluginDir: string, cut: string, render: string | null, item: Omit<QueuedSnap, 'dir'>): Promise<number> {
  const dir = `${queueDir(pluginDir)}/${item.takenAt}`;
  await fs.makeDirs(dir);
  const q: QueuedSnap = { ...item, dir };
  await fs.copy(cut, cutPath(q));
  if (render) {
    await fs.copy(render, renderPath(q));
  }
  await Native.writeText(`${dir}/item.json`, JSON.stringify(item));
  const n = (await queuedSnaps(pluginDir)).length;
  log(`queue: added ${item.doc ? `p. ${item.doc.page + 1}` : item.caption ?? 'a capture'} (${n} waiting)`);
  return n;
}

function valid(x: unknown): x is Omit<QueuedSnap, 'dir'> {
  const o = x as Partial<QueuedSnap> | null;
  return !!o && typeof o.takenAt === 'number' && typeof o.width === 'number' && typeof o.height === 'number';
}

/** The queue, oldest first. A folder that can't be read is skipped (and left for Clear). */
export async function queuedSnaps(pluginDir: string): Promise<QueuedSnap[]> {
  const dirs = (await fs.list(queueDir(pluginDir))).sort();
  const out: QueuedSnap[] = [];
  for (const dir of dirs) {
    try {
      const item: unknown = JSON.parse(await Native.readText(`${dir}/item.json`));
      if (valid(item)) {
        out.push({ ...item, dir });
      }
    } catch (e) {
      logError(`queue: unreadable ${dir} (skipped)`, e);
    }
  }
  return out;
}

export async function dropQueued(q: QueuedSnap): Promise<void> {
  await fs.removeDir(q.dir);
}

export async function clearQueue(pluginDir: string): Promise<void> {
  await fs.removeDir(queueDir(pluginDir)).catch(() => undefined);
  log('queue: cleared');
}
