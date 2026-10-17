# Device test (adb)

Snaps the pages of a test PDF on a plugged-in Supernote through SnapMark's floating button, the way
you would, then pulls each note and checks it. One run takes about two minutes.

## Once

```bash
python3 -m venv devtest/.venv && devtest/.venv/bin/pip install supernotelib
devtest/.venv/bin/python devtest/device_test.py setup
```

`setup` copies `SnapMark test.pdf` to `Document/` and opens it. Draw what each page asks for, with
the pen: one straight marker stroke across each named line, the word "ink" beside the named line.
On page 4, the last page, highlight the title and write "ink" under it. Then:

```bash
devtest/.venv/bin/python devtest/device_test.py save-ink
```

That keeps your ink as `devtest/fixtures/SnapMark test.pdf.mark`. Commit it; every run restores it.

## Every time

Build, then install and test in one go:

```bash
JAVA_HOME=/opt/homebrew/opt/openjdk@17 npm run build:plugin
npm run devtest -- --install
```

- SnapMark's settings must be the defaults for snaps (a new note each, margin mode off, copy
  handwriting, underline marker highlights) and the floating button must be on. The test checks.
- It restarts PluginHost, so the build you just installed is the one that runs.
- `--install` installs `build/outputs/SnapMark.snplg` first, through Settings → Apps → Plugins, and checks the
  version; `--install <snplg>` installs another package. `--pages 2` snaps one page; `--keep` keeps the
  notes on the device; `--no-margin` skips the margin-mode snaps.
- Margin mode is switched to 75% through SnapMark's own settings screen for two snaps, then back to Off.
- The report, the pulled notes, their PNGs and the full log go to `devtest/out/<time>/`.

## What it checks

| Page | What it is | Checks |
|---|---|---|
| 1 | Margins all round | link stays bottom-left; ink copied; underlines just under lines 03 and 07 |
| 2 | Text to the bottom, header top-right | page shrunk for a link strip; underline under line 05 |
| 3 | Text to the bottom, top-right blank | link top-right; underline under line 10 |
| 4 | Last page | the ink is read in Notes (the document app refuses it, R80); highlight found its line |
| region p1 | Snap region over lines 02–08 of page 1 | snap made; highlights found their lines |
| region p4 | Snap region on the last page | the ink is added once Notes has the note (R80) |
| margin p1, p4 | Snap page with margin mode 75% | made in margin mode; ink copied (on the last page, read in Notes) |

Each underline must sit between its line's baseline and the next line's top. `make_test_pdf.py`
regenerates the PDF and `layout.json` (every line's position in page px); change both together, and
draw the fixture ink again if the layout moves.
