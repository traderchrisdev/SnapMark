// "Save a log file" (settings): SnapMark's recent log lines, plus the device and settings, as a text
// file in EXPORT/ the user can send with a bug report. Nothing is sent anywhere by SnapMark.

import { Dimensions, PixelRatio } from 'react-native';
import { EXPORT_DIR, formatStamp, tmpDir } from '../core/paths';
import type { Settings } from '../core/settings';
import { recentLog } from '../platform/log';
import { Native } from '../platform/native';
import { UserFacingError } from '../sdk/errors';
import { fs } from '../sdk/fs';
import { Sn } from '../sdk/sn';
import { assertUnlocked, firstFreePath } from './files';

const VERSION = require('../../package.json').version as string;
const LIB_VERSION = require('sn-plugin-lib/package.json').version as string;

/** Returns the saved file's path. */
export async function saveLog(settings: Settings): Promise<string> {
  if (!Native.available) {
    throw new UserFacingError('This build cannot write a log file.');
  }
  const screen = Dimensions.get('screen');
  const device = await Promise.resolve(Sn.deviceType()).catch(() => '?');
  const header = [
    'SnapMark log. It may contain the names of your notes and documents; check it before you share it.',
    `SnapMark ${VERSION}, sn-plugin-lib ${LIB_VERSION}, device type ${JSON.stringify(device)}`,
    `screen ${Math.round(screen.width * PixelRatio.get())}x${Math.round(screen.height * PixelRatio.get())} px (ratio ${PixelRatio.get()})`,
    `settings ${JSON.stringify(settings)}`,
    '',
  ];
  const text = [...header, ...recentLog(), ''].join('\n');
  const tmp = `${tmpDir(await Sn.pluginDir())}/snapmark-log.txt`;
  await Native.writeText(tmp, text);
  try {
    await assertUnlocked(EXPORT_DIR);
    await fs.makeDirs(EXPORT_DIR);
    const out = await firstFreePath(logCandidates(formatStamp(new Date())));
    await fs.copy(tmp, out);
    return out;
  } finally {
    await fs.remove(tmp).catch(() => undefined);
  }
}

function* logCandidates(stamp: string): Generator<string> {
  yield `${EXPORT_DIR}/SnapMark log ${stamp}.txt`;
  for (let n = 2; ; n++) {
    yield `${EXPORT_DIR}/SnapMark log ${stamp} (${n}).txt`;
  }
}
