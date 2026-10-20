// Button registration and dispatch.

import { PluginManager } from 'sn-plugin-lib';
import { latestScreenshot, type ShotAction } from './features/annotateScreenshot';
import { captureFromBubble, startBubble } from './features/bubble';
import { exportCurrentPage } from './features/exportPng';
import { snapPage } from './features/snapPage';
import { snapRegion } from './features/snapRegion';
import { notesForPage } from './features/pageNotes';
import { pasteQueue } from './features/queuePaste';
import { undoLastSnap } from './features/undo';
import { log, logError } from './platform/log';
import { hasFilePermissions } from './platform/permissions';
import { loadSettings, storedSettingEntries } from './platform/settingsStore';
import { toast } from './platform/toast';
import { describeError } from './sdk/errors';
import { Sn } from './sdk/sn';
import { setRoute } from './ui/route';

const TOOLBAR = 1;
const SHOW_NO_UI = 0;

/** Stable once shipped: PluginHost keys toolbar placement on these ids. */
const BUTTON_SNAP_PAGE = 1;
const BUTTON_ANNOTATE_SCREENSHOT = 2;
const BUTTON_EXPORT_PNG = 3;
const BUTTON_INSERT_SCREENSHOT = 4;
const BUTTON_SNAP_REGION = 5;
const BUTTON_UNDO_SNAP = 6;
const BUTTON_PASTE_QUEUE = 7;
const BUTTON_PAGE_NOTES = 8;
const BUTTONS = new Set([BUTTON_SNAP_PAGE, BUTTON_ANNOTATE_SCREENSHOT, BUTTON_EXPORT_PNG, BUTTON_INSERT_SCREENSHOT, BUTTON_SNAP_REGION, BUTTON_UNDO_SNAP, BUTTON_PASTE_QUEUE, BUTTON_PAGE_NOTES]);

// One run at a time, from the toolbar buttons or the floating button. A run whose native call never
// answers must not lock them forever.
const STUCK_AFTER_MS = 60000;
let runningSince: number | null = null;

async function run(id: number): Promise<void> {
  // First run, or access removed in Settings: explain and ask from a visible screen (the system dialog
  // may not be able to show over a button with no UI). The user taps the button again afterwards.
  if (!(await hasFilePermissions())) {
    setRoute({ name: 'permission' });
    await PluginManager.showPluginView();
    return;
  }
  const settings = await loadSettings();
  switch (id) {
    case BUTTON_SNAP_PAGE:
      await snapPage(settings);
      return;
    case BUTTON_SNAP_REGION:
      await snapRegion(settings);
      return;
    case BUTTON_EXPORT_PNG:
      await exportCurrentPage();
      return;
    case BUTTON_UNDO_SNAP:
      await undoLastSnap();
      return;
    case BUTTON_PASTE_QUEUE:
      await pasteQueue(settings, await Sn.pluginDir());
      return;
    case BUTTON_PAGE_NOTES:
      await notesForPage(settings);
      return;
    case BUTTON_ANNOTATE_SCREENSHOT:
    case BUTTON_INSERT_SCREENSHOT: {
      const action: ShotAction = id === BUTTON_INSERT_SCREENSHOT ? 'insert' : 'annotate';
      const r = await latestScreenshot(settings, action);
      if (r.kind === 'pick') {
        setRoute({ name: 'picker', shots: r.shots, action });
        await PluginManager.showPluginView();
      }
      return;
    }
  }
}

async function exclusive(label: string, task: () => Promise<void>): Promise<void> {
  if (runningSince !== null && Date.now() - runningSince < STUCK_AFTER_MS) {
    toast('Still working on the last snap…');
    return;
  }
  runningSince = Date.now();
  try {
    await task();
  } catch (e) {
    logError(label, e);
    toast(`Snap failed: ${describeError(e)}`, true);
  } finally {
    runningSince = null;
  }
}

async function onPress(id: number): Promise<void> {
  if (BUTTONS.has(id)) {
    await exclusive(`button ${id}`, () => run(id));
  }
}

export interface Icons {
  snapPage: string;
  snapRegion: string;
  annotateScreenshot: string;
  exportPng: string;
  insertScreenshot: string;
  undoSnap: string;
  pasteQueue: string;
  pageNotes: string;
}

export async function startPlugin(icons: Icons): Promise<void> {
  const snap = await PluginManager.registerButton(TOOLBAR, ['DOC'], {
    id: BUTTON_SNAP_PAGE,
    name: 'Snap page',
    icon: icons.snapPage,
    showType: SHOW_NO_UI,
  });
  const region = await PluginManager.registerButton(TOOLBAR, ['DOC'], {
    id: BUTTON_SNAP_REGION,
    name: 'Snap region',
    icon: icons.snapRegion,
    showType: SHOW_NO_UI,
  });
  const notes = await PluginManager.registerButton(TOOLBAR, ['DOC'], {
    id: BUTTON_PAGE_NOTES,
    name: 'Notes for this page',
    icon: icons.pageNotes,
    showType: SHOW_NO_UI,
  });
  const shot = await PluginManager.registerButton(TOOLBAR, ['NOTE'], {
    id: BUTTON_ANNOTATE_SCREENSHOT,
    name: 'Annotate screenshot',
    icon: icons.annotateScreenshot,
    showType: SHOW_NO_UI,
  });
  const exp = await PluginManager.registerButton(TOOLBAR, ['NOTE'], {
    id: BUTTON_EXPORT_PNG,
    name: 'Export page as PNG',
    icon: icons.exportPng,
    showType: SHOW_NO_UI,
  });
  const ins = await PluginManager.registerButton(TOOLBAR, ['NOTE'], {
    id: BUTTON_INSERT_SCREENSHOT,
    name: 'Insert screenshot',
    icon: icons.insertScreenshot,
    showType: SHOW_NO_UI,
  });
  const undo = await PluginManager.registerButton(TOOLBAR, ['NOTE'], {
    id: BUTTON_UNDO_SNAP,
    name: 'Undo last snap',
    icon: icons.undoSnap,
    showType: SHOW_NO_UI,
  });
  const queue = await PluginManager.registerButton(TOOLBAR, ['NOTE'], {
    id: BUTTON_PASTE_QUEUE,
    name: 'Paste queued snaps',
    icon: icons.pasteQueue,
    showType: SHOW_NO_UI,
  });
  log(
    `registered "Snap page": ${String(snap)}, "Snap region": ${String(region)}, "Annotate screenshot": ${String(shot)}, ` +
      `"Export page as PNG": ${String(exp)}, "Insert screenshot": ${String(ins)}, "Undo last snap": ${String(undo)}, "Paste queued snaps": ${String(queue)}, "Notes for this page": ${String(notes)}`,
  );
  // Shows whether settings survived a plugin update (they live in the plugin's private dir).
  storedSettingEntries().then(
    entries => log(`stored settings: ${entries.length ? entries.join(', ') : '(none, using defaults)'}`),
    e => logError('read settings', e),
  );
  const settings = await loadSettings(); // also fills the in-memory copy the floating button reads
  startBubble(() => {
    exclusive('bubble', captureFromBubble).catch(e => logError('bubble', e));
  }, settings.bubble).catch(e => logError('start bubble', e));
  PluginManager.registerButtonListener({
    onButtonPress(event) {
      onPress(event.id).catch(e => logError('button', e));
    },
  });

  // Settings live behind the config button (Settings → Apps → Plugins → SnapMark).
  await PluginManager.registerConfigButton();
  PluginManager.registerConfigButtonListener({
    onClick() {
      setRoute({ name: 'settings' });
      PluginManager.showPluginView().catch(e => logError('show settings', e));
    },
  });
}
