# Changelog

## 0.18.0 (2026-10-20)

- **Notes for this page.** A new PDF/EPUB toolbar button: the first time, it makes a note for the page you're on (`<Book> - p<N> notes`), with the page shrunk at the top left (66%, or your margin size), your handwriting, the ↩ link back and the keyword, and room to write beside and below; every time after, it opens those same notes again. For pages whose margins can't hold what you want to write.
- For developers: the device test makes a page's notes and opens them again.

## 0.17.0 (2026-10-20)

- **Capture queue.** On the region screen, **Queue** keeps the box for later and takes you straight back to your reading, in a PDF, an EPUB or any app through the floating button. When you're done, **Paste queued snaps** (Notes toolbar → plugins) pastes them all onto your page in order, each below the last and on new pages as needed, with your handwriting as real ink (read then, so later ink comes too), the link or caption and the keyword. **Undo last snap** takes the whole batch back. The queue survives restarts; SnapMark's settings show how many are waiting and can clear it.
- **Searchable snaps, more robust:** the keyword and hidden text now go in last, and Notes gets 8 seconds to answer, so a slow answer can't hold a page snap up or leave a blank page in it. A paste from a page whose keyword your note already has keeps the one it has (no error).
- For developers: the device test queues two document regions and one from another app, pastes them and undoes the batch. It also pages through the plugin installer's file picker when MyStyle holds many packages.

## 0.16.0 (2026-10-19)

- **Searchable snaps.** A snap from a PDF or EPUB now carries a `Book p. N` keyword and the text it shows, on a hidden layer of its page, so Supernote's Search finds it: Search → Keyword by book and page, Search → Text by any word in it. A region snap keeps the lines inside your box (or its page's text when the lines can't be told apart, as in two columns). A paste into your own note gets the keyword only, and Undo last snap takes it off again. On by default; **Searchable snaps** in the settings turns it off.
- For developers: the device test checks every page and region snap gets its keyword and text.

## 0.15.0 (2026-10-19)

- **Tap two corners to make a box.** On the region screen, tap one corner (a small square marks it), then the opposite one: quicker than dragging on e-ink, where the box lags behind your pen. Dragging still works; tap a corner of the box, then tap elsewhere, to move that corner.
- **Undo last snap** (Notes toolbar → plugins): takes back the last paste into your note (picture, ink, link or caption, and the page if it made one) or the last Snaps inbox page. It only removes what SnapMark added, and only while it's still as the snap left it; a snap that made its own note is never deleted, Undo just tells you which one it was.
- For developers: the device test makes one region box with two taps and undoes a paste, checking the note is exactly as before.

## 0.14.3 (2026-10-18)

- **Handwriting and highlights land in the right place with a Nomad turned sideways.** 0.14.2 cut the right part of the page but shrank the ink towards the top-left, because the Nomad's document app reports it differently from the Manta's when sideways. SnapMark now reads it through Notes in that case, which reports it the same way on every device.
- **Underlines on one line line up.** Highlighting a line in several strokes gave underlines at two slightly different heights (lower under words with descenders); they now share one height.

## 0.14.2 (2026-10-18)

Fixes for what a Nomad user found with the device turned sideways (landscape orientation).

- **Snaps work with your Supernote turned sideways.** The document app keeps your handwriting in a different frame then, so whole-page snaps left it out or put it in the wrong place, and Snap region cut the wrong part of the page. SnapMark now detects the turned screen, works out whether the page is shown at its normal size or zoomed to the width (and how far it's scrolled), and places the cut, your ink and the underlines as it does upright. PDFs and EPUBs, last pages and **Into the note I'm working in** included.
- **Underlines stay clear of descenders** (the tails of g, p, y) on small text, as on a Nomad.
- For developers: the device test also snaps with the device turned sideways (a page, a region, the last page).

## 0.14.1 (2026-10-18)

- **A wobbly highlight still becomes an underline.** A hand-drawn marker stroke that goes up and down a little (or back and forth) over one line was taken for a mark across several lines and copied as-is. When the page shows a text line under it, SnapMark now accepts up to about twice the marker's height as one line and draws the underline under that line; a mark that really spans two lines is still copied as drawn.

## 0.14.0 (2026-10-18)

- **Pasted snaps keep your handwriting as ink.** With **Where snaps go → Into the note I'm working in**, a region from a PDF or EPUB is now cut from a clean render of the page, and your handwriting inside the box goes onto the pasted picture as real strokes you can erase or move; marker highlights become underlines under their line. It works on every page, last pages and landscape pages included. (Before, the ink was baked into the picture.)
- For developers: the device test pastes regions of page 1 and the last page into a note and checks the strokes arrive (19 snaps).

## 0.13.3 (2026-10-18)

- **Fixed: handwriting on landscape PDF pages landed in the wrong place** (a short line instead of an underline, words missing). The PDF app keeps a landscape page's ink in its zoomed view and renders the page as a landscape image; SnapMark now reads the ink in that frame and fits the image into the note, so Snap page, Snap region, margin mode and the inbox all place it right.
- For developers: the device test also snaps a landscape PDF page and an EPUB with ink, and checks Save a log file (17 snaps).

## 0.13.2 (2026-10-17)

- **Handwriting on the last page of a document is copied everywhere now.** 0.13.1 fixed it for Snap page; Snap region, margin mode and the Snaps inbox left it out. The document app refuses its last page to plugins, so SnapMark reads that page's ink through Notes: margin mode opens the snap first, and a region snap adds the ink right after Notes has the note open (with **Stay here**, you're taken back to the page afterwards).
- For developers: `npm run devtest -- --install` now installs the build through Settings, switches SnapMark's settings for the margin-mode and inbox snaps and back, and checks 10 snaps.

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
