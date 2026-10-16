# InkHub submission

The text to paste when uploading SnapMark to InkHub on the device, and the note for Supernote's reviewers. Reuse it for every update. Bump the version in it, and keep the "What the native code does" section true.

## Listing

**Title:** SnapMark

**Category:** Plugins (pick the closest subcategory, e.g. Productivity or Reading)

**Description:**

> Turn anything on your screen into a note you can write on.
>
> • **Snap page / Snap region** (PDF & EPUB toolbar): the page, or just the part you box, becomes a new note. Your handwriting comes along as real ink you can still erase, highlights are kept, and a "↩ Book, p. N" link takes you back to the page.
> • **Floating capture button** (optional, off by default): tap it in any app, drag a box over the part you want, and keep writing a second later. It captures the screen only when you tap it.
> • **Annotate / Insert screenshot**, **Export page as PNG**, a **Snaps inbox** that collects every snap in one notebook, and a **margin mode** for writing room.
>
> Asks only for file access and has no internet access: nothing leaves your device. Free and open source (MIT). Tested on Manta. Guide and FAQ: snapmark.ink

## Note for the reviewer

> Thank you for reviewing SnapMark 0.11.5. Full source: https://github.com/traderchrisdev/SnapMark (MIT).
>
> **Permissions:** `FILE:READ` and `FILE:WRITE` only.
> - Snaps are written as new notes under `Note/Snaps/` (the folder is configurable).
> - PNG exports go to `EXPORT/`.
> - SnapMark reads `SCREENSHOT/` and the open document.
> - It never deletes or overwrites user files. Every delete is restricted in code to its own private plugin folder (`src/sdk/fs.ts`, `assertPrivate`) and only removes its temporary images.
> - There is no `INTERNET` permission and no network code anywhere, in JS or native.
>
> **What the native code does** (`SnapMarkNativeModule.java`, used only by the optional floating button, which is off by default):
> 1. **The button:** shows a small `TYPE_APPLICATION_OVERLAY` button, the same technique SuperDashboard uses.
> 2. **The capture:** when the user taps it, takes one screenshot with `SurfaceControl.screenshot`, with the button hidden. The image is saved in the plugin's private folder and turned into a note on the device; it is never sent anywhere. Nothing is captured without a tap.
> 3. **Which app is in front:** `getRunningTasks`, with `dumpsys activity activities` as a fallback, so it can name the note after the app and know whether Notes must be brought forward.
> 4. **Switching apps:** `moveTaskToFront` to bring Notes forward (or back to the user's app for "Stay here"), plus an intent that opens a note in Notes.
> 5. **The pen after the selection screen:** `PluginApp.showPluginView(0)` via reflection, after the region-selection screen closes, so NOTE and DOC re-enable pen input. Without it the pen could stay disabled.
> 6. **Cleanup:** removes its own leftover button views after a plugin update (`WindowManagerGlobal`, matched by its own view tag).
>
> No other system APIs are used, and nothing runs in the background except the button waiting for a tap.
>
> **How to test:**
> 1. In a PDF, use the toolbar's plugin menu → Snap region, drag a box → Snap region. A new note opens with that part and a ↩ link.
> 2. In Settings → Apps → Plugins → SnapMark → settings, turn on "Floating capture button". Tap it in any app, drag a box → Snap region.
