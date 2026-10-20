// The hand-off between a capture flow and the "choose a region" screen (ui/RegionScreen). The flow
// shows the screen and waits; the screen answers with a box, "whole screen" or nothing (cancel).

import { AppState } from 'react-native';
import { PluginManager } from 'sn-plugin-lib';
import type { Rect } from '../core/backlink';
import { log } from '../platform/log';
import { setRoute } from '../ui/route';

export interface CaptureImage {
  path: string;
  width: number;
  height: number;
}

export interface RegionRequest {
  capture: CaptureImage;
  /** The second button: "Whole screen" for the floating button, "Whole page" in a document. */
  wholeLabel: string;
}

/** A box to keep for later (the capture queue), in the capture's pixels. */
export interface QueueChoice {
  queue: Rect;
}

/** A box in the capture's pixels, the whole capture, a box to queue, or null when the user cancelled. */
export type RegionChoice = Rect | 'whole' | QueueChoice | null;

export function isQueueChoice(choice: RegionChoice): choice is QueueChoice {
  return typeof choice === 'object' && choice !== null && 'queue' in choice;
}

/** A box to snap now (not the whole page, not a queued box, not a cancel). */
export function isBoxChoice(choice: RegionChoice): choice is Rect {
  return typeof choice === 'object' && choice !== null && !('queue' in choice);
}

let pending: ((choice: RegionChoice) => void) | null = null;

/** Show the capture and wait for the user's choice. The screen stays up; the caller closes it. */
export async function askForRegion(capture: CaptureImage, wholeLabel: string): Promise<RegionChoice> {
  answerRegion(null); // a question left open by an earlier tap is over
  const answer = new Promise<RegionChoice>(resolve => {
    pending = resolve;
  });
  // The screen can also go away without a button (back gesture, the user switching app): that's a cancel.
  let shown = false;
  const sub = AppState.addEventListener('change', state => {
    if (state === 'active') {
      shown = true;
    } else if (shown && pending) {
      log(`region: screen left (${state}) without an answer`);
      answerRegion(null);
    }
  });
  try {
    setRoute({ name: 'region', request: { capture, wholeLabel } });
    await PluginManager.showPluginView();
    return await answer;
  } finally {
    sub.remove();
  }
}

export function answerRegion(choice: RegionChoice): void {
  const resolve = pending;
  pending = null;
  resolve?.(choice);
}
