# InkHub submission

The text to paste when uploading SnapMark to InkHub on the device, and the note for Supernote's reviewers. Reuse it for every update. Bump the version in it, and keep the "What the native code does" section true.

## Listing

**Title:** SnapMark

**Category:** Plugins (pick the closest subcategory, e.g. Productivity or Reading)

**Description:**

> Turn anything on your screen into a note you can write on.
>
> • **Snap page / Snap region** (PDF & EPUB toolbar): the page, or just the part you box, becomes a new note. Your handwriting comes along as real ink you can still erase (last page included), marker highlights become neat underlines under their line, and a "↩ Book, p. N" link, placed where it doesn't cover text, takes you back to the page.
> • **Floating capture button** (optional, off by default): tap it in any app, drag a box over the part you want, and keep writing a second later. It captures the screen only when you tap it.
> • **Paste into your note:** a region snap goes onto the page of the note you're working in, below what's there, with your handwriting as real ink and a link back to the PDF page.
> • **Annotate / Insert screenshot**, **Export page as PNG**, a **Snaps inbox** that collects every snap in one notebook, a **margin mode** for writing room, and **Save a log file** for bug reports.
>
> Asks only for file access and has no internet access: nothing leaves your device. Works on firmware with plugin support (built with Supernote's plugin library 0.1.65). Free and open source (MIT). Tested on Manta, used on Nomad. Guide and FAQ: snapmark.ink

## Note for the reviewer

> Thank you for reviewing SnapMark 0.14.1. Full source: https://github.com/traderchrisdev/SnapMark (MIT).
>
> **Permissions:** `FILE:READ` and `FILE:WRITE` only.
> - Snaps are written as new notes under `Note/Snaps/` (the folder is configurable).
> - PNG exports go to `EXPORT/`.
> - SnapMark reads `SCREENSHOT/` and the open document.
> - It never deletes or overwrites user files. Every delete is restricted in code to its own private plugin folder (`src/sdk/fs.ts`, `assertPrivate`) and only removes its temporary images.
> - There is no `INTERNET` permission and no network code anywhere, in JS or native. (The Android package declares `SYSTEM_ALERT_WINDOW`, for the floating button, and the storage permissions that Supernote's own plugin library adds to every plugin.)
>
> 0.13.x is built with plugin library 0.1.65 so older firmware accepts it, and drops the `INTERNET` permission the React Native template had declared. 0.13.1 adds the image measurement and log-file helpers below.
>
> **What the native code does** (`SnapMarkNativeModule.java`; items 1–4 are used only by the optional floating button, which is off by default):
> 1. **The button:** shows a small `TYPE_APPLICATION_OVERLAY` button, the same technique SuperDashboard uses.
> 2. **The capture:** when the user taps it, takes one screenshot with `SurfaceControl.screenshot`, with the button hidden. The image is saved in the plugin's private folder and turned into a note on the device; it is never sent anywhere. Nothing is captured without a tap.
> 3. **Which app is in front:** `getRunningTasks`, with `dumpsys activity activities` as a fallback, so it can name the note after the app and know whether Notes must be brought forward.
> 4. **Switching apps:** `moveTaskToFront` to bring Notes forward (or back to the user's app for "Stay here"), plus an intent that opens a note in Notes.
> 5. **The pen after the selection screen:** `PluginApp.showPluginView(0)` via reflection, after the region-selection screen closes, so NOTE and DOC re-enable pen input. Without it the pen could stay disabled.
> 6. **Image helpers:** cropping the box the user drew, finding where a note page's content ends (a pixel scan of a page render, for pasting below it), measuring where a highlighted text line ends and whether the link's spot is blank, fitting a landscape page image into a portrait page, reading a PDF page's size with Android's `PdfRenderer`, and writing a blank white page image. These are plain bitmap operations on files in the plugin's folder.
> 7. **Log file:** "Save a log file" in the settings writes SnapMark's own recent log lines to a text file, which is then copied to `EXPORT/` through the plugin SDK. Only when the user taps it.
> 8. **Cleanup:** removes its own leftover button views after a plugin update (`WindowManagerGlobal`, matched by its own view tag).
>
> No other system APIs are used, and nothing runs in the background except the button waiting for a tap.
>
> **How to test:**
> 1. In a PDF, use the toolbar's plugin menu → Snap region, drag a box → Snap region. A new note opens with that part and a ↩ link.
> 2. In Settings → Apps → Plugins → SnapMark → settings, turn on "Floating capture button". Tap it in any app, drag a box → Snap region.
> 3. Optional: in SnapMark's settings set "Where snaps go" to "Into the note I'm working in", open any note, then do step 1 again. The cut-out is placed on that note's page with a ↩ link under it.
