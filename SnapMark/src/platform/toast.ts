import { ToastAndroid } from 'react-native';

/** Toasts show over NOTE/DOC even when the plugin has no UI (SPIKES.md R36). */
export function toast(message: string, long = false): void {
  ToastAndroid.show(message, long ? ToastAndroid.LONG : ToastAndroid.SHORT);
}
