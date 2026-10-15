// Floating capture button (SPIKES.md §1l). A bubble over every app: a tap captures the screen and,
// by default, shows it so the user can drag a box over the part to keep (ui/RegionScreen). The cut-out
// (or the whole screen, shrunk clear of NOTE's toolbar) then becomes a note, see features/capture.
//
// Until NOTE is in front only native calls are made: in other apps the SDK fails (118) or never
// answers (Ratta Settings), R64. Settings and the plugin dir come from memory for the same reason.
// The one exception is DOC, which answers like it does for Snap page. There the button works like
// "Snap region" (or "Snap page" with "Whole screen right away"): the cut comes from a clean render of
// the page and your ink stays editable, instead of being flattened into a picture of the screen.

import { DeviceEventEmitter } from 'react-native';
import { classifyApp, DOC_PACKAGE } from '../core/apps';
import { fitInsetsDp } from '../core/fit';
import { tmpDir } from '../core/paths';
import { StepTimer } from '../core/timer';
import { log } from '../platform/log';
import { BUBBLE_TAP_EVENT, Native } from '../platform/native';
import { cachedSettings } from '../platform/settingsStore';
import { UserFacingError } from '../sdk/errors';
import { Sn } from '../sdk/sn';
import { CAPTURE_PREFIX, closeRegionScreen, deliverToNote, placeRegion, removeCaptures } from './capture';
import { askForRegion, type RegionChoice } from './region';
import { snapPage } from './snapPage';
import { snapRegion } from './snapRegion';

let pluginDir: string | null = null;

/** At plugin start: listen for taps, remove a bubble left by an earlier version, show it if enabled. */
export async function startBubble(onTap: () => void, enabled: boolean): Promise<void> {
  if (!Native.available) {
    log('bubble: native module missing from this build');
    return;
  }
  pluginDir = await Sn.pluginDir();
  // Module scope: a listener in a component would die with the plugin's screen.
  DeviceEventEmitter.addListener(BUBBLE_TAP_EVENT, onTap);
  const cleared = await Native.clearAllBubbles();
  if (enabled) {
    await Native.showBubble();
  }
  log(`bubble: ${enabled ? 'shown' : 'off'}${cleared ? ` (removed ${cleared} left by an earlier version)` : ''}`);
}

export async function setBubble(on: boolean): Promise<void> {
  await (on ? Native.showBubble() : Native.hideBubble());
}

export async function captureFromBubble(): Promise<void> {
  const t = new StepTimer();
  const settings = cachedSettings();
  if (!pluginDir) {
    throw new UserFacingError('SnapMark is still starting. Tap again in a moment.');
  }
  const dir = pluginDir;
  const stamp = Date.now();
  const raw = `${tmpDir(dir)}/${CAPTURE_PREFIX}${stamp}.png`;
  const takenAt = new Date();
  const choose = settings.bubbleAction === 'region';
  // To choose a region the user sees the screen as it was; otherwise it's shrunk clear of the toolbar now.
  const [front, shot] = await Promise.all([
    Native.foreground(),
    Native.captureScreen(raw, fitInsetsDp(choose ? 'off' : settings.screenshotFit)),
  ]);
  t.mark(`capture (shot ${shot.shotMs}, fit ${shot.composeMs}, png ${shot.encodeMs})`);
  if (classifyApp(front.pkg) === 'pluginHost') {
    throw new UserFacingError('Close the plugin screen first, then tap the button.');
  }
  if (front.pkg === DOC_PACKAGE) {
    if (choose) {
      await snapRegion(settings, { front, raw, shot });
    } else {
      await removeCaptures(dir);
      await snapPage(settings);
    }
    return;
  }
  let page = raw;
  if (choose) {
    const out = `${tmpDir(dir)}/${CAPTURE_PREFIX}${stamp}-page.png`;
    let choice: RegionChoice = null;
    try {
      choice = await askForRegion({ path: raw, width: shot.width, height: shot.height }, 'Whole screen');
      if (choice === 'whole') {
        await Native.fitImage(raw, out, fitInsetsDp(settings.screenshotFit));
      } else if (choice) {
        await placeRegion(raw, out, choice, shot, settings);
      }
    } finally {
      await closeRegionScreen('bubble', choice);
    }
    t.mark('region');
    if (!choice) {
      return; // the capture is removed by the next run that gets NOTE in front
    }
    page = out;
  }
  await deliverToNote('bubble', { page, takenAt, isPortrait: shot.height >= shot.width, front, doc: null }, settings, dir, t);
}
