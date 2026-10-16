// Collect mode: every snap becomes the next page of one "Snaps inbox" notebook.
// insertNotePage takes a custom image as the page template, but only with NOTE in front (R26). On the
// open inbox the page is added at file level and NOTE is made to reload (R47, R48).

import { log, logError } from '../platform/log';
import { Sn } from '../sdk/sn';
import { nativeDelay } from '../sdk/wait';

/**
 * NOTE must be in front with `inbox` open (see waitUntilCurrent). Appends a page whose template is
 * `template` and returns its index.
 */
export async function appendToOpenInbox(inbox: string, template: string): Promise<number> {
  // Flush NOTE's in-memory copy first so it can't later overwrite the file-level edit.
  await Sn.saveOpenNote().catch(e => logError('save inbox before append', e));
  const page = await Sn.noteTotalPages(inbox);
  await Sn.insertNotePage(inbox, page, template);
  return page;
}

/** Append without opening (inbox is not the open note): NOTE must still be in front. */
export async function appendToClosedInbox(inbox: string, template: string): Promise<number> {
  const page = await Sn.noteTotalPages(inbox);
  await Sn.insertNotePage(inbox, page, template);
  return page;
}

/**
 * NOTE reloads the open note by itself 0.2-0.7 s after each file-level edit, and drops a reload
 * request that arrives while that is still running ("isLoadCurrentLayersRunning", R78). So ours waits
 * until NOTE is idle again.
 */
const QUIET_MS = 1000;
const SETTLE_MS = 600;
const RETRY_MS = 400;
const ATTEMPTS = 6;

/**
 * After file-level edits to the open note: reload it, give NOTE a moment, and (unless `page` is null)
 * show that page. reloadFile may never answer (R48), so success is checked by the page NOTE reports.
 * Also used before leaving the note ("stay here") so NOTE drops its stale copy first.
 */
/** Make NOTE re-read the open file once it is idle after our edits (fire and forget, R48). */
export async function quietReload(): Promise<void> {
  await nativeDelay(QUIET_MS);
  Sn.reloadOpenFile();
}

export async function reloadAndShow(page: number | null): Promise<boolean> {
  await quietReload();
  await nativeDelay(SETTLE_MS);
  if (page === null) {
    return true;
  }
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const jumped = await Sn.jumpToPage(page).then(
      () => true,
      () => false,
    );
    await nativeDelay(RETRY_MS);
    if (jumped && (await Sn.currentPage().catch(() => -1)) === page) {
      log(`inbox: showing page ${page + 1} (attempt ${attempt})`);
      return true;
    }
  }
  log(`inbox: could not jump to page ${page + 1}`);
  return false;
}
