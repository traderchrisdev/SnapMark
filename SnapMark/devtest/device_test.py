#!/usr/bin/env python3
"""SnapMark device test over adb. See devtest/README.md.

  python3 devtest/device_test.py setup      push the test PDF and open it, to draw the fixture ink once
  python3 devtest/device_test.py save-ink   keep that ink as devtest/fixtures/ (commit it)
  python3 devtest/device_test.py run        restore PDF + ink, snap each page through the floating
                                            button, pull the notes and check them

It drives the device like a person would: it opens the PDF on a page, taps SnapMark's floating
button, taps "Whole page" (or drags a box and taps "Snap region") on the selection screen, waits for
SnapMark's log line, pulls the note and renders it with supernotelib. Nothing on the device is
deleted except the notes this run made (pass --keep to keep them).
"""
import argparse
import datetime
import json
import os
import re
import shlex
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PDF_NAME = 'SnapMark test.pdf'
PDF_LOCAL = os.path.join(HERE, PDF_NAME)
MARK_LOCAL = os.path.join(HERE, 'fixtures', PDF_NAME + '.mark')
DEVICE_DOC = '/storage/emulated/0/Document/' + PDF_NAME
DOC_PKG = 'com.supernote.document'
HOST_PKG = 'com.ratta.supernote.pluginhost'
BUBBLE_DP = 32

# Which printed lines the fixture ink highlights (the instructions printed on each page).
HIGHLIGHTS = {1: [3, 7], 2: [5], 3: [10]}
# Page 4 is the last page: its ink is read by Notes instead of the document app (R80).
LAST_PAGE = 4


# ---------------------------------------------------------------- adb

def adb(*args, check=True, text=True):
    r = subprocess.run(['adb', *args], capture_output=True, text=text)
    if check and r.returncode != 0:
        raise SystemExit(f'adb {" ".join(args)} failed: {(r.stderr or r.stdout).strip()}')
    return r.stdout


def sh(cmd, check=True):
    return adb('shell', cmd, check=check)


def device_time():
    return sh("date '+%m-%d %H:%M:%S.000'").strip()


def log_since(stamp):
    return adb('logcat', '-d', '-v', 'time', '-T', stamp, '-s', 'ReactNativeJS:I', check=False)


def snapmark_lines(stamp):
    return [l.split('[SnapMark] ', 1)[1] for l in log_since(stamp).splitlines() if '[SnapMark] ' in l]


def wait_for(stamp, pattern, timeout=40):
    rx = re.compile(pattern)
    end = time.time() + timeout
    while time.time() < end:
        for line in snapmark_lines(stamp):
            m = rx.search(line)
            if m:
                return m
        time.sleep(0.5)
    return None


def resumed():
    out = sh('dumpsys activity activities | grep -m1 mResumedActivity', check=False)
    return out.strip()


def density():
    m = re.search(r'(\d+)', sh('wm density'))
    return int(m.group(1)) / 160 if m else 1.875


def bubble_center():
    """SnapMark's floating button: a PluginHost overlay window of 32 dp (other plugins' are larger)."""
    size = round(BUBBLE_DP * density())
    out = sh('dumpsys window windows')
    best = None
    for block in out.split('Window #')[1:]:
        if HOST_PKG not in block.split('\n', 1)[0] or 'APPLICATION_OVERLAY' not in block:
            continue
        f = re.search(r'mFrame=\[(\d+),(\d+)\]\[(\d+),(\d+)\]', block)
        if not f or 'isVisible=true' not in block:
            continue
        l, t, r, b = map(int, f.groups())
        if abs((r - l) - size) <= 3 and abs((b - t) - size) <= 3:
            best = ((l + r) // 2, (t + b) // 2)
    return best


def ui_nodes():
    sh('uiautomator dump /sdcard/snapmark-ui.xml', check=False)
    xml = sh('cat /sdcard/snapmark-ui.xml', check=False)
    nodes = {}
    for m in re.finditer(r'text="([^"]+)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml):
        l, t, r, b = map(int, m.groups()[1:])
        nodes[m.group(1)] = ((l + r) // 2, (t + b) // 2)
    return nodes


def wait_ui(label, timeout=10):
    end = time.time() + timeout
    while time.time() < end:
        n = ui_nodes()
        if label in n:
            return n
        time.sleep(0.5)
    return None


def tap(xy):
    sh(f'input tap {xy[0]} {xy[1]}')


def open_doc(page):
    sh('am start -a android.intent.action.VIEW -n com.supernote.document/.MainActivity '
       f'--es file_path {shlex.quote(DEVICE_DOC)} --ei page {page - 1} --ei source_type 0')
    end = time.time() + 15
    while time.time() < end:
        if 'DocumentActivity' in resumed():
            time.sleep(2.5)  # page drawn, PluginHost routing to DOC
            n = ui_nodes()
            if 'Note Not Found' in n and 'OK' in n:  # DOC's own dialog; it would end up in the capture
                print(f'  (page {page}: the document app showed "Note Not Found"; dismissed)')
                tap(n['OK'])
                time.sleep(1)
            return True
        time.sleep(0.5)
    return False


# ---------------------------------------------------------------- note rendering

def render_note(path, out_png):
    try:
        import supernotelib as sn
        from supernotelib.converter import ImageConverter
    except ImportError:
        raise SystemExit('supernotelib is missing: python3 -m venv devtest/.venv && devtest/.venv/bin/pip install supernotelib, '
                         'then run with devtest/.venv/bin/python')
    notebook = sn.load_notebook(path)
    img = ImageConverter(notebook).convert(0)
    img.save(out_png)
    return notebook.get_total_pages(), img.convert('L')


def note_tags(path):
    data = open(path, 'rb').read()
    return {k.decode(): v.decode('latin1') for k, v in re.findall(rb'<([A-Z_]+):([^<>]{0,200})>', data)}


# ---------------------------------------------------------------- checks

class Result:
    def __init__(self, name):
        self.name, self.checks = name, []

    def check(self, ok, what, detail=''):
        self.checks.append((bool(ok), what, detail))
        return ok

    @property
    def ok(self):
        return all(c[0] for c in self.checks) and self.checks


def underline_row(gray, x0, x1, y0, y1):
    """The row in [y0, y1) with the most mid-grey pixels between x0 and x1 (an underline), and its count."""
    w, h = gray.size
    best, best_n = None, 0
    for y in range(max(0, y0), min(h, y1)):
        n = sum(1 for x in range(max(0, x0), min(w, x1), 2) if 70 < gray.getpixel((x, y)) < 215)
        if n > best_n:
            best, best_n = y, n
    return best, best_n


def check_page_snap(res, page, lines, log, gray, tags, layout, with_ink):
    pg = layout['pages'][page - 1]
    decision = next((l for l in log if l.startswith('snap page: link')), '')
    m = re.search(r'shrunk to ([0-9.]+)', decision)
    scale = float(m.group(1)) if m else 1.0
    expect = pg['expect_link']
    rect = tags.get('LINKRECT')
    if decision:
        got = 'top-right' if 'top-right' in decision else 'strip' if m else 'bottom'
    elif rect:
        # No log line (dropped): judge from the note. Top-right sits above y 300; a strip shows as the
        # page's own text ending above the link, which the underline check covers; call it bottom/strip.
        l, t = (int(v) for v in rect.split(',')[:2])
        got = 'top-right' if t < 300 else expect if expect in ('bottom', 'strip') else 'bottom'
        decision = f'from the note: LINKRECT {rect}'
    else:
        got = '?'
    res.check(got == expect, f'link placement {expect}', decision or 'no decision logged')
    res.check(rect is not None, 'note has the link', rect or '')
    ins = next((l for l in log if l.startswith('snap page: inserted')), '')
    k = int(re.search(r'inserted (\d+) strokes', ins).group(1)) if ins else -1
    res.check((k > 0) if with_ink else (k >= 0), 'handwriting copied' if with_ink else 'insert logged', ins or 'no insert line')
    if not with_ink:
        return
    if page == LAST_PAGE:
        res.check(any('last page of the document' in l for l in log), 'last page: ink read in Notes', '')
    bottoms = next((l for l in log if 'line bottoms' in l), '')
    if bottoms:
        res.check('-1' not in bottoms, 'every highlight found its text line', bottoms)
    by_n = {l['n']: l for l in pg['lines']}
    for n in HIGHLIGHTS.get(page, []):
        line, nxt = by_n[n], by_n.get(n + 1)
        y0 = round(line['top'] * scale)
        y1 = round((nxt['bottom'] if nxt else line['bottom'] + 120) * scale)
        x0, x1 = round(line['left'] * scale) + 40, round(line['right'] * scale) - 40
        y, cnt = underline_row(gray, x0, x1, y0, y1)
        lo = round(line['baseline'] * scale) - 4
        hi = round(nxt['top'] * scale) if nxt else round((line['bottom'] + 60) * scale)
        res.check(cnt > 60 and y is not None and lo <= y < hi,
                  f'underline under line {n:02d}', f'row {y} ({cnt} grey px); must be in [{lo}, {hi}) at scale {scale}')


# ---------------------------------------------------------------- commands

def cmd_setup(_):
    if not os.path.exists(PDF_LOCAL):
        subprocess.run([sys.executable, os.path.join(HERE, 'make_test_pdf.py')], check=True)
    adb('push', PDF_LOCAL, DEVICE_DOC)
    sh(f'rm -f {shlex.quote(DEVICE_DOC + ".mark")}', check=False)
    open_doc(1)
    print('The test PDF is open on the device. On pages 1-3, do what each page says (one straight\n'
          'marker stroke per highlighted line, the word "ink" with the pen). On page 4, the last page,\n'
          'highlight its title with one straight marker stroke and write "ink" under it.\n'
          'Then run: python3 devtest/device_test.py save-ink')


def mark_pages_with_ink(path):
    """Page numbers (1-based) whose block in a .mark file has stroke data."""
    b = open(path, 'rb').read()
    fa = int.from_bytes(b[-4:], 'little')
    n = int.from_bytes(b[fa:fa + 4], 'little')
    footer = b[fa + 4:fa + 4 + n].decode('latin1')
    pages = []
    for k, addr in re.findall(r'<PAGE(\d+):(\d+)>', footer):
        a = int(addr)
        m = int.from_bytes(b[a:a + 4], 'little')
        if re.search(r'<TOTALPATH:[1-9]', b[a + 4:a + 4 + m].decode('latin1')):
            pages.append(int(k))
    return sorted(pages)


def cmd_save_ink(_):
    os.makedirs(os.path.dirname(MARK_LOCAL), exist_ok=True)
    # Leave the document the way a person would, so the document app writes every page's ink to the
    # .mark (a force-stop loses the page it is on).
    sh('input keyevent KEYCODE_HOME')
    time.sleep(4)
    tmp = MARK_LOCAL + '.new'
    adb('pull', DEVICE_DOC + '.mark', tmp)
    have = mark_pages_with_ink(tmp)
    missing = [p for p in [1, 2, 3, LAST_PAGE] if p not in have]
    if missing:
        os.remove(tmp)
        raise SystemExit(f'pages {missing} have no ink in the saved file yet: draw on them, leave the document, and run save-ink again')
    os.replace(tmp, MARK_LOCAL)
    print(f'saved {os.path.relpath(MARK_LOCAL, os.getcwd())} ({os.path.getsize(MARK_LOCAL)} bytes, ink on pages {have}); commit it')


def restart_host():
    stamp = device_time()
    sh(f'am force-stop {HOST_PKG}')
    if not wait_for(stamp, r'^bubble: shown', 30):
        raise SystemExit('SnapMark did not come back with the floating button shown: turn it on in its settings')
    settings = next((l for l in snapmark_lines(stamp) if l.startswith('stored settings')), '')
    return settings


def check_settings(settings):
    problems = []
    for bad, why in [('destination=%22inbox%22', 'Where snaps go must be "A new note each"'),
                     ('destination=%22current%22', 'Where snaps go must be "A new note each"'),
                     ('collect=true', 'Where snaps go must be "A new note each"'),
                     ('includeHandwriting=false', 'My handwriting must be "Copy"'),
                     ('highlightStyle=%22omit%22', 'Marker highlights must be "Underline"'),
                     ('folder=', 'Save snaps in must be "Snaps"')]:
        if bad in settings:
            problems.append(why)
    m = re.search(r'marginPercent=(\d+)', settings)
    if m and m.group(1) != '0':
        problems.append('Margin mode must be Off')
    return problems


def snap(page, region_box=None):
    """Snap `page` via the floating button. Returns (log lines, device note path) or (log, None)."""
    if not open_doc(page):
        return [], None
    stamp = device_time()
    b = bubble_center()
    if not b:
        return ['test: floating button not found'], None
    tap(b)
    nodes = wait_ui('Whole page', 12)
    if nodes:
        if region_box:
            l, t, r, bt = region_box
            sh(f'input swipe {l} {t} {r} {bt} 600')
            time.sleep(1)
            tap(ui_nodes().get('Snap region', nodes['Snap region']))
        else:
            tap(nodes['Whole page'])
    pattern = r'^snap region: .* -> (\S.*\.note)' if region_box else r'^snap page \d+ -> (\S.*?\.note)'
    m = wait_for(stamp, pattern, 45)
    time.sleep(2)
    return snapmark_lines(stamp), (m.group(1) if m else None)


def cmd_run(args):
    layout = json.load(open(os.path.join(HERE, 'layout.json')))
    with_ink = os.path.exists(MARK_LOCAL)
    out_dir = os.path.join(HERE, 'out', datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
    os.makedirs(out_dir, exist_ok=True)
    if 'device' not in adb('get-state', check=False):
        raise SystemExit('no device: plug in the Supernote and allow USB debugging')
    if args.push_build:
        adb('push', args.push_build, '/sdcard/MyStyle/' + os.path.basename(args.push_build))
        input(f'Pushed. Install MyStyle/{os.path.basename(args.push_build)} on the device, then press Enter... ')

    # The document app logs every ink stroke it hands out; the default 256 KB log buffer drops SnapMark's lines.
    adb('logcat', '-G', '16M', check=False)
    print('restoring the test PDF' + (' and its ink' if with_ink else ' (no fixture ink yet: run setup + save-ink)'))
    sh(f'am force-stop {DOC_PKG}')
    adb('push', PDF_LOCAL, DEVICE_DOC)
    if with_ink:
        adb('push', MARK_LOCAL, DEVICE_DOC + '.mark')
    settings = restart_host()
    problems = check_settings(settings)
    if problems:
        raise SystemExit('Fix these SnapMark settings first:\n  ' + '\n  '.join(problems))

    results, made = [], []
    pages = [int(p) for p in args.pages.split(',')] if args.pages else [1, 2, 3, 4]
    for page in pages:
        res = Result(f'Snap page {page} ({layout["pages"][page - 1]["name"]})')
        log, path = snap(page)
        res.check(path, 'snap finished', path or 'no "snap page" log line')
        if path:
            made.append(path)
            local = os.path.join(out_dir, f'page{page}.note')
            adb('pull', path, local)
            total, gray = render_note(local, local.replace('.note', '.png'))
            res.check(total == 1, 'note has one page', f'{total} pages')
            check_page_snap(res, page, None, log, gray, note_tags(local), layout, with_ink)
        res.log = log
        results.append(res)

    if not args.pages or 'region' in (args.extra or ''):
        res = Result('Snap region (page 1, lines 02-08)')
        lines = {l['n']: l for l in layout['pages'][0]['lines']}
        box = (lines[2]['left'] - 30, lines[2]['top'] - 20, lines[8]['right'] + 20, lines[8]['bottom'] + 20)
        log, path = snap(1, box)
        res.check(path, 'snap finished', path or 'no "snap region" log line')
        if path:
            made.append(path)
            local = os.path.join(out_dir, 'region.note')
            adb('pull', path, local)
            total, _ = render_note(local, local.replace('.note', '.png'))
            res.check(total == 1, 'note has one page', f'{total} pages')
            if with_ink:
                bl = next((l for l in log if 'line bottoms' in l), '')
                res.check(bl and '-1' not in bl, 'every highlight found its text line', bl or 'no marker line')
        res.log = log
        results.append(res)

    if not args.keep:
        for path in made:
            sh(f'rm -f {shlex.quote(path)}', check=False)
    open_doc(1)

    report = []
    for r in results:
        report.append(f'{"PASS" if r.ok else "FAIL"}  {r.name}')
        for ok, what, detail in r.checks:
            report.append(f'   {"ok " if ok else "BAD"} {what}' + (f'  ({detail})' if detail else ''))
    text = '\n'.join(report)
    with open(os.path.join(out_dir, 'report.txt'), 'w') as f:
        f.write(text + '\n\n' + '\n\n'.join(f'== {r.name}\n' + '\n'.join(r.log) for r in results) + '\n')
    print(text)
    print(f'\nnotes, PNGs and the full log: {os.path.relpath(out_dir, os.getcwd())}')
    sys.exit(0 if all(r.ok for r in results) else 1)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    sub.add_parser('setup')
    sub.add_parser('save-ink')
    r = sub.add_parser('run')
    r.add_argument('--pages', help='comma-separated pages to snap (default 1,2,3 plus a region snap)')
    r.add_argument('--extra', help='"region" to add the region snap when --pages is given')
    r.add_argument('--keep', action='store_true', help='keep the snaps on the device')
    r.add_argument('--push-build', metavar='SNPLG', help='push this package to MyStyle first and wait for you to install it')
    args = p.parse_args()
    {'setup': cmd_setup, 'save-ink': cmd_save_ink, 'run': cmd_run}[args.cmd](args)


if __name__ == '__main__':
    main()
