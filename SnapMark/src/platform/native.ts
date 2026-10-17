// Typed wrapper over SnapMark's own native module (android/app/src/main/java/com/snapmark/
// SnapMarkNativeModule.java): the floating button, screen capture, and switching apps. Errors carry
// the method name, like SDK errors do.

import { NativeModules } from 'react-native';
import type { Rect, Size } from '../core/backlink';
import type { Insets } from '../core/fit';
import { SnApiError } from '../sdk/errors';

export interface FittedImage {
  width: number;
  height: number;
  scale: number;
  composeMs: number;
  encodeMs: number;
  totalMs: number;
}

export interface Capture extends FittedImage {
  shotMs: number;
}

export interface FrontTask {
  pkg: string;
  activity: string;
  /** The app's name as the launcher shows it ("" if unknown). */
  label: string;
  /** -1 when only dumpsys could tell which app is in front. */
  taskId: number;
}

/** A highlighted line: the marker's x-extent and the row of its centre (page px). */
export interface TextBand {
  left: number;
  right: number;
  y: number;
  /** How far below `y` to look for the line's bottom. */
  maxDy: number;
}

export interface RenderReport {
  /** Per band: the lowest row of the text line at its centre, or -1 if no text is there. */
  lineBottoms: number[];
  /** Per zone: dark pixels inside it. */
  zoneInk: number[];
}

interface Spec {
  showBubble(): Promise<boolean>;
  hideBubble(): Promise<boolean>;
  clearAllBubbles(): Promise<number>;
  captureScreen(outPath: string, insetsDp: Insets): Promise<Capture>;
  fitImage(srcPath: string, outPath: string, insetsDp: Insets): Promise<FittedImage>;
  cropInto(srcPath: string, outPath: string, crop: Rect, dst: Rect): Promise<{ width: number; height: number; encodeMs: number; totalMs: number }>;
  cutOut(srcPath: string, outPath: string, crop: Rect): Promise<Size>;
  contentBottom(pagePath: string, templatePath: string | null): Promise<number>;
  whitePng(outPath: string, width: number, height: number): Promise<boolean>;
  inspectRender(path: string, bands: TextBand[], zones: Rect[]): Promise<RenderReport>;
  writeText(path: string, text: string): Promise<boolean>;
  releasePenLock(): Promise<boolean>;
  foreground(): Promise<FrontTask>;
  bringNoteToFront(): Promise<boolean>;
  moveTaskToFront(taskId: number): Promise<boolean>;
  openFirstNote(paths: string[]): Promise<string | null>;
  waitForForeground(pkg: string, timeoutMs: number): Promise<number>;
  sleep(ms: number): Promise<boolean>;
}

const mod = (NativeModules as Record<string, unknown>).SnapMarkNative as Spec | undefined;

/** Emitted by the native side when the floating button is tapped (not dragged). */
export const BUBBLE_TAP_EVENT = 'snapmarkBubbleTap';

async function call<T>(method: keyof Spec, run: (m: Spec) => Promise<T>): Promise<T> {
  if (!mod) {
    throw new SnApiError(`native.${method}`, null, 'SnapMark native module is missing from this build');
  }
  try {
    return await run(mod);
  } catch (e) {
    throw new SnApiError(`native.${method}`, null, e instanceof Error ? e.message : String(e));
  }
}

export const Native = {
  available: mod !== undefined,

  showBubble: () => call('showBubble', m => m.showBubble()),
  hideBubble: () => call('hideBubble', m => m.hideBubble()),
  /** Also removes a bubble left on screen by a previous plugin version (another classloader). */
  clearAllBubbles: () => call('clearAllBubbles', m => m.clearAllBubbles()),

  /** Screen without the bubble, shrunk into insetsDp, as an 8-bit gray PNG (R60-R62). */
  captureScreen: (outPath: string, insetsDp: Insets) => call('captureScreen', m => m.captureScreen(outPath, insetsDp)),
  /** The same shrink for an existing image (a native screenshot). */
  fitImage: (srcPath: string, outPath: string, insetsDp: Insets) => call('fitImage', m => m.fitImage(srcPath, outPath, insetsDp)),
  /** The `crop` part of an image (px), drawn into `dst` (px) of a white page of the same size. */
  cropInto: (srcPath: string, outPath: string, crop: Rect, dst: Rect) => call('cropInto', m => m.cropInto(srcPath, outPath, crop, dst)),
  /** Just the `crop` part (px) of an image, as an image that size. */
  cutOut: (srcPath: string, outPath: string, crop: Rect) => call('cutOut', m => m.cutOut(srcPath, outPath, crop)),
  /** Lowest row of a page render with content (what differs from `templatePath`, or isn't white), -1 if none. */
  contentBottom: (pagePath: string, templatePath: string | null) => call('contentBottom', m => m.contentBottom(pagePath, templatePath)),
  whitePng: (outPath: string, width: number, height: number) => call('whitePng', m => m.whitePng(outPath, width, height)),
  /** Where highlighted text lines end and whether the link's spots are blank, from one decode of the render (R79). */
  inspectRender: (path: string, bands: TextBand[], zones: Rect[]) => call('inspectRender', m => m.inspectRender(path, bands, zones)),
  /** A UTF-8 text file (the log the user can share). */
  writeText: (path: string, text: string) => call('writeText', m => m.writeText(path, text)),
  /** Let NOTE/DOC take pen input again after a plugin screen (false if this firmware can't). */
  releasePenLock: () => call('releasePenLock', m => m.releasePenLock()),

  foreground: () => call('foreground', m => m.foreground()),
  /** False when NOTE has no running task to bring back. */
  bringNoteToFront: () => call('bringNoteToFront', m => m.bringNoteToFront()),
  moveTaskToFront: (taskId: number) => call('moveTaskToFront', m => m.moveTaskToFront(taskId)),
  /** Opens the first existing note of paths in NOTE by intent; resolves it, or null if none exists. */
  openFirstNote: (paths: string[]) => call('openFirstNote', m => m.openFirstNote(paths)),
  /** ms waited until pkg is in front, or -1 after timeoutMs. */
  waitForForeground: (pkg: string, timeoutMs: number) => call('waitForForeground', m => m.waitForForeground(pkg, timeoutMs)),
  /** A wait that works while another app is in front (JS timers stall then, R34). */
  sleep: (ms: number) => call('sleep', m => m.sleep(ms)),
};
