// A screenshot used as a note page sits under NOTE's own controls (SPIKES.md R62): the side toolbar
// (~120 px on the Manta, on the left by default) and the page bar at the bottom. Shrinking the
// screenshot into the rest of the page keeps all of it visible.

export type ScreenshotFit = 'left' | 'right' | 'off';

/** Where the user keeps NOTE's toolbar; "off" keeps screenshots full size. */
export const SCREENSHOT_FITS: readonly ScreenshotFit[] = ['left', 'right', 'off'];

/** In dp, so they scale with the panel: 72 dp = 135 px at the Manta's 300 dpi. */
const TOOLBAR_DP = 72;
const PAGE_BAR_DP = 72;

export interface Insets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function fitInsetsDp(fit: ScreenshotFit): Insets {
  switch (fit) {
    case 'left':
      return { left: TOOLBAR_DP, top: 0, right: 0, bottom: PAGE_BAR_DP };
    case 'right':
      return { left: 0, top: 0, right: TOOLBAR_DP, bottom: PAGE_BAR_DP };
    case 'off':
      return { left: 0, top: 0, right: 0, bottom: 0 };
  }
}
