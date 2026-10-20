// "Notes for this page" (PDF/EPUB toolbar): one note per document page, for writing more than its
// margins hold. The first time, it is made like a margin-mode snap (the page shrunk at the top left,
// your ink, the ↩ link back and its keyword, room beside and below); after that the same button opens
// it again, on its last page. Found by its name, "<title> - p<N> notes", in the document's snaps
// folder: a renamed or moved one isn't found, and a new one is made.

import { docTitle, isDocumentPath, pageNotesPath } from '../core/paths';
import { MARGIN_CHOICES } from '../core/margin';
import { snapsDir, type Settings } from '../core/settings';
import { log } from '../platform/log';
import { toast } from '../platform/toast';
import { UserFacingError } from '../sdk/errors';
import { fs } from '../sdk/fs';
import { Sn } from '../sdk/sn';
import { waitUntilCurrent } from '../sdk/wait';
import { snapPage } from './snapPage';

/** The page's size in a new page-notes note, unless margin mode already has one chosen. */
const PAGE_NOTES_MARGIN: (typeof MARGIN_CHOICES)[number] = 66;

export async function notesForPage(settings: Settings): Promise<void> {
  const [docPath, page] = await Promise.all([Sn.currentFilePath(), Sn.currentPage()]);
  if (!isDocumentPath(docPath)) {
    throw new UserFacingError('Open a PDF or EPUB page first.');
  }
  const path = pageNotesPath(snapsDir(settings), docTitle(docPath), page);
  if (await fs.exists(path)) {
    await Sn.openFile(path, -1);
    await waitUntilCurrent(path).catch(() => undefined);
    log(`page notes: opened ${path}`);
    return;
  }
  log(`page notes: making ${path}`);
  toast(`Making your notes for p. ${page + 1}…`);
  await snapPage(
    { ...settings, destination: 'note', afterSnap: 'open', marginPercent: settings.marginPercent || PAGE_NOTES_MARGIN },
    { notePath: path },
  );
}
