// The Supernote apps the floating button cares about, by Android package (SPIKES.md R63, R64).

export const NOTE_PACKAGE = 'com.ratta.supernote.note';
export const DOC_PACKAGE = 'com.supernote.document';
export const PLUGIN_HOST_PACKAGE = 'com.ratta.supernote.pluginhost';

/**
 * "note": createNote works right away.
 * "pluginHost": a plugin's own screen is in front (ours or another plugin's): nothing to capture.
 * "other": DOC, third-party apps, Ratta's own apps. The SDK refuses (102), fails (118) or never
 * answers there (Ratta Settings), so NOTE has to be brought to the front first.
 */
export type FrontApp = 'note' | 'pluginHost' | 'other';

export function classifyApp(pkg: string): FrontApp {
  if (pkg === NOTE_PACKAGE) {
    return 'note';
  }
  return pkg === PLUGIN_HOST_PACKAGE ? 'pluginHost' : 'other';
}
