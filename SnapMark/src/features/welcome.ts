// "Welcome to SnapMark": a four-page note that shows how to use it (assets/welcome-1..4.png, drawn by
// scripts/make-welcome.py at a Manta's page size and fitted to this device's). Offered once after a
// fresh install (ui/WelcomeScreen) and any time from SnapMark's settings. It lives in the snaps folder;
// if it's there already it is just opened, so a deleted one is made again.

import { Image } from 'react-native';
import { DOC_PACKAGE, NOTE_PACKAGE } from '../core/apps';
import { tmpDir } from '../core/paths';
import { snapsDir, type Settings } from '../core/settings';
import { log } from '../platform/log';
import { Native } from '../platform/native';
import { uprightScreenPx } from '../platform/screen';
import { fs } from '../sdk/fs';
import { UserFacingError } from '../sdk/errors';
import { Sn } from '../sdk/sn';
import { waitUntilCurrent } from '../sdk/wait';
import { whenNoteReady } from './capture';
import { ensureHopNote } from './snapPage';

export const WELCOME_NAME = 'Welcome to SnapMark';

/** How long Notes gets to come to the front. */
const SWITCH_TIMEOUT_MS = 6000;

/** The bundled page images, in order (file paths inside the installed plugin). */
function pageAssets(): string[] {
  return [
    require('../../assets/welcome-1.png'),
    require('../../assets/welcome-2.png'),
    require('../../assets/welcome-3.png'),
    require('../../assets/welcome-4.png'),
  ].map(a => Image.resolveAssetSource(a).uri.replace(/^file:\/\//, ''));
}

export function welcomeNotePath(settings: Settings): string {
  return `${snapsDir(settings)}/${WELCOME_NAME}.note`;
}

/**
 * Opens the welcome note, making it first if it isn't there. Works from the Settings app too (the
 * welcome screen after an install, Getting started): openFile is only allowed with NOTE or DOC in
 * front (102), so from elsewhere the note is opened through Android (Native.openFirstNote).
 */
export async function openWelcomeNote(settings: Settings): Promise<void> {
  const path = welcomeNotePath(settings);
  if (!(await fs.exists(path))) {
    await makeWelcomeNote(path);
  }
  await openInNotes(path);
  log(`welcome: opened ${path}`);
}

async function openInNotes(path: string): Promise<void> {
  const front = await Native.foreground().catch(() => null);
  if (front && (front.pkg === NOTE_PACKAGE || front.pkg === DOC_PACKAGE)) {
    await Sn.openFile(path, 0);
  } else if (!(await Native.openFirstNote([path])) || (await Native.waitForForeground(NOTE_PACKAGE, SWITCH_TIMEOUT_MS)) < 0) {
    throw new UserFacingError('Could not open Notes. Open any note, then try again.');
  }
  await waitUntilCurrent(path).catch(() => undefined);
}

async function makeWelcomeNote(path: string): Promise<void> {
  const pluginDir = await Sn.pluginDir();
  const tmp = tmpDir(pluginDir);
  await fs.makeDirs(tmp);
  await fs.makeDirs(path.slice(0, path.lastIndexOf('/')));
  // Templates are never scaled (R38): each page is fitted to this device's page first.
  const size = uprightScreenPx();
  const pages: string[] = [];
  for (const [i, src] of pageAssets().entries()) {
    const out = `${tmp}/welcome-${i + 1}.png`;
    await Native.letterbox(src, out, size.width, size.height);
    pages.push(out);
  }
  try {
    // createNote and insertNotePage need NOTE in front (R1): the helper note brings it.
    const hop = await ensureHopNote(pluginDir);
    await openInNotes(hop);
    await whenNoteReady(() => Sn.createNote(path, pages[0], true));
    for (let i = 1; i < pages.length; i++) {
      await Sn.insertNotePage(path, i, pages[i]);
    }
    log(`welcome: made ${path} (${pages.length} pages, ${size.width}x${size.height})`);
  } finally {
    for (const p of pages) {
      await fs.remove(p).catch(() => undefined);
    }
  }
}
