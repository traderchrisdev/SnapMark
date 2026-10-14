# Build: SnapMark — "snap & annotate" plugin for Supernote Manta / Nomad

## Context

I want a Supernote plugin (official plugin SDK, currently beta) that lets the user capture what's on screen and immediately handwrite on it. It must be as seamless as possible: one tap from reading to writing, one tap back to where I was.

- Target devices: Supernote Manta (A5 X2, 1920×2560) and Nomad (A6 X2, 1404×1872), on the plugin-enabled firmware.
- I'm a TypeScript-first solo dev. I test on a real device. When something must be verified on hardware, give me the exact commands to run and what to look for in the output.

## Source of truth

The SDK is in beta and changes. Before writing code, fetch https://docs.supernote.com/llms.txt and read the doc page for every API you plan to use. If anything below conflicts with the docs, the docs win; tell me what changed.

Facts I've already checked (re-verify them):

- Scaffold: `npx @react-native-community/cli init SnapMark --template @supernote-plugin/sn-plugin-template --version 0.79.2`. React Native 0.79.2, SDK package `sn-plugin-lib`, packaged with `buildPlugin.sh`, installed on device from Settings → Apps → Plugins.
- Plugins run inside PluginHost. They can only add buttons to NOTE and DOC: `PluginManager.registerButton(type, appTypes, button)`, where type `1` = toolbar, `2` = lasso toolbar, `3` = DOC text-selection toolbar. `PluginButton.showType: 0` = no plugin UI is shown on press. There is also a config button for settings.
- `PluginDocAPI.generateCurrentDocImage(page, pngPath, size, type)` renders a page of the open document to PNG. Max 5120 px per side. `type: 1` keeps highlights/underlines.
- `PluginFileAPI.createNote({ notePath, template, mode, isPortrait })`. `template` accepts a custom image path.
- `PluginFileAPI.openFile(path, page)` opens a `.note` or document (pdf, epub, cbz, xps, fb2) at a page.
- `PluginNoteAPI.insertTextLink(...)` with `TextLink.linkType = 2` (document), `destPath`, `destPage` creates a tappable link to a specific page of a document.
- `PluginNoteAPI.insertImage(path)` inserts a png/jpg into the current layer of the open note page (NOTE only).
- Useful helpers: `PluginCommAPI.getCurrentFilePath()`, `getCurrentPageNum()`, `getPageDisplaySize()`, `PluginManager.getDeviceType()`, `getPluginDirPath()`.
- Permissions: the plugin's private dir needs no permission. `/sdcard/{Document,EXPORT,INBOX,MyStyle,Note,SCREENSHOT}` need `plugin.permission.FILE:READ` / `FILE:WRITE`, declared in `uses-permissions` in `PluginConfig.json` and requested at runtime with `hasPermission` / `requestPermission`. "Allow this time only" expires when the plugin exits; only "Always allow" persists. Error `1217` = encrypted, locked path.
- Native Supernote screenshots are saved as PNG in `/sdcard/SCREENSHOT`.
- Debug logs: `adb logcat` with tags `ReactNativeJS`, `PluginHost`, `SNPlugin`.

## UX goal: zero friction

- One tap from reading to writing. No dialogs, no file pickers and no naming on the happy path.
- Main actions use buttons with `showType: 0`. The plugin UI is used only for settings and for the screenshot picker fallback.
- Ask for file permissions once, on first run, with a one-line reason that steers the user to "Always allow". If denied, show a short clear message; never fail silently.
- E-ink friendly UI: no animations, high contrast, large tap targets, minimal re-renders.
- Every snap knows where it came from (backlink), so returning to the source is one tap.

## Features

### MVP

1. **Snap page** (DOC toolbar button)
   - Get the current document path and page. Render the page with `generateCurrentDocImage` (type 1) at device resolution into the plugin's private dir.
   - Compose a template image at device resolution: page scaled to fit, centered, white background.
   - Create `/sdcard/Note/Snaps/<DocTitle>/<DocTitle> - p<N> - <YYYY-MM-DD HHmm>.note` with that image as the template. Choose orientation from the page's aspect ratio.
   - Open it at page 0 and insert a small backlink at the bottom ("↩ <DocTitle>, p. N"): linkType 2, destPath = the document, destPage = the page.
   - The user is now writing on the snap. Saving is native (.note autosaves).

2. **Annotate last screenshot** (NOTE toolbar button)
   - Find the newest PNG in `/sdcard/SCREENSHOT`. If it's newer than 10 minutes (configurable), use it directly. Otherwise show a picker with the latest ~12 thumbnails.
   - Create a new snap note in `/sdcard/Note/Snaps/Screenshots/` with it as the template and open it.
   - This covers Kindle, the browser and any other app: take a native screenshot there, open any note, tap the button.

3. **Settings** (config button)
   - Destination folder.
   - Keep highlights on/off.
   - After snap: "open snap" (default) or "stay here" (silent snap + short confirmation, for batch capture while reading).
   - Screenshot freshness window.

### v2 (only after the MVP works on both devices)

- Margin mode: page scaled to ~75%, leaving a right/bottom writing margin (configurable).
- Snap region: lasso a region on the document page and crop the render to the lasso rect.
- Collect mode: append snaps as pages to one "Snaps inbox" notebook instead of one file per snap.
- Export a flattened PNG of an annotated snap to `/sdcard/EXPORT`.
- Insert a screenshot into the current note page (`insertImage`) instead of creating a new note.

## Phase 0: spike the unknowns first

Before building features, write a minimal throwaway plugin that tests each question below. Give me the steps to run it on the device, then record the results in `SPIKES.md`.

1. Does `createNote` accept a template image from the plugin's private dir, or must it live somewhere like `/sdcard/MyStyle`? Is the image embedded in the `.note` (so the temp file can be deleted), or only referenced?
2. After `openFile(note)` is called from a DOC button, can the plugin still call NOTE APIs (`insertTextLink`, `insertImage`) on the newly opened note? Is there a signal that the file is open, or do we need a short retry loop?
3. Does `generateCurrentDocImage` include the user's handwriting on the document page, or only the document itself? If only the document, is there a way to composite the handwriting (e.g. via the mark APIs)?
4. What is the correct output size per device? Do `getDeviceType` and `getPageDisplaySize` give us what we need for Manta and Nomad?
5. What's the best way to list and read files in `/sdcard/SCREENSHOT` from React Native under the plugin permission system (react-native-fs vs a small TurboModule)?
6. Image composition (scale, pad, crop): a JS library or a small Java TurboModule using Bitmap? Pick whatever is fastest on device.
7. Can `insertNotePage` take a custom image template? (Needed for collect mode.)

Stop after Phase 0. Show me the findings and any changes to this plan before starting Phase 1.

## Phases

- **Phase 0:** scaffold + spikes.
- **Phase 1:** Snap page, end to end on device.
- **Phase 2:** Annotate last screenshot + settings.
- **Phase 3:** polish: permission flow, error states, icons, naming edge cases (long titles, illegal characters, two snaps in the same minute, encrypted folders).
- **Phase 4:** v2 items, one at a time.

## Engineering rules

- TypeScript strict mode.
- A thin wrapper over `sn-plugin-lib` that checks `APIResponse.success` and throws typed errors that include the API name.
- All file paths built in one module; no hardcoded `/storage/emulated/0` scattered through the code.
- Least privilege: only `FILE:READ` and `FILE:WRITE`. No `INTERNET`.
- Clean up temp files in the private dir.
- Speed matters: measure and log time from tap to note open. Target under 2 seconds on Manta.
- README with build steps, install steps and a short manual test checklist for both devices.

## Acceptance criteria (MVP)

- From an open PDF or EPUB on Manta: one tap opens a new note showing that page, I can write immediately, and the backlink returns me to the same page.
- The same works on Nomad.
- From Kindle: native screenshot, open any note, one tap, and I'm annotating the screenshot.
- No dialogs on the happy path after first-run permissions.
- Files land under `Note/Snaps` with predictable, readable names.

Start with Phase 0.
