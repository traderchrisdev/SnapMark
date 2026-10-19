/**
 * SnapMark plugin entry: PluginHost runs this to register buttons.
 * @format
 */

import { AppRegistry, Image } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { PluginManager } from 'sn-plugin-lib';
import { startPlugin } from './src/plugin';
import { logError } from './src/platform/log';

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();

const icon = asset => Image.resolveAssetSource(asset).uri;

startPlugin({
  snapPage: icon(require('./assets/icon-snap-page.png')),
  snapRegion: icon(require('./assets/icon-snap-region.png')),
  annotateScreenshot: icon(require('./assets/icon-annotate-screenshot.png')),
  exportPng: icon(require('./assets/icon-export-png.png')),
  insertScreenshot: icon(require('./assets/icon-insert-screenshot.png')),
  undoSnap: icon(require('./assets/icon-undo-snap.png')),
}).catch(e => logError('startPlugin', e));
