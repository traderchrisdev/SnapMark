# SnapMark for Supernote

**Turn what's on your screen into a note you can write on, in one tap.**

SnapMark is a free, open-source plugin for Supernote e-ink devices. Website: **[snapmark.ink](https://snapmark.ink)**.

- **Snap page** (in a PDF or EPUB): the page becomes a new note, with your handwriting copied as editable ink, highlights kept, and a `↩` link back to the page.
- **Snap region:** drag a box over a paragraph, verse or chart. Just that part goes at the top of a new note, enlarged, with room to write below. From a PDF, your ink inside the box stays editable.
- **Floating capture button:** a small button that floats over every app (Kindle, the browser, a PDF, anything). Tap it, drag a box (or keep the whole screen), and about a second later you're writing on a note made from it.
- **Annotate screenshot:** a Supernote screenshot becomes a new note.
- **Insert screenshot:** a screenshot goes onto the page you're on, as a picture.
- **Export page as PNG:** the current note page, with your writing, saved as an image.
- **Paste into your note (optional):** a region snap goes onto the page of the note you're working in, as a picture with a link back to the PDF page.
- **Snaps inbox (optional):** collect every snap as the next page of one notebook instead of a note each.

Everything stays on your device: no account, no internet access.

![Mark up a page, tap the button and drag a box, then write on the note it makes](docs/screenshots/1-snap-region.png)

## Download and install

1. Download `SnapMark-v<version>.snplg` from the **[latest release](../../releases/latest)**.
2. Copy it into the `MyStyle` folder on your Supernote (USB or the Partner app).
3. On the device: **Settings → Apps → Plugins → Choose Installation Package** and pick the file.

**[How-to guide](HOWTO.md)**: every feature, the settings, updating, privacy, troubleshooting.

**Requirements:** recent firmware whose plugin system supports plugin library 0.2.3, Supernote's newest (published October 2026). It's tested on a Manta build from 9 October 2026. Older firmware refuses it. A Nomad user on Chauvet 3.29.45 beta, which is older than the tested Manta's firmware, reported "This plugin is not compatible with the current system version. Please update the system." A version for older firmware is planned. **Tested on a Manta only;** other models should work but are untested.

## For developers

- **Building:** the plugin's source and build instructions are in [`SnapMark/`](SnapMark/README.md). It's React Native 0.79 with `sn-plugin-lib`, plus a small Java module for the floating button and screen capture.
- **Design notes:** [`SPIKES.md`](SPIKES.md) records the experiments behind every design decision, including undocumented PluginHost behaviour, which may be useful if you write your own plugin. [`SPEC.md`](SPEC.md) is the original plan.

## Support

SnapMark is free. If it saves you time, you can [buy me a coffee on Ko-fi](https://ko-fi.com/chrisxoxz).

## Credits and license

- **License:** MIT, see [LICENSE](LICENSE).
- **Credits:** the floating button's overlay technique comes from [SuperDashboard](https://github.com/AgP42/SuperDashboard) (MIT); see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- **Not official:** SnapMark is an independent project, not affiliated with or endorsed by Ratta / Supernote.
