import { Image } from 'react-native';
import { bundledRawAssetPath } from '../core/paths';

/**
 * Absolute path of assets/blank.note inside the installed plugin. resolveAssetSource gives a file
 * URI when the bundle is loaded from disk (as PluginHost does for icons); otherwise fall back to
 * where Metro places raw assets.
 */
export function blankNoteAssetPath(pluginDir: string): string {
  const uri = Image.resolveAssetSource(require('../../assets/blank.note')).uri;
  if (uri.startsWith('file://')) {
    return uri.slice('file://'.length);
  }
  if (uri.startsWith('/')) {
    return uri;
  }
  return bundledRawAssetPath(pluginDir, 'assets_blank', 'note');
}
