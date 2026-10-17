# Changelog

## 0.13.1 (2026-10-17)

Fixes for what a Nomad user reported on 0.13.0, plus the last page of a document.

- **Underlines sit under the line you highlighted.** A marker highlight became an underline a fixed distance below the stroke, measured on a Manta; on the Nomad's smaller page that distance is one text line, so it struck through the next line. SnapMark now finds the highlighted line in the page itself and draws the underline just under it, on any device and for any text size.
- **The ↩ link no longer covers text.** It stays at the bottom left when that spot is blank. If not, it moves to the top-right corner, and if that has text too, the page is drawn slightly smaller (about 93%) with your ink scaled to match, so the link gets a free strip at the bottom.
- **Handwriting on the last page of a document is copied.** The document app refuses that page to plugins (an off-by-one in its page check), so SnapMark now reads it through Notes, which handles it correctly, ink you have just drawn included. Snap region and margin mode on a last page still leave the ink out; margin mode says so.
- **Whole-page snaps rebuild your ink** as new strokes that follow the page, so it no longer depends on the document and note pages matching. If the ink still can't be added, SnapMark tells you instead of saving a note without it.
- **New: Save a log file** (SnapMark settings → Problem report) writes SnapMark's recent log, your device type and settings to `EXPORT/`, to attach to a bug report without a computer.
- The first snap after installing no longer opens a helper note made on another device, once SnapMark has made its own (a Nomad showed it with the toolbar on top).
- For developers: `npm run devtest` snaps a test PDF on a plugged-in Supernote over adb and checks each note (`SnapMark/devtest/README.md`).

## 0.13.0 (2026-10-16)

- **Runs on more firmware.** 0.12.0 was built with Supernote's newest plugin library (0.2.3), and some firmware refuses that with "This plugin is not compatible with the current system version. Please update the system." (reported on a Nomad with Chauvet 3.29.45_beta; the plugin never started, so its settings never appeared). SnapMark is now built with plugin library 0.1.65, which every firmware with plugin support accepts. Handwriting is converted between the coordinate systems the two library versions use; nothing else changes.
- **Margin mode** now puts the shrunk page right of the Notes toolbar (or at the left edge if **Notes toolbar** is set to the right side), so a page with no left margin isn't hidden under it.
- **Fixed:** a snap could open as two pages, one blank, although the note on disk was right (reopening it from its folder showed the finished page). Notes reloads the note by itself after each change SnapMark makes and ignored SnapMark's final reload when it came too early. SnapMark now builds the page in an order that always shows the finished page, waits for Notes to settle before asking it to reload, and waits for Notes to be on the new note before writing to it.
- The Android package no longer declares the `INTERNET` permission (the React Native template had; SnapMark never used the network).

## 0.12.0 (2026-10-16)

- **Paste into the note you're working in:** a new choice under **Where snaps go**. After Snap region or a tap on the floating button, Notes comes back with the note it last had open, and the cut-out is placed on the page you were on as a picture you can lasso, below what's already there (or on a new page after it when the page is full). From a PDF or EPUB, a `↩ <Book>, p. N` link goes just under it; from another app, a caption with the app's name and the time. Your ink inside the box is part of the picture.
- Your earlier **Where snaps go** choice is kept.
- **Requirements:** "Chauvet 3.29.43 or later" was too broad. SnapMark is built with Supernote's plugin library 0.2.3, and the firmware's plugin system checks that version before starting a plugin. A Nomad user on Chauvet 3.29.45 beta reports "not compatible with the current system version", which is being looked into.

## 0.11.5 (2026-10-16)

- The plugin's description (shown in Settings → Apps → Plugins) now says what the floating button does: it captures the screen only when you tap it, and nothing leaves your device. No other changes.

## 0.11.4 (2026-10-16)

- **Fixed:** Snap region and Snap page could fail on some PDF pages with "The page does not exist". Supernote's plugin system can refuse to report the size of a page the PDF app is showing (seen on page 2 of a 2-page PDF); SnapMark now uses the screen size, which is what it reports for documents anyway.
- **Screenshots** in the README and the how-to guide.

## 0.11.3 (2026-10-15)

- **Snap region:** choose part of the screen or page by dragging a box, with your finger or the pen. The cut-out goes at the top of a new note, enlarged up to 2×, with the rest of the page free to write on.
  - **Floating button:** a tap now opens the selection screen. **Whole screen** is one tap away, or set **When I tap the floating button → Whole screen right away**.
  - **New "Snap region" button** in the PDF/EPUB toolbar. The cut comes from a clean render of the page, your handwriting inside the box stays editable ink, and the `↩` link goes back to the page. **Whole page** does a normal Snap page.
  - **The floating button in a PDF or EPUB** works the same way.
- **Floating button:** finger taps work; a fingertip may now wobble more before a tap counts as a drag. The button starts on the file name at the bottom right of a note, where pen taps don't leave ink.
- **Fixed:** "Whole screen" from a PDF could fail with "not allowed", because SnapMark acted before Notes was fully in front.
- **Fixed:** a capture taken inside a capture note no longer gets two timestamps in its name.

## 0.9.0 (2026-10-15)

- **Smaller floating button:** about 5 mm across. It remembers where you dragged it, also after a restart.
- **Notes named after the source:** captures are named after where they came from: `<app name> - <time>`, `<Book> - p<N> - <time>`, or `<note title> - <time>`.
- **Link back from documents:** captures from a PDF or EPUB get a `↩ <Book>, p. N` link back to the page, like Snap page.

## 0.8.0 (2026-10-15)

- **Floating capture button** (off by default): a button over every app. Tap it to turn the screen into a note to write on, in about a second.
- **New "Notes toolbar" setting:** screenshot notes are shrunk slightly so the Notes toolbar and page bar don't cover them. This also applies to Annotate screenshot.

## 0.7.1 (2026-10-14)

First complete version:
- **Snap page:** the page plus your handwriting as ink, highlights kept or turned into underlines, and a link back.
- **Screenshot tools:** Annotate screenshot and Insert screenshot.
- **Export page as PNG.**
- **Snaps inbox** (collect mode).
- **Margin mode.**
- **"Stay here" mode.**
