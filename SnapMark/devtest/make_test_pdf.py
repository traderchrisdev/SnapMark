#!/usr/bin/env python3
"""Writes devtest/SnapMark test.pdf and devtest/layout.json.

The PDF is 600 x 800 pt, the shape of the Manta and Nomad screens, so a page fills the screen and
1 pt = 3.2 px on a Manta (1920 x 2560). layout.json lists every text line in page px for that frame,
so the device test can tell where an underline must land. Plain PDF with the built-in Helvetica:
no dependencies.

Pages:
  1  Margins            text in the middle, wide bottom margin: the link stays bottom-left
  2  No room            text to the bottom edge and a header top-right: the page shrinks for the link
  3  No bottom margin   text to the bottom edge, top-right blank: the link goes top-right
  4  Last page          filler (the firmware refuses handwriting on a document's last page, R79)
"""
import json
import os

W, H = 600, 800
PX = 2560 / H  # page px per pt on a 1920 x 2560 page
HERE = os.path.dirname(os.path.abspath(__file__))
SIZE, LEAD = 15, 26  # body text pt, line pitch pt (about 83 px: a typical book line on the Manta)

WORDS = ('The quick brown fox jumps over the lazy dog, gathering yellow figs; '
         'quietly, eight pygmy jays played by the gate.').split()


def line_text(n):
    # Every line has ascenders and descenders, so a misplaced underline is easy to see.
    rest = ' '.join(WORDS[(n * 3) % len(WORDS):] + WORDS)[:58]
    return f'Line {n:02d}  {rest}'


def esc(s):
    return s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def text(x, y_top, s, size=SIZE, font='F1', gray=0):
    """y_top: distance from the page top to the baseline, in pt."""
    return f'{gray} g BT /{font} {size} Tf {x} {H - y_top} Td ({esc(s)}) Tj ET\n'


def page_lines(first_baseline, count, x=48):
    out, lines = '', []
    for i in range(count):
        n = i + 1
        base = first_baseline + i * LEAD
        out += text(x, base, line_text(n))
        # Text box in page px: cap height ~0.72 em above the baseline, descenders ~0.22 em below.
        lines.append({'n': n, 'baseline': round(base * PX), 'top': round((base - 0.72 * SIZE) * PX),
                      'bottom': round((base + 0.22 * SIZE) * PX), 'left': round(x * PX), 'right': round((W - 48) * PX)})
    return out, lines


def build():
    pages = []
    # 1: margins all round.
    c = text(48, 70, 'SnapMark test  -  1  Margins', 22, 'F2')
    c += text(48, 96, 'Highlight lines 03 and 07 with one straight marker stroke each. Write "ink" beside line 05.', 10, 'F1', 0.4)
    body, lines = page_lines(150, 12)
    pages.append({'name': 'margins', 'content': c + body, 'lines': lines, 'expect_link': 'bottom'})
    # 2: text to the bottom, header top-right.
    c = text(380, 30, 'Running header, top right', 11, 'F1')
    c += text(48, 60, 'SnapMark test  -  2  No room', 22, 'F2')
    c += text(48, 84, 'Highlight line 05. Write "ink" beside line 20.', 10, 'F1', 0.4)
    body, lines = page_lines(122, 26)
    pages.append({'name': 'no-room', 'content': c + body, 'lines': lines, 'expect_link': 'strip'})
    # 3: text to the bottom, top-right blank.
    c = text(48, 60, 'SnapMark test  -  3  No bottom margin', 22, 'F2')
    c += text(48, 84, 'Highlight line 10.', 10, 'F1', 0.4)
    body, lines = page_lines(122, 26)
    pages.append({'name': 'no-bottom-margin', 'content': c + body, 'lines': lines, 'expect_link': 'top-right'})
    # 4: filler.
    c = text(48, 70, 'SnapMark test  -  4  Last page (leave blank)', 22, 'F2')
    pages.append({'name': 'last', 'content': c, 'lines': [], 'expect_link': 'bottom'})
    return pages


def write_pdf(pages, path):
    """Each page may carry its own 'size' (w, h) in pt; the default is W x H."""
    objs = []

    def add(body):
        objs.append(body)
        return len(objs)

    font = add(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    bold = add(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
    pages_id = len(objs) + 1 + 2 * len(pages)  # after the page and content objects
    kids = []
    for p in pages:
        data = p['content'].encode('cp1252')
        cid = add(b'<< /Length %d >>\nstream\n' % len(data) + data + b'\nendstream')
        pw, ph = p.get('size', (W, H))
        kids.append(add(('<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %d %d] /Contents %d 0 R '
                         '/Resources << /Font << /F1 %d 0 R /F2 %d 0 R >> >> >>' % (pages_id, pw, ph, cid, font, bold)).encode()))
    assert add(('<< /Type /Pages /Kids [%s] /Count %d >>' % (' '.join(f'{k} 0 R' for k in kids), len(kids))).encode()) == pages_id
    catalog = add(b'<< /Type /Catalog /Pages %d 0 R >>' % pages_id)
    out = bytearray(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
    offsets = []
    for i, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += b'%d 0 obj\n' % i + body + b'\nendobj\n'
    xref = len(out)
    out += b'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1)
    for o in offsets:
        out += b'%010d 00000 n \n' % o
    out += b'trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, catalog, xref)
    with open(path, 'wb') as f:
        f.write(out)


def write_landscape(path):
    """Page 1 landscape (800 x 600 pt), page 2 portrait, so page 1 is not the last page."""
    lw, lh = 800, 600

    def t(x, y_top, s, size=SIZE, font='F1'):
        return f'0 g BT /{font} {size} Tf {x} {lh - y_top} Td ({esc(s)}) Tj ET\n'
    c = t(48, 60, 'SnapMark test  -  landscape page', 22, 'F2')
    for i in range(18):
        c += t(48, 110 + i * LEAD, line_text(i + 1) + '  ' + line_text(i + 7)[9:30])
    write_pdf([{'content': c, 'size': (lw, lh)}, {'content': text(48, 70, 'SnapMark test  -  page after the landscape page', 22, 'F2')}], path)


def write_epub(path):
    """A plain EPUB 2 with enough text for several reflowed pages."""
    import zipfile
    chapters = []
    for c in range(1, 4):
        paras = ''.join(f'<p>{esc_xml(line_text(n))} {esc_xml(" ".join(WORDS))}</p>' for n in range(1, 25))
        chapters.append((f'ch{c}.xhtml', f'Chapter {c}', paras))
    with zipfile.ZipFile(path, 'w') as z:
        z.writestr(zipfile.ZipInfo('mimetype'), 'application/epub+zip')
        z.writestr('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
                   '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
        items = ''.join(f'<item id="c{i}" href="{f}" media-type="application/xhtml+xml"/>' for i, (f, _, _) in enumerate(chapters))
        spine = ''.join(f'<itemref idref="c{i}"/>' for i in range(len(chapters)))
        z.writestr('OEBPS/content.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id">'
                   '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>SnapMark test EPUB</dc:title><dc:language>en</dc:language>'
                   '<dc:identifier id="id">snapmark-test-epub</dc:identifier></metadata>'
                   f'<manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>{items}</manifest>'
                   f'<spine toc="ncx">{spine}</spine></package>')
        nav = ''.join(f'<navPoint id="n{i}" playOrder="{i + 1}"><navLabel><text>{t}</text></navLabel><content src="{f}"/></navPoint>'
                      for i, (f, t, _) in enumerate(chapters))
        z.writestr('OEBPS/toc.ncx', '<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">'
                   f'<head><meta name="dtb:uid" content="snapmark-test-epub"/></head><docTitle><text>SnapMark test EPUB</text></docTitle><navMap>{nav}</navMap></ncx>')
        for f, t, paras in chapters:
            z.writestr(f'OEBPS/{f}', '<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml">'
                       f'<head><title>{t}</title></head><body><h1>{t}</h1>{paras}</body></html>')


def esc_xml(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


if __name__ == '__main__':
    pages = build()
    write_pdf(pages, os.path.join(HERE, 'SnapMark test.pdf'))
    layout = {'page_px': [1920, 2560], 'pages': [{k: v for k, v in p.items() if k != 'content'} for p in pages]}
    with open(os.path.join(HERE, 'layout.json'), 'w') as f:
        json.dump(layout, f, indent=1)
    write_landscape(os.path.join(HERE, 'SnapMark test landscape.pdf'))
    write_epub(os.path.join(HERE, 'SnapMark test.epub'))
    print('wrote SnapMark test.pdf, layout.json, SnapMark test landscape.pdf and SnapMark test.epub')
