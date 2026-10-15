# SnapMark: Phase 0 spikes

These are the development notes behind SnapMark: what each experiment on a real Manta showed, and why the plugin is built the way it is. The throwaway spike plugin they mention isn't in this repository; its findings are recorded here.

**Status (2026-10-15):** Phases 0–3 are done, and Phase 4 is closed with 4 of 5 v2 items (collect mode, export PNG, insert screenshot, margin mode). Snap region is deferred because it needs native code. A floating-bubble spike (section 1l) showed that a plugin with native code can capture any screen, in any app, and open it as a note in about 1.3 s. SnapMark 0.8.0 builds it in as the "Floating capture button" setting, verified from a third-party app, Ratta Settings, a PDF and a note (R67). Everything is verified on the Manta only; there is no Nomad. Section 0 has the Phase 0 answers, and sections 1b–1l the run-by-run evidence (R1–R68).

## 0. Phase 0 answers (Manta)

| Q | Answer | Evidence |
|---|---|---|
| **Q1** Template from the private dir? Embedded? | **Yes and yes.** `createNote` (in NOTE) accepts a template image from the private dir, sdcard or MyStyle (60–300 ms). The PNG is **embedded in the `.note`** (blank 3 KB → 269 KB) and renders identically after the source is deleted, so temp files can be cleaned up. **But `createNote` is refused inside DOC (102)**: see Q9. | R1, R20, R21 |
| **Q2** NOTE APIs after `openFile` from DOC? Open signal? | **Yes, after a readiness wait.** `openFile` resolves *before* PluginHost re-targets calls to the newly opened app. **Signal: poll `getCurrentFilePath()` until it equals the opened file.** It flips at the same moment the target switches (`onOpenFilePath` → `toTopClientBinder`), 0–0.5 s depending on whether NOTE was warm. **The poll must not use `setTimeout`**: once the button's app leaves the foreground, the plugin's JS timers are paused (R34). Then `insertTextLink` (returns `0`), `insertImage` and `saveCurrentNote` all work, and the **↩ link returns to the right PDF page** (you confirmed this). | R22, R24, R34, R35, R37 |
| **Q3** Handwriting in `generateCurrentDocImage`? | **No**, and no marker strokes either; `type 1` only adds *text-selection* highlights. Handwriting is available as **strokes** via `getElements(page, doc)`. Those can be inserted into the snap note as **editable ink, in the right place, with no scaling**: the doc and note pages are both 1920×2560 (verified in the hop-1.0 capture). There's also a transparent overlay (`generateMarkThumbnails`) if ever needed. | R25, R38 |
| **Q4** Output size per device? | `getDeviceType()` = 5 on Manta. `getPageSize(note)` = **1920×2560 portrait, 2560×1920 landscape**. `getPageSize(doc)` and `getPageDisplaySize()` return the *screen* size, not the PDF's own page size. Don't trust the Android model string (it says "Nomad" on this Manta). The Nomad is untested. | R3, R7, R16 |
| **Q5** Listing/reading `/sdcard/SCREENSHOT` | **The SDK's own `FileUtils.listFiles`**: no react-native-fs and no native module. It returns `[{type, path}]` despite its `string[]` typing. Screenshots are named **`YYYYMMDD_HHMMSS.png`** (sorting by name = newest first; freshness can be parsed from the name) and are **full-resolution 1920×2560 RGB**. RN `Image.getSize` misreports them as 960×1280, so don't use it for dimensions. `getExternalDirPath` crashes the plugin; `exists`, `makeDir`, `copyFile` and `deleteFile` are safe. The native pickers (`RattaFileSelector`) are untested. | R2, R14, R17, R19, R30, R39 |
| **Q6** Composition: JS or Java? | **Neither is needed for the MVP.** `generateCurrentDocImage` already letterboxes onto opaque white at any requested size, and screenshots are already page-sized. **The note engine never scales a template** (a 960×1280 template sits unscaled in the middle), so renders must be done at full page size. Java (Stage B) would only be needed for v2 margin mode or region crop, and pure JS is impossible (D5). | R11, R38 |
| **Q7** `insertNotePage` with a custom image? | **Yes, in NOTE only** (sdcard or private path); `page: k` inserts before page k. Collect mode works once NOTE is on top. | R26 |
| Q8 Feedback without dialogs | `ToastAndroid` works and `showPluginView()` works from a `showType:0` handler. **No permission dialog was ever shown**: declared FILE:READ/WRITE were granted permanently without asking (to be checked on the Nomad or after revoking in Settings). | R6, R18, R32, R36 |
| Q9 Per-app API allowlist (new) | PluginHost sends each call to the **app currently on top** and checks an allowlist. **DOC refuses** `createNote`, `insertNotePage` and `getNoteTotalPageNum` (102). **DOC allows** `getPageSize(note)`, `insertElements(note, …)`, `openFile` and `FileUtils`. | R1, R23, R24 |
| **Speed** | **Tap → snap note open ≈ 3.2–3.7 s on Manta, not < 2 s.** The full-page render alone is about **2.1–2.4 s** and can't be shrunk (templates don't scale; render type and warm cache make no difference). Everything else is about 1.1 s plus a 0–0.5 s wait for NOTE. | R12, R35, R37 |

Sources: `https://docs.supernote.com/llms.txt` and all 154 English pages it links to (read 2026-10-12), plus the source of `sn-plugin-lib@0.2.3`, published to npm the same day.

---

## 1. What the docs changed (the docs win over SPEC.md)

| # | SPEC.md said | Docs / SDK actually say | Impact |
|---|---|---|---|
| D1 | `sn-plugin-lib` (no version) | The template pins `^0.1.19`, which resolves to **0.1.65**. Versions ≤0.1.65 use **EMR digitizer coordinates**. Every current doc page assumes **>0.1.65 (Android pixels, based on `getPageSize`)**. Latest is **0.2.3**, published 2026-10-12. | Pin `sn-plugin-lib@0.2.3` exactly (done in the spike). Expect churn. |
| D2 | Helper `getPageDisplaySize()` | **Deprecated** for >0.1.65. Use `PluginFileAPI.getPageSize(path, page)` for the current file and page. | Drop it. Use `getPageSize` on the doc page and on the new note. |
| D3 | `requestPermission` with a one-line reason that steers the user to "Always allow" | `desc` is **not shown on the first (three-option) dialog**. It only replaces the text of the "go to Settings" prompt shown after an earlier "Don't allow". The dialog **defaults to "Allow this time only"**. `-1` means the user cancelled. | We need our own one-line pre-prompt (plugin UI or `NativeUIUtils.showRattaDialog`) before calling `requestPermission`. Also call `hasPermission` on every run, not only the first. |
| D4 | `insertTextLink` | It returns a **status number** (`0` ok, `-1` fail, `-2` target file needs upgrade), not a boolean. Links only go on the **main layer**. For `linkType 2`, a `destPage < 0` jumps to the document's current page. | The wrapper must check `result === 0`, not just `success`. |
| D5 | Composition: JS library or Java | Neither the SDK nor RN can **write binary files from JS**, so a JS image library could decode an image but never save the template. | Q6 is really "no composition needed" vs "Java module". |
| D6 | "TurboModule" | The template has `newArchEnabled=false`. `buildPlugin.sh` treats native code as present when it finds an `add(XPackage())` in `MainApplication`, or a third-party module with Android sources. It then runs Gradle `buildCustomApkDebug`, ships the APK as `app.npk` and writes `nativeCodePackage` and `reactPackages` into `PluginConfig.json`. | Any native code means the build machine needs a JDK (docs: ≥19), Android SDK 35, build-tools 35.0.0 and the NDK. **This Mac has no JDK or Android SDK.** Pure-JS builds only need Node, python3/jq and zip, and they work here. |
| D7 | Install from Settings → Apps → Plugins | First copy the `.snplg` into **`/sdcard/MyStyle`** on the device, then Settings → Apps → Plugins → **Add Plugin**. | Covered in the run steps. |
| D8 | `getNoteSystemTemplates` | The docs contradict themselves (one page returns a raw `Template[]`, another treats it as an `APIResponse`). The SDK source returns the raw native value. | The wrapper accepts both shapes. |
| D9 | Typed wrapper "checks `APIResponse.success`" | The SDK's `.d.ts` types **every** API as `Promise<Object \| null \| undefined>`. | The typed wrapper is required, not just nice to have. |
| D10 | — (not in the spec) | **Undocumented** SDK modules exist in 0.2.3: **`FileUtils`** (`listFiles`, `exists`, `makeDir`, `copyFile`, `renameToFile`, `deleteFile`, `deleteDir`, `getImageList`, `getExternalDirPath`, `getFileMD5`, …), **`RattaFileSelector`** (`selectImage`, `selectFile` limited to a folder), **`NativeUIUtils`** (`showRattaDialog`) and `NativePluginManager.getOrientation`. | These may remove the need for any native code (Q5) and for a custom picker. Because they're undocumented they can change, so hide them behind our own `fs` module. |
| D11 | — (not in the spec) | `PluginFileAPI.insertElements(notePath, page, [Link / Picture element])` writes to a note **at file level, without opening it**. Links must be on layer 0. | A possible race-free backlink: insert it before `openFile` (Q2-alt). Also a possible way to avoid composition entirely (Q6, "Picture element"). |
| D12 | Log tags `PluginHost`, `SNPlugin` | Not in the docs. JS `console.log` goes to `ReactNativeJS`. | The log command below greps broadly in case those tags don't exist. |
| D13 | Config button | `registerConfigButton()` puts the entry on the **plugin management page** in Settings, not in a toolbar. The listener gets `onClick()`. | Settings are reached from Settings → Apps → Plugins. The spike also tests `showPluginView()` from `onClick`. |

Confirmed as written in SPEC.md: the scaffold command (RN 0.79.2), `registerButton(type 1/2/3, appTypes, button)` (type 3 is DOC only), `showType: 0`, `generateCurrentDocImage(page, png, size ≤5120, type 1 = highlights)`, `createNote({notePath, template, mode, isPortrait})` (where `template` is a system name *or* an image path), `openFile` (pdf/epub/cbz/xps/fb2/note, page `-1` = last viewed), `insertImage` (png/jpg/jpeg, current layer, NOTE only), `getDeviceType` (`4` Nomad, `5` Manta), the permission names, the six shared dirs, error `1217`, and the private dir `/data/data/com.ratta.supernote.pluginhost/files/plugins/<pluginID>`. Extra error codes: `1500` (permission not declared), `1501` (no write access), `1502` (unknown permission), `1503` (no read access).

---

## 1b. Run 1 on the Manta (2026-10-14, spike v0.0.1, partial)

Source: your filtered log, plus the full `adb logcat -d` I pulled from the device.

| # | Finding | Evidence | Impact |
|---|---|---|---|
| R1 | **`createNote` fails inside DOC with error `102`, "This app is not allowed to use this API".** PluginHost sends *every* API, `PluginFileAPI` included, through the app on top (`toTopClientBinder`). It then checks a per-app allowlist (`HostCommImpl checkAPIAvailable packageName:com.supernote.document==createNote`). The docs never mention this; they imply file APIs work everywhere. | Fast snap: `createNote failed [102]` | **SPEC.md's "Snap page" flow (DOC button → createNote) doesn't work as written.** Run 2 tests the alternatives (Q9). |
| R2 | **The undocumented `FileUtils.getExternalDirPath()` crashes the plugin** when called from a `showType:0` button. It throws a native NPE in `RTNFileModule.getExternalDirPath`, because it needs an Activity and there is none. PluginHost's `PluginJSExceptionHandler` then closes the plugin (life states 4→5) and reloads it about 10 s later. You **can't catch this from JS**. | Probe stopped right after `hasPermission` | Removed from the spike. Every undocumented `FileUtils` call needs testing from `showType:0` before we rely on it. `makeDir` already worked there. |
| R3 | **`getPageSize(doc, page)` returns the screen-sized page (`1920x2560`)**, not the PDF page's own size (`rotationType:1000`). | DOC client log | We can't pick the snap's orientation from it. Run 2 checks the r3 square render (stretched or letterboxed?). |
| R4 | **Rendering is slow:** `generateCurrentDocImage` at 1920×2560 (type 1) took **~2.06 s**, on a compressed PDF, page 176. That alone is over the 2 s budget. | `render 2077` | Run 2 compares a warm render, type 0, half size and square. A smaller or cached render may be needed. |
| R5 | `generateCurrentDocImage` into the **plugin's private dir returned `true`** (DOC process). | Fast snap passed the render step | Whether NOTE can then *read* that file is still open (Q1). |
| R6 | FILE:READ/WRITE were **already permanently granted** (`PluginSecurityMgr grantPermission … permanent=true`), and `requestPermission` was never called. | Every button press | Open: did the install itself grant them? Q8 still needs a fresh install to see the dialog. |
| R7 | The device's Android model string says **"Supernote Nomad"**, but it is a Manta: `wm size` 1920×2560, `getDeviceType()`=5, firmware `Chauvet.E103.2610091001.2545_release`. | `adb shell getprop` | Never use the Android model string. Use `getDeviceType()`. |
| R8 | Button events carry extra fields: `pressEvent` (3), `color`, `bgColor`. | Button event JSON | — |
| R9 | `/sdcard/SCREENSHOT` exists but is **empty**. No native screenshot had been taken yet. | `adb shell ls` | Take one before run 2. |
| R10 | Config button → `showPluginView()` **works**, and the Spike Lab UI rendered. | Life states 2→3 | — |

## 1c. Run 2 on the Manta (2026-10-14 11:46, spike v0.0.2, partial)

Only "Spike: probe" completed. "Spike: shots" was never tapped (PluginHost shows its last-used time as 0), so there were no seed notes and the DOC strategies were skipped. "Spike: fast snap" was tapped while the probe was still running and was dropped as busy. The probe gave no on-screen feedback, so v0.0.3 adds start and done toasts and numbered button names. Renders are in `spike-out/manta/SnapMarkSpike/20261014-114659/`.

| # | Finding | Impact |
|---|---|---|
| R11 | **`generateCurrentDocImage` letterboxes.** The square 1536×1536 render keeps the page's aspect ratio and centers it on **opaque white** bars (RGBA 255,255,255,255). The 1920×2560 render fills the frame. | **Q6 for "Snap page": no composition needed.** Render at the note's page size and use the PNG as the template. Margin mode still needs something else. |
| R12 | **Render time grows with pixel count:** about **0.3 s + 0.36 s per megapixel**. 1920×2560 takes 2079 ms (type 1), 2074 ms (type 0) and 2066 ms (warm); 960×1280 takes 820 ms; 1536² takes 1115 ms; 300×400 takes 319 ms. Writing to `/sdcard` takes 2209 ms. Type 0 vs 1 and warm vs cold make no difference. | A full-resolution snap can't get under 2 s from the render alone. Options: render at about 0.75× and let the template scale up (if N4 shows the engine scales), or accept about 2.5 s. To be decided after run 3. |
| R13 | The private dir is `/data/user/0/com.ratta.supernote.pluginhost/files/plugins/<id>`; `/data/data/…` in the docs is the same thing. DOC **writes there fine**, and PluginHost sees the file (`exists` returns true after 26–74 ms). | The render side of Q1 is **OK**. |
| R14 | `FileUtils.exists`, `makeDir` and `copyFile` are **safe from `showType:0`**. `copyFile` from the private dir to `/sdcard/EXPORT` works in 11–36 ms. | They can go in the `fs` module's safe list. |
| R15 | `generateMarkThumbnails` → **`1302` "The annotation page does not exist"** on a page without marks. `getMarkPages` = [148, 150, 151, 154, 157, 163, 164, 167]. The tested page (index 175) had **no marks** and no highlights (r1 == r2 byte for byte). | Q3 is still open. Run 3 must use a page that has handwriting and a highlight, flipping away and back first so the marks get saved. |
| R16 | `getPageSize(doc)` and `getPageDisplaySize()` both return 1920×2560. `getOrientation()` = 0. RN `Dimensions` gives 1024×1365.33 dp at ratio 1.875, which is 1920×2560 px. | Confirms R3. |
| R17 | Native screenshot naming is **`YYYYMMDD_HHMMSS.png`** (e.g. `20261014_114808.png`, 639 KB), in `/sdcard/SCREENSHOT`. | Sorting by name gives newest-first, and the freshness check can parse the time from the name. No mtime API needed. |
| R18 | No permission dialog appeared at install, yet FILE:READ and FILE:WRITE were already granted permanently. | **Open question for the permission flow:** maybe sideloaded or dev installs auto-grant declared permissions. We need to test a clean device or a revoke in Settings before designing the first-run prompt. |

## 1d. Run 3 on the Manta (2026-10-14 12:11, spike v0.0.3)

"1 Spike: shots" ran until the `listFiles` crash (R19), and "2 Spike: probe" ran completely. Fast snap was tapped during the probe and dropped as busy. Log: `spike-out/manta/run3-device.log`. Renders: `spike-out/manta/SnapMarkSpike/20261014-121215/`.

| # | Finding | Answers |
|---|---|---|
| R19 | `FileUtils.listFiles` returns **`[{type: 1, path}]`**, not `string[]` as its `.d.ts` claims. My `.filter(f => f.endsWith…)` threw "undefined is not a function", which ended "1 Spike: shots" after Q7. Fixed in v0.0.4 with `listPaths()`. | Q5 |
| R20 | `createNote` in **NOTE** accepts a template from the **private dir, sdcard and MyStyle** (61–78 ms). `getNotePageTemplate` → `{name: "user_<file basename>", md5: "<md5 of the PNG>_<counter>"}`. | **Q1: any location works.** |
| R21 | **The template is embedded in the `.note`.** The blank seed is 3,110 B; N1 is 268,934 B (the 266,304 B PNG plus the seed). After deleting the source PNG, `generateNoteTemplatePng(N1)` is **byte-identical** to the original (same md5). H1 (689 KB template) → 692 KB. | **Q1: the temp render can be deleted after `createNote`.** |
| R22 | From DOC, `openFile(note)` resolves in **700 ms**. Right after that, `getCurrentFilePath` already returns the note. **`insertTextLink` works on the first try (returns 0, about 1 s)**, `insertImage` works (0.7 s) and `saveCurrentNote` works. | **Q2: no wait or retry loop needed.** Visual check of the links still pending. |
| R23 | **DOC allowlist:** **OK** for `getPageSize(note)`, `insertElements(note, [link])` (151 ms), `insertElements(note, [picture, link])` (1,982 ms) and `FileUtils.copyFile`. **102** for `createNote`, `insertNotePage` and `getNoteTotalPageNum`. | Q9 |
| R24 | **After `openFile` from DOC, `createNote` works** (181 ms, H1 created). PluginHost sends each call to whichever app is on top, not to the app whose button was pressed. | Q9: a DOC button can do NOTE-only work after it opens a note. |
| R25 | **The page render contains no handwriting.** r1 is byte-identical before and after adding a circle and a marker stroke, and type 1 == type 0 (type 1 only adds *text-selection* highlights, not marker strokes). `getMarkPages` now includes 175. `getElements(175, pdf)` → 2 strokes. **`generateMarkThumbnails` → a transparent 1920×2560 PNG with just the handwriting**, in the same frame as the render (647 ms). | **Q3: handwriting isn't in the render.** It's available as an overlay PNG or as strokes. v0.0.4 copies the strokes into the snap (vector, editable; the doc and note pages are both 1920×2560). |
| R26 | `insertNotePage` with a custom image works **in NOTE** (sdcard and private paths). `page: k` inserts **before** existing page k. The seed's system template on Manta is named `style_white_a5x2`. | **Q7: yes, in NOTE only** (collect mode needs NOTE on top). |
| R27 | System template names come back as a raw `string[]` of 28 names, e.g. `style_white`, `style_8mm_ruled_line`… `createNote` with `"style_white"` works. | D8 |
| R28 | Mid-probe, calls that normally take 2–5 ms (`exists`, `copyFile`) took **400–550 ms**, and `getElements` took 1 s. This coincided with new files appearing in `Note/` and `EXPORT/`, which the cloud sync service watches (`XL-L-filewatcher`, `FileSyncManager`). | Hypothesis: sync activity slows the plugin. Keep temp files in the private dir; v0.0.4's fast snap will show the uncontended cost. |
| R29 | The run-3 "shots" test used a page of a **personal note** (not a scratch note) as its test image. Copies are in `EXPORT/SnapMarkSpike/20261014-121157/`, `MyStyle/SnapMarkSpike-20261014-121157.png`, N1–N3 and S7 on the device, and in `spike-out/manta/SnapMarkSpike/20261014-121157/` on the Mac (not opened; compared by checksum only). | The cleanup command removes the device copies. v0.0.4 no longer renders the current note page. |

## 1e. Run 4 on the Manta (2026-10-14 12:17, spike v0.0.4)

"1 Spike: shots" ran to the end. Only **one** fast snap ran (variant "picture"); a tap on "2 Spike: probe" during it was dropped as busy.

| # | Finding | Answers |
|---|---|---|
| R30 | `listPaths(/sdcard/SCREENSHOT)` → OK in 42 ms. RN `Image.getSize(file://…)` works (168 ms). **Native screenshots are 960×1280, half the panel resolution.** | Q5: the SDK's `FileUtils` is enough; no native module or react-native-fs needed. |
| R31 | `createNote` in NOTE with a screenshot (N5), a square render (N4) and a half-size render (N4b) as the template: all OK. `openFile` NOTE → NOTE takes **26 ms** and is ready 230 ms later. | The visual check of how a smaller template is laid out is automated in v0.0.5 (`earlier-N4*.png`, `earlier-N5*.png`). |
| R32 | `showPluginView()` from a `showType:0` handler → `true`. `ToastAndroid.show` raised no error. | Q8: the UI can be opened from a no-UI button. Whether toasts actually appear still needs your eyes. |
| R33 | **Fast snap, variant "picture":** perm 253 · ctx 8 · **render 2414** · copySeed 271 · readStrokes(2) 333 · **insertElements(picture + 2 strokes + link) 2190** · openFile 397 → **tap → note open 5.9 s**. | A full-page Picture element is far too slow. v0.0.5's bench tests the "hop" pipeline instead, with a real template, at 1.0/0.6/0.5 render scale. |

## 1f. Run 5 on the Manta (2026-10-14 12:22, spike v0.0.5, "4 Spike: bench")

| # | Finding | Answers |
|---|---|---|
| R34 | **When our button's host app leaves the foreground** (here: `openFile` of a note from DOC), PluginHost calls `stopPlugin` → **`onHostPause` on the plugin's RN host**. From then on, **`setTimeout` doesn't fire** until the plugin resumes on the next button press. Native API promises still resolve. The bench hung on its first `sleep()`; nothing crashed. | **Design rule:** no timer-based waits, retries or polls after `openFile` switches apps. Run 3 showed none are needed. Spike v0.0.6 uses `nativeDelay()`, which waits by spinning on a cheap native call. |
| R35 | **"hop" pipeline, full-size render:** render 1920×2560 **2165** · strokes(2) + link 111 · open helper note **37** · `createNote(target, template = render)` **299** · `insertElements(2 strokes + link)` **592** · `openFile(target)` **30** → **tap → snap note open 3.24 s**. You confirmed **the ↩ link returns to the PDF page**. | Q2 confirmed end to end. Everything except the render takes about 1.1 s, so a 0.5× render (about 0.8 s) should land near 2 s. That depends on the template being scaled to fill the page (bench v0.0.6 captures N4b and hop-0.5). |
| R36 | You saw some toasts. | Q8: `ToastAndroid` works over DOC/NOTE, so it can be the "stay here" confirmation. |

## 1g. Run 6 on the Manta (2026-10-14 12:29, spike v0.0.6, "4 Spike: bench")

| # | Finding | Answers |
|---|---|---|
| R37 | **Race:** `openFile` resolves about 70 ms after the intent is sent, but PluginHost only re-targets calls when the opened app's activity resumes and reports `onOpenFilePath` → `toTopClientBinder`. That was about 490 ms later here with a cold NOTE app. So `createNote` and `insertImage` right after `openFile` went to DOC and got **102**, and `getCurrentPageNum` went to the wrong app. Runs 3 and 5 only worked because NOTE happened to be warm. **Readiness signal = `getCurrentFilePath()` returning the newly opened file** (it changes at the same moment). | Q2 (corrects R22). Spike v0.0.7 waits on it. |
| R38 | Captures via `generateNotePng` (allowed in NOTE). **hop-1.0 snap**: page render as the template, your circle and marker stroke as **ink at the right spots**, and the backlink at the bottom with a link icon. **N4b** (960×1280 template on a 1920×2560 page): drawn **unscaled and centered**, so **templates are never scaled**. **D1**: both backlinks render (file-level and `insertTextLink`). **`insertImage` puts a picture at its native pixel size, centered.** | Q3, Q6, Q2 |
| R39 | `/sdcard/SCREENSHOT/20261014_114808.png` is really **1920×2560 RGB** (IHDR). RN `Image.getSize` reported 960×1280. **N5** (screenshot as template) **fills the page**. | Q5 (corrects R30), "Annotate last screenshot" needs no processing |
| R40 | `openFile(doc, page)` from NOTE (what the ↩ link does) brings DOC back in 62–314 ms. | — |

## 1h. Marker highlights in snaps (2026-10-14 12:59, spike v0.0.8, "5 Spike: marker")

DOC marker strokes are `penType 11`, `penColor 202`, thickness 3800. The DOC mark overlay stores them as **black at alpha 53/255** (≈ 21%), which over white is exactly gray 202, so **DOC alpha-blends markers**.

Test: one note per variant, with the page render as the template, and pixels measured where the page has text under the marker (4,721 pixels):

| Variant | Text visible under the highlight |
|---|---|
| copied as-is (202, main layer) | 1% (solid gray 202) |
| NOTE light gray 201 | 1% |
| NOTE dark gray 157 | 1% |
| custom layer 1 | 1% |
| background layer -1 | rejected by `insertElements` (106) |
| mark overlay as a translucent Picture element | 1% (the picture's alpha is flattened onto white) |

| # | Finding | Impact |
|---|---|---|
| R42 | Stroke `thickness` is in **1/100 px**. A 3800 marker paints a 38 px band (measured in the overlay), and the 700 pen is 7 px (≈ 0.6 mm at 300 dpi). | SnapMark converts each marker into a 3 px dark-gray (157) technical-pen stroke along the same path, shifted down by half the band + 2 px (your choice, 2026-10-14). |
| R41 | **NOTE paints marker strokes, and Picture alpha, opaque over the template.** No element form or layer keeps the text readable. Text-selection highlights (`generateCurrentDocImage` type 1) are part of the render, so they're fine. | Faithful marker highlights need the marker **blended into the template image** (multiply). That needs pixel work, so native code (Stage B, which needs JDK + Android SDK). Without native code: drop markers, or convert them into something that doesn't cover text. |

## 1i. Phase 2 findings (2026-10-14, SnapMark 0.2.0)

| # | Finding | Impact |
|---|---|---|
| R43 | **Deleting under `/sdcard` without `FILE:DELETE` is fatal.** `FileUtils.deleteDir("/storage/emulated/0/Note/.snapmark/settings/afterSnap=…")` threw a native `SecurityException` and PluginHost killed the plugin (the settings page vanished on the second change of a setting). Creating folders there was fine with `FILE:WRITE`. | Settings moved to the plugin's private dir, where delete needs no permission. `fs.remove`/`removeDir` now refuse non-private paths in JS. |
| R44 | `FileUtils.listFiles` on a missing folder throws "Dir is not exists". | `fs.list` checks `exists` first. |
| R45 | **Screenshot picker → `createNote` → `openFile` from NOTE: 0.54 s** (`createNote` 108 ms, open 19 ms). The `showType:1` picker over NOTE doesn't change who PluginHost treats as the app on top. | "Annotate screenshot" is fast; no helper note needed. |

## 1j. Phase 3: removing the helper note (2026-10-14 14:32, spike v0.0.9, "6 Spike: no-hop")

| # | Finding | Impact |
|---|---|---|
| R46 | **The helper note shows in Recent Files** after every page snap (both `Note/.snapmark/hop.note` and the old `Note/Snaps/.snapmark/hop.note`). | The reason to replace the hop. |
| R47 | **Opening the snap note itself and swapping its page from NOTE works.** Copy a blank to the final path → `openFile` (NOTE on top 0.15 s later) → `insertNotePage(1, render)` 252 ms → `insertElements(page 1, 10 strokes + link)` 876 ms → `removeNotePage(0)` 37 ms → `reloadFile`. Result: one page, PDF background, all ink, backlink, nothing else in Recent Files. | Viable without the hop. |
| R48 | **`reloadFile` reloads NOTE but never answers the plugin** (the request is sent, NOTE reloads its layers, no response arrives). | Fire it without awaiting; whether later calls still work is being checked (spike v0.0.10). |
| R50 | Spike v0.0.10: **`createNote` from NOTE can write into the plugin's private dir** (87 ms). A copy of that blank has its own `FILE_ID`, and deleting it there needs no permission. After a fire-and-forget `reloadFile`, later calls work (this time it even answered). SnapMark 0.3.0 ships it: pool snap 3.8 s (note visible at 2.65 s), unique IDs, user writing persists after reopening, same-minute ` (2)` naming verified. | Helper note only on the very first snap. |
| R51 | NOTE's **own** marker also paints opaque over a template (user test in the 0.3.0 snap). | Confirms R41 is NOTE behavior, not a SnapMark bug. |
| R49 | **Every copy of a `.note` keeps its `FILE_ID`** (header `<FILE_ID:F…>`). The no-hop note, D1 and D2 all carry the blank's ID; `createNote` gives each note a unique one. | Copying the bundled blank would give every snap the same ID (risk for sync, links and indexes). Planned fix: a pool of `createNote` blanks in the plugin's private dir, one copied out per snap and then deleted (being checked in spike v0.0.10). |

## 1k. Phase 4: collect mode (2026-10-14 15:11, SnapMark 0.4.0)

| # | Finding | Impact |
|---|---|---|
| R52 | **Appending to the open inbox works.**<br>• The first snap creates it (pool path, 3.8 s).<br>• Then: `saveCurrentNote` 187 ms → `getNoteTotalPageNum` 32 ms → `insertNotePage(count)` 130 ms → `insertElements` ~1.0 s (even for just the link) → fire `reloadFile` → `jumpToPage(new)`.<br>• Snaps went to page 2 (open, 6.1 s) and page 3 ("stay", 5.0 s).<br>• Annotate screenshot appended page 4 to the closed inbox in 0.48 s. | Collect mode verified. |
| R54 | **Export page as PNG** (0.5.0): `saveCurrentNote` (NOTE logs `saveNoteData: isSave true` when there are new strokes) → `generateNotePng(type 1)` → copy to EXPORT. The flattened 1920×2560 PNG includes strokes written seconds before. About 1 s total. | Export verified. |
| R55 | **`insertImage` of a full-screen screenshot (1920×2560) into a 1920×2560 page scales it to about 69% (≈1318×1757), centered**, in 0.28 s. A 300×400 image went in at its own size (R38), so large images are shrunk to keep a margin. **On screen, the picture's white areas are see-through** (the page's grid shows through), and ink written afterwards goes on top. Note: `generateNotePng` flattened a translucent picture onto white (R41), so on-screen and exported rendering may differ. | "Insert screenshot" verified (0.6.0). To fill the page instead, `insertPageElements` with a full-page Picture rect is the candidate (untested). |
| R56 | **Race: after `openFile(B)` + `waitUntilCurrent(B)`, current-page APIs can still hit the previously open note A.** PluginHost already routes to NOTE (and `getCurrentFilePath` says B), but NOTE is still switching notes. Margin mode 0.7.0 used `insertPageElements` right after opening snap 2: its picture, strokes and link landed in snap 1 (modified at 19:50, now 4.27 MB), and snap 2 stayed blank (6.5 KB). The first snap worked because NOTE came up fresh from DOC. | Never use current-page APIs right after an `openFile` that switches notes. Pass explicit paths, ideally finishing the file before opening it. Margin mode 0.7.1 builds the snap at file level (DOC allows `insertElements` with pictures, R23) and only then opens it. |
| R57 | **Margin mode 0.7.1 (file-level build, then open):** 3.3–3.4 s per snap (render 1.5 s at 1440×1920, file-level `insertElements(picture + 3–4 scaled strokes + link)` 1.3 s, open 0.15 s). Each snap gets only its own page (1.47 MB / 1.62 MB files). The picture is embedded: it is still shown after the temp render was deleted and the next snap cleared the temp dir. | Margin mode verified. |
| R53 | The **reload takes ≈1.4 s** to land. A `jumpToPage` before then returns `true` but is undone by the reload, so the plugin has to check `getCurrentPageNum` and retry. | The jump is checked and retried (it stuck on attempt 3). The cost can only be avoided by editing a closed inbox, which needs the helper note (R46). |

## 1l. Floating bubble: capture any screen (2026-10-15, spike v0.0.11–0.0.13)

The spike adds a native module (`SpikeBubbleModule.java`) and the button "7 Spike: bubble". The overlay technique follows SuperDashboard (github.com/AgP42/SuperDashboard, MIT). The Mac now has JDK 17 and the Android SDK, so native code builds; the first build takes ~5 min.

| # | Finding | Impact |
|---|---|---|
| R58 | **PluginHost runs as Android's system user:** `uid=1000(system)`, SELinux `u:r:system_app:s0`, `sharedUserId android.uid.system`, targetSdk 35, Android 11 (SDK 30).<br>• It holds READ_FRAME_BUFFER, CAPTURE_VIDEO_OUTPUT, INJECT_EVENTS, DUMP, WRITE_SECURE_SETTINGS and all-files access.<br>• Plugin native code runs inside that process with the same rights. | Screen capture needs no prompt. Least privilege now rests on what our code does, not on the manifest: keep the native surface small. |
| R59 | **A `TYPE_APPLICATION_OVERLAY` bubble works over every app.** It stays on screen in notes, PDFs, third-party apps (QuickBible) and Ratta Settings.<br>• Taps reach a module-scope `DeviceEventEmitter` listener in JS (`hasActiveReactInstance` true) from any app.<br>• A plugin update needs `am force-stop com.ratta.supernote.pluginhost` before the new native code runs. That also removes the bubble. | The bubble is a viable trigger. |
| R60 | **All three capture methods work from PluginHost** and give a real 1920×2560 image of whatever is on screen:<br>• `screencap -p`: 1.5–2.0 s, writes straight to /sdcard too.<br>• `screencap` piped to stdout: 1.5 s.<br>• `SurfaceControl.screenshot(Rect,int,int,int)` in-process: 1.3 s.<br>Removing the bubble window and waiting 150 ms before the capture keeps it out of the image. | Use SurfaceControl in-process. |
| R61 | **Almost all of the capture time was PNG encoding.**<br>• The SurfaceControl screenshot itself takes 18–19 ms.<br>• `Bitmap.compress(PNG)` of the ARGB bitmap took 1.4 s.<br>• Our own encoder (8-bit gray, no row filters, `Deflater.BEST_SPEED`) took 353 ms for 490 KB, and NOTE accepts the result as a `createNote` template.<br>• Native screenshots are 8-bit RGB PNGs. | Use our own gray PNG encoder; an RGB variant is there if a device needs it. |
| R62 | **A full-screen capture used as the template sits under NOTE's toolbars:** the side toolbar covers ~120 px on the left and the page bar ~120 px at the bottom (user report, run 2).<br>• Composing onto white, scaled by 0.929 into insets of 136 px left and 136 px bottom, leaves all content visible (run 3). Composing takes 242 ms. | The same applies to native screenshots in "Annotate screenshot". The toolbar side (left, right, hidden) is the user's choice in NOTE, so it needs a setting. |
| R63 | **Which app is in front:** `ActivityManager.getRunningTasks(1)` works from PluginHost (system uid) in 2 ms; `dumpsys activity activities` takes ~50 ms. SuperDashboard's note that `getRunningTasks` only sees PluginHost does not hold on this firmware. | Route by package: NOTE `com.ratta.supernote.note`, DOC `com.supernote.document`, anything else. |
| R64 | **SDK calls depend on the app in front:**<br>• NOTE: `createNote` works.<br>• DOC: `createNote` is refused (102), but SDK `openFile` of a note works, and so does the hop (3.3 s total in run 1).<br>• Third-party app: `getCurrentFilePath` returns the last NOTE file (stale), and `createNote` and `openFile` fail with **118** ("The handwriting app is not open").<br>• **Ratta Settings** hosts a plugin client: `getCurrentFilePath` was routed to it and never answered, which locked the bubble. | Never call the SDK before NOTE or DOC is in front. Race every SDK call against a native timer, because JS timers stall while another app is in front (R34). Reset a stuck busy flag. |
| R65 | **Switching to NOTE natively:**<br>• `ActivityManager.moveTaskToFront(<NOTE task>)` brings NOTE back with its last note in 11 ms, and `createNote` then works on the first try (134–159 ms).<br>• An intent to `NoteInsidePagesActivity` with `file_path` + ACTION_VIEW also works (SuperDashboard's). It needs a wait: `createNote` 20 ms after the intent still got 118, and NOTE became the plugin client ~40 ms after the intent. | Use task-to-front; fall back to the intent with a known note. Poll the foreground and retry `createNote` while it returns 118. |
| R66 | **End to end, from QuickBible (run 3):** tap → capture + compose + encode 0.87 s → NOTE in front → `createNote` → `openFile` → the note shows it: **1.3 s** in total (2.15 s in run 2 with Android's encoder). | The bubble feature is feasible and fast. Not tested yet with 0.0.13: taps in Settings, in a PDF and in a note. |
| R67 | **SnapMark 0.8.0 on the Manta:** tap → note open in **1.04 s** from QuickBible, **0.89 s** from Ratta Settings (the case that hung in 0.0.11; no SDK call now runs before NOTE is in front), **1.16 s** from a PDF, and **0.77 s** from a note.<br>• Capture 0.67–0.81 s (shot 20–32 ms, fit 156–234 ms, gray PNG 237–328 ms).<br>• NOTE in front 20–53 ms after the switch; `createNote` + `openFile` 92–297 ms. | Floating capture button verified. Not tried yet: "Stay here" (return to the app), collect mode, restore after a reboot, landscape. |
| R68 | **SnapMark 0.9.0 on the Manta:**<br>• The button is smaller (32 dp, ~5 mm) and its dragged position survives a PluginHost restart (kept in PluginHost's SharedPreferences `snapmark_bubble`).<br>• Notes are named after the source: the app label from PackageManager (`eBiblia`), `<PDF title> - p<N>`, or the open note's title.<br>• In DOC, `getCurrentFilePath` + `getCurrentPageNum` answer from the bubble path just as from a button. A file-level `insertElements([link])` on the fresh note costs ~0.5 s, and the ↩ link opens the PDF on that page.<br>• Tap → open: 1.27 s (app), 1.57 s (PDF with link), 0.79 s (note). | Naming, backlink, size and position verified. |

---

## 2. How to run the spike

The spike is a separate throwaway plugin ("SnapMark Spike", its own `pluginID`), so it won't collide with SnapMark later. Spike **v0.0.3** is already at `/sdcard/MyStyle/SnapMarkSpike.snplg` on the Manta.

| Button | Where | showType | What it does |
|---|---|---|---|
| **1 Spike: shots** | NOTE toolbar | 0 | **Run this first.** Creates the seed notes (`Note/SnapMarkSpike/seed/`). Covers Q1 (template location and embedding), Q7, Q5, and the NOTE API matrix. Then it opens a note, shows a toast and calls `showPluginView()`. |
| **2 Spike: probe** | DOC toolbar | 0 | Renders (Q3, Q4, Q6) and the DOC API matrix. Builds D1 (seed + `insertNotePage`) and D2 (seed + Picture element). Opens D1, then calls NOTE APIs on it and tries `createNote` again (Q2, Q9). |
| **3 Spike: fast snap** | DOC toolbar | 0 | The bare snap path. It tries strategies A → D → B → C (see `src/spikeFast.ts`) and times each step. |
| **Spike Lab** | NOTE + DOC toolbar, and the config button | 1 | On-device log viewer, plus permission request, native pickers, thumbnail grid and Stage B. |

### Before you start (each device)
1. Connect over adb and check that `adb devices` lists the device.
2. **Take a native screenshot** (anywhere, e.g. Kindle). `/sdcard/SCREENSHOT` was empty in run 1.
3. Create a **scratch note** (e.g. "spike scratch") and scribble on page 1. "1 Spike: shots" uses the current page as its test image, so don't run it inside a personal note.
4. In a PDF, on the page you'll test, **highlight some text** and **handwrite a few strokes**. Do the same in an EPUB.

### Steps

**Install the update.** On the device: Settings → Apps → Plugins → Add Plugin → SnapMarkSpike.snplg → Install. If it refuses because the plugin already exists, uninstall "SnapMark Spike" first and install again. Note whether a **permission dialog** appears at install or on the first tap (R6).

To rebuild and push yourself (from anywhere):

```bash
cd SnapMarkSpike && ./buildPlugin.sh && adb push build/outputs/SnapMarkSpike.snplg /sdcard/MyStyle/
```

**Log capture:** if the device stays connected over USB, I capture the full log from the Mac myself, so you don't need to do anything. Otherwise, capture it in its own terminal. Use `manta` or `nomad` in the filename. This filter now also catches native crashes (`PRETTY_LOGGER`) and the API allowlist checks:

```bash
cd SnapMarkSpike && adb logcat -c && adb logcat -v time | grep --line-buffered -E 'ReactNativeJS|PRETTY_LOGGER|checkAPIAvailable|PluginApp|AndroidRuntime' | tee spike-manta.log
```

Then on the device, **in this order**:

1. **NOTE app, scratch note:** open the Plugins (puzzle-piece) menu in the note toolbar and tap **1 Spike: shots**. It only exists in NOTE, not in DOC. It ends by opening a note and popping up the Spike Lab log.
   - **Look for:** the toast, and the log view opening on its own.
   - Close the Spike Lab.
2. **DOC, PDF, the marked-up page:** tap **2 Spike: probe**. It ends on note **D1**. Wait for the "done" toast (about 20 s) before tapping anything else.
   - **Look for on D1:** the page image as background, a small thumbnail (`insertImage`), and up to **two** `↩ <title>, p. N` links at the bottom. The lower one was added at file level, the upper one by `insertTextLink`.
   - **Tap each link:** each must reopen the PDF on the same page.
3. **DOC, PDF, another page:** tap **3 Spike: fast snap** 3 times, going back with the link each time. **Look for:** `[RESULT] Perf.fast-snap strategy X | … TOTAL … ms`, and whether you can write on the note immediately.
4. Repeat steps 2–3 in an **EPUB**.
5. **NOTE, scratch note:** tap **1 Spike: shots** again. With a DOC render now present, it adds test N4 (square template).
6. In **Spike Lab**:
   - Tap **Show 12 thumbnails**.
   - Tap **Picker: selectFile** and pick a screenshot.
   - Tap **Picker: selectImage** (pick or cancel).
7. **Visual checks:** in the NOTE file browser, open `Note/SnapMarkSpike/` and look at each note. For each, note: is the background shown? Full page, stretched, or centered with white bars?
   - **N1:** its source image was deleted; is the background still there?
   - **N2, N3, N4, N5:** background shown, and how?
   - **S7:** which pages show the image?
   - **D2:** full-page picture and a link?
   - **H1:** only exists if `createNote` worked after opening.
   - **`fast/…`:** the fast snap notes.

When done, stop the log (Ctrl-C) and collect the outputs:

```bash
adb pull /sdcard/EXPORT/SnapMarkSpike spike-out/manta
```

```bash
grep '\[RESULT\]' SnapMarkSpike/spike-manta.log > spike-out/results-manta.txt
```

Tell me when they're there and add your visual notes. I can read the log and the PNGs directly from `spike-out/`. The device can stay connected, since I can pull the full logcat myself if something crashes. Then repeat everything on the **Nomad**.

**Cleanup** after both devices: uninstall from Settings → Apps → Plugins, then:

```bash
adb shell 'rm -r /sdcard/Note/SnapMarkSpike /sdcard/EXPORT/SnapMarkSpike; rm /sdcard/MyStyle/SnapMarkSpike-*.png'
```

### Stage B (optional): only if Q6 shows we need our own composition
1. Install a JDK and Android Studio (SDK Platform 35, Build-Tools 35.0.0, NDK 27.1.12297006) and set `ANDROID_HOME`.
2. Uncomment `add(SpikeImagePackage())` in `SnapMarkSpike/android/app/src/main/java/com/snapmarkspike/MainApplication.kt`.
3. Run `./buildPlugin.sh`. It must print `APK build succeeded`, and the `.snplg` must contain `app.npk`.
4. Reinstall the plugin, then in Spike Lab tap **Stage B: native** and compare `Q6.native-compose` timings with the render timings.

The Java module has not been compiled here, because this Mac has no JDK.

---

## 3. The questions

Superseded by **section 0**, which has the answers. The run-by-run evidence is in sections 1b–1g. The `[RESULT]` ids in the device logs (`spike-out/manta/run*-device.log`) match the R-numbers' sources.

---

## 4. Plan changes for Phase 1 (to approve)

1. **"Snap page" becomes a "hop" pipeline** (the DOC button can't call `createNote`):
   1. DOC: render the page at full note size into the private dir (2.1–2.4 s).
   2. DOC: read the page's strokes with `getElements`.
   3. `openFile(hop note)`, then wait until `getCurrentFilePath()` reports it (NOTE now on top).
   4. `createNote(target, template = render, isPortrait)`.
   5. `insertElements(target, [strokes…, backlink])`.
   6. `openFile(target)`.
   7. Delete the temp render.
   - The **hop note** is a small fixed note (e.g. `Note/Snaps/.snapmark-hop.note`). It's created once on the device from NOTE (first NOTE use, or the settings screen), so it always matches the device's page size.
   - The user briefly sees it flash. The alternatives are slower (a full-page Picture element costs +2.2 s) or erasable (`insertImage`).
2. **The snap includes your handwriting from the PDF page as editable ink.** This is an improvement over SPEC.md: the render alone would drop it. Add a setting to turn it off.
3. **The speed target needs your decision.** Under 2 s isn't reachable on Manta with this SDK, because the render alone is about 2.1 s. Expect **about 3.5 s**. Proposal:
   - show a toast "Snapping…" immediately;
   - still measure and log tap → open on every snap, as the spec asks;
   - make "stay here" mode skip the open (render + hop are still needed for `createNote`, so it isn't instant either).
4. **No waits based on timers after any `openFile`.** Wait by polling a cheap native call, and use `getCurrentFilePath()` as the readiness signal.
5. **"Annotate last screenshot"** (NOTE button): list the folder with `FileUtils.listFiles` (parsing `{type, path}`). Newest = highest `YYYYMMDD_HHMMSS` name, and freshness comes from the name. Then `createNote(template = screenshot)` and `openFile`. No image processing, and no hop (we're already in NOTE).
6. **No native code and no extra npm deps for the MVP.** The build stays Node-only (this Mac has no JDK). Stage B is only for v2 margin mode and region crop.
7. **Permissions:** keep `hasPermission` checks on every tap, with a short pre-prompt only if they're missing. A first-run dialog may never appear (R18), so this can't be designed until it's tested on the Nomad or after revoking in Settings.
8. **Collect mode (v2)** is feasible: `insertNotePage(inbox, page, template = render)` once NOTE is on top.
9. **Engineering:**
   - pin `sn-plugin-lib@0.2.3`;
   - the typed wrapper treats `102` as "wrong app on top";
   - the `fs` module allowlists `exists`, `makeDir`, `copyFile`, `deleteFile`, `listFiles` and never calls `getExternalDirPath`;
   - don't use `Image.getSize` for dimensions.
10. **Nomad: no device available.** The code must not hard-code Manta numbers:
    - take sizes from `getPageSize` of the created note (and `getDeviceType()` only as a fallback);
    - create seed/hop notes on the device itself, never bundled per device;
    - lay out the backlink relative to the page size.
    The SPEC acceptance item "the same works on Nomad" stays **unverified**. Nomad users should be told it's untested until someone with a Nomad runs spike v0.0.7 ("1 Spike: shots", then "4 Spike: bench").
