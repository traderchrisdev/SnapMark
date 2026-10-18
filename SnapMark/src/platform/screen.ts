// The panel's size in pixels (1920×2560 on the Manta in portrait; SPIKES.md R16).

import { Dimensions, PixelRatio } from 'react-native';
import type { Size } from '../core/backlink';

export function screenSizePx(): Size {
  const screen = Dimensions.get('screen');
  const ratio = PixelRatio.get();
  return { width: Math.round(screen.width * ratio), height: Math.round(screen.height * ratio) };
}

/** The panel upright (portrait), even while the device is turned sideways (R83). */
export function uprightScreenPx(): Size {
  const s = screenSizePx();
  return { width: Math.min(s.width, s.height), height: Math.max(s.width, s.height) };
}
