# SnapMark

A Supernote plugin: one tap turns what you're reading into a note you can write on, with a link back to where you were.

**Status: SnapMark 0.7.1. Phase 4 closed with 4 of 5 v2 items done** (2026-10-14). Snap region is deferred: cropping needs a Java module, which needs a JDK and Android Studio to build. Verified on the Manta:
- **Margin mode** (0.7.1): 3.3–3.4 s per snap; the page sits in the top-left ¾ with your scaled ink.
- **Insert screenshot** (0.6.0): 0.3 s; the screenshot lands at about 70% of the page, centered.
- **Export page as PNG** (0.5.0): about 1 s; includes ink written just before the tap.
- **Collect mode** (0.4.0):
  - pages and screenshots append to `Snaps inbox.note` (pages 1–4 tested);
  - "Stay here" batch capture works;
  - an inbox snap takes 5–6 s (refreshing the open inbox costs ~1.4 s, SPIKES.md R53).

Earlier phases, also verified on the Manta:

- **Snap page** (PDF/EPUB, from the document toolbar): handwriting copied as ink, including a stroke drawn just before tapping; marker highlights become underlines; the backlink returns to the page. "Stay here" mode works.
- **Annotate screenshot** (from the note toolbar): the picker → new note → open path takes 0.54 s. The "fresh screenshot, open it directly" path shares that code but hasn't been tapped on the device.
- **Settings**: saved immediately and kept across plugin reinstalls.

Tap → open: about 3.5–4.1 s for a PDF page, 2.4–2.7 s for an EPUB page. The same-minute ` (2)` suffix is unit-tested only.

**Phase 3 (0.3.0):**
- **Verified on device:**
  - page snaps open the snap note directly; the helper note is used only on the very first snap;
  - every snap gets its own internal file ID;
  - your writing on a snap persists;
  - the same-minute ` (2)` naming works;
  - new toolbar icons.
- **Built but not yet exercised on the device** (they need a revoked permission or a locked encrypted folder):
  - the first-run permission screen;
  - the locked-folder message.

See `../SPEC.md` for the plan and `../SPIKES.md` for why it's built the way it is.

## Settings

Open them from **Settings → Apps → Plugins → SnapMark → gear**.

| Setting | Options |
|---|---|
| Save snaps in | A folder under `Note/` (default `Snaps`). Page snaps go to `<folder>/<book title>/`, screenshots to `<folder>/Screenshots/`. |
| Margin mode | **Off** (default), **80% / 75% / 66%**: the page is shrunk at the top-left, leaving room to write on the right and bottom (own-note snaps only). |
| Where snaps go | **A new note each** (default), or **One "Snaps inbox"**: every snap becomes the next page of `Note/<folder>/Snaps inbox.note`, which is collect mode. |
| After a snap | **Open the snap** (default), or **Stay here**: save, go back to the page, and show a short confirmation. With the inbox, this is batch capture while reading. |
| Text-selection highlights | Keep (default) or leave out of the page image |
| My handwriting on the page | Copy as ink (default) or leave out |
| Marker highlights | Underline (default) or leave out |
| Annotate screenshot | Use the newest screenshot directly if it's newer than 2/5/10 (default)/30/60 min, or **Always ask** (always show the picker) |

Settings are stored as empty folders in the plugin's private folder: a plugin can't write files from JS, and deleting anything in the shared folders would need the `FILE:DELETE` permission (SPIKES.md R43).

## What "Snap page" does

In a PDF or EPUB, tap **Snap page** in the toolbar's Plugins menu. SnapMark then:

1. Renders the current page (with text-selection highlights) at the note's page size, in the plugin's private folder.
2. Copies a blank note to `Note/Snaps/<Title>/<Title> - p<N> - <YYYY-MM-DD HHmm>.note` and opens it. A second snap in the same minute gets ` (2)`. The blank comes from a small pool in the private folder; each one was made with `createNote`, so every snap gets its own internal file ID (SPIKES.md R49).
3. Once the note app is in front, turns the page into the note's background and copies your handwriting from that page as editable ink:
   - Marker highlights become thin gray underlines; copied as markers, the note app would paint them solid over the text (R41).
   - Text-selection highlights are part of the page image and look exactly as in the PDF.
4. Adds a `↩ <Title>, p. N` link at the bottom that takes you back to the page, then refills the pool.

On the very first snap the pool is empty: SnapMark then briefly opens a blank helper note (`Note/.snapmark/hop.note`) to bring the note app forward, and fills the pool for next time. "Annotate screenshot" also fills it.

Expect about 3.5–4 s on the Manta for a PDF and about 2.5 s for an EPUB. The page render alone takes about 2 s for a PDF (SPIKES.md R12).

## Collect mode ("Snaps inbox")

With **Where snaps go → One "Snaps inbox"**:
- **Snap page:** opens the inbox, appends the page as a new last page (with your ink and the ↩ link), and shows it. With "Stay here" it goes straight back to your page with "Snapped p. N → Snaps inbox, page M".
- **The first snap creates the inbox.**
- **Landscape document pages** are letterboxed into the inbox's page size.
- **Annotate screenshot:** appends the screenshot the same way. With "Stay here" it doesn't open the inbox at all. A screenshot whose orientation doesn't match the inbox gets its own note, because the note app can't scale a page image.

## Margin mode

With **Margin mode** at 80/75/66%, Snap page renders the page at exactly that size and puts it at the top-left of a fresh blank snap as a picture. Your handwriting from the page is scaled and moved to match, and the ↩ link sits in the bottom margin. The whole snap is written before it's opened (SPIKES.md R56). With "Stay here" and a pooled blank, the note app isn't involved at all, so nothing flashes. The note app can't shrink a page background (SPIKES.md R38), so the page is a picture: you can move it with the lasso. Shapes from the PDF page aren't copied in this mode yet, only strokes. Margin mode applies to snaps saved as their own note, not to inbox pages.

## Insert screenshot

In a note, tap **Insert screenshot**. The newest screenshot (or the one you pick, using the same freshness setting and picker as "Annotate screenshot") is placed on the **current page** as a picture. The note app shrinks a full-screen screenshot to about 70% of the page and centers it, leaving room to write on every side. On screen its white areas are see-through, so the page's lines show through (SPIKES.md R55). Unlike a snap's background, it's a normal picture: lasso it to move or resize it, and anything you write afterwards goes on top. A landscape screenshot on a portrait page is wider than the page; the toast says so.

## Export page as PNG

In any note (a snap, the inbox, or your own notes), tap **Export page as PNG** in the toolbar's Plugins menu. SnapMark saves the note first, so what's on screen is included, then writes the current page as `EXPORT/<note title> - p<N>.png`: the page image, all your ink and the link, flattened onto white at full resolution. A second export of the same page gets ` (2)`.

## Build

Requirements: Node ≥ 18, `zip`, and `jq` or `python3`. No JDK or Android SDK is needed, because SnapMark has no native code.

```bash
npm install
```

```bash
npm run check
```

```bash
npm run build:plugin
```

The package is `build/outputs/SnapMark.snplg`. `PluginConfig.json` is maintained by hand. Never change `pluginID`; bump `versionCode` and `versionName` for each release.

## Install on the device

```bash
adb push build/outputs/SnapMark.snplg /sdcard/MyStyle/
```

Then on the device: **Settings → Apps → Plugins → Add Plugin → SnapMark.snplg → Install**. To update, install again over the old version.

## Logs

Every snap logs one line with step timings and the total time from tap to note open:

```bash
adb logcat -v time | grep --line-buffered -E 'SnapMark|PRETTY_LOGGER|AndroidRuntime'
```

Example: `[SnapMark] snap page 176 -> …/Book - p176 - 2026-10-14 1302.note | tap→open: permissions 12 | context 40 | render 2165 | … | total 3410 ms`. `PRETTY_LOGGER` lines are PluginHost's own logs, including native crashes.

## Manual test checklist

Manta (the only device available). Nomad support is written to be device-agnostic but **is unverified**.

- [ ] **PDF happy path:**
  - Open a PDF page; highlight a sentence (text selection → highlight) and handwrite a few strokes.
  - Tap **Snap page**.
  - A note opens showing that page with the highlight, and your strokes are erasable ink at the same spots.
  - You can write on it immediately.
- [ ] **Marker highlights:** a line highlighted with the marker pen comes out as a thin gray underline under that text, and the text stays readable.
- [ ] **Backlink:** tap `↩ … p. N` at the bottom. The PDF opens on the same page.
- [ ] **EPUB:** the same on an EPUB page.
- [ ] **Same minute:** two snaps of the same page within a minute give `… .note` and `… (2).note`.
- [ ] **Location and name:** the note is in `Note/Snaps/<Title>/`. Titles with `/ : * ? " < > |` come out readable, and long titles are shortened.
- [ ] **Timing:** the log shows `tap→open … total` ≲ 4 s.
- [ ] **No dialogs** on the happy path, only the "Snapping…" toast.
- [ ] **No helper note in Recent Files** after the first snap: Recent Files shows the document and the snap only.
- [ ] **First run without file access** (revoke it in Settings → Apps → Plugins → SnapMark if possible): tapping a button opens "SnapMark needs file access". **Continue** shows the system dialog. "Always allow" → "All set"; "Don't allow" → a clear message, and nothing fails silently.
- [ ] **Encrypted, locked snaps folder:** snapping shows "Note/… is encrypted and locked. Unlock it in Files, then try again." 
- [ ] **Annotate screenshot, fresh:** take a native screenshot (e.g. in Kindle), open any note, tap **Annotate screenshot**. The screenshot opens as `Snaps/Screenshots/Screenshot - <time>.note` and you can write on it.
- [ ] **Annotate screenshot, picker:** with "Always ask" (or an old screenshot), tap **Annotate screenshot**. A grid of the latest 12 shows with their ages; pick one and it opens.
- [ ] **Stay here:** set "After a snap → Stay here". Snap page returns to the same page with "Snapped p. N → …", and a screenshot is saved with "Saved …" without leaving the note.
- [ ] **Collect mode:**
  - Set "Where snaps go → One Snaps inbox".
  - Snap two pages: the inbox gets them as pages 1 and 2, each with its ↩ link, and opens on the new page.
  - With "Stay here", a third snap returns to the book with "… → Snaps inbox, page 3".
  - Annotate screenshot adds a page too.
- [ ] **Margin mode:**
  - Set "Margin mode → 75%" and snap a page with some ink.
  - The page fills the top-left ¾, your ink sits on the same words (scaled down), and there's free space on the right and bottom.
  - The ↩ link works.
  - After another snap, reopen the first one: the page picture is still there.
- [ ] **Insert screenshot:** on an empty page of any note, tap **Insert screenshot**. The newest screenshot appears centered at about 70% of the page, you can write on and around it, and the lasso can select and resize it. With an old screenshot (or "Always ask") the picker title reads "Insert which screenshot?".
- [ ] **Export page as PNG:** write something on a snap, then tap **Export page as PNG** right away. `EXPORT/<title> - p1.png` shows the page with your fresh writing, and a toast confirms it. Exporting again gives ` (2)`.
- [ ] **Settings persist:** change a setting, reinstall the plugin, and reopen the settings. The value is kept.
- [ ] **Failure is visible:** e.g. snap while the Note folder is unavailable. You get a "Snap failed: …" toast and end up back on the document, not on the blank helper note.

## Layout

| Path | What |
|---|---|
| `index.js` | Entry: `PluginManager.init()` and button registration |
| `src/plugin.ts` | Buttons and dispatch (busy guard, error toasts) |
| `src/features/snapPage.ts` | The page snap pipeline |
| `src/features/exportPng.ts` | Current note page → flattened PNG in EXPORT |
| `src/core/margin.ts` | Margin-mode layout and scaling |
| `src/features/pool.ts` | Blank notes made by `createNote` in the private dir, one per orientation |
| `src/features/annotateScreenshot.ts` | Newest screenshot (or the picker) → its own note / inbox page, or a picture on the current page |
| `src/ui/*` | Settings and picker screens (e-ink: no animation, large targets) |
| `src/platform/settingsStore.ts` | Settings as folders in the plugin's private dir |
| `src/sdk/sn.ts` | Typed wrapper over `sn-plugin-lib` (checks `APIResponse.success` and throws `SnApiError` with the API name and code) |
| `src/sdk/fs.ts` | The safe subset of the SDK's undocumented `FileUtils` |
| `src/sdk/wait.ts` | Waiting without timers (they freeze once another app is in front) |
| `src/core/*` | Pure logic, unit-tested: all paths and names, backlink layout, highlights, screenshots, settings encoding, timing |
| `assets/blank.note` | Blank note, copied out as the helper note (first snap only) |
| `assets/icon-*.png` | Toolbar icons; regenerate with `python3 scripts/make-icons.py` |
