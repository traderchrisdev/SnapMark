import { classifyApp, DOC_PACKAGE, NOTE_PACKAGE, PLUGIN_HOST_PACKAGE } from '../src/core/apps';
import { backlinkSpec, LINK_TYPE_DOCUMENT } from '../src/core/backlink';
import { fitInsetsDp } from '../src/core/fit';
import {
  docTitle,
  exportPngCandidates,
  formatStamp,
  hopNotePath,
  isDocumentPath,
  isPrivatePath,
  poolBlankPath,
  parentDir,
  samePath,
  sanitizeFolder,
  sanitizeName,
  screenshotNoteCandidates,
  settingsDir,
  snapNoteCandidates,
  tmpRenderPath,
} from '../src/core/paths';
import { underlineOffsetPx, underlinePoints } from '../src/core/highlights';
import { marginLayout, scalePoints, scaleThickness } from '../src/core/margin';
import { describeAge, isFresh, newestFirst, parseScreenshotTime } from '../src/core/screenshots';
import { decodeSettings, DEFAULT_SETTINGS, encodeSetting, entryKey, inboxPath } from '../src/core/settings';
import { StepTimer } from '../src/core/timer';

describe('sanitizeName', () => {
  it('replaces characters that are illegal on synced desktops', () => {
    expect(sanitizeName('a/b\\c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j');
  });
  it('collapses whitespace and strips control characters', () => {
    expect(sanitizeName('  Title\t\nwith   gaps\u0007 ')).toBe('Title with gaps');
  });
  it('strips leading/trailing dots so folders are not hidden', () => {
    expect(sanitizeName('..hidden..')).toBe('hidden');
  });
  it('truncates long names without splitting a surrogate pair', () => {
    const name = sanitizeName(`${'a'.repeat(59)}😀😀`, 60);
    expect(Array.from(name)).toHaveLength(60);
    expect(name.endsWith('😀')).toBe(true);
  });
  it('never returns an empty name', () => {
    expect(sanitizeName(' /// ')).toBe('Untitled');
  });
});

describe('docTitle', () => {
  it('drops folder and extension', () => {
    expect(docTitle('/storage/emulated/0/Document/My Book.pdf')).toBe('My Book');
  });
  it('keeps dots inside the name', () => {
    expect(docTitle('/x/v1.2 notes.epub')).toBe('v1.2 notes');
  });
});

describe('snapNoteCandidates', () => {
  it('uses the 1-based page and adds (n) for same-minute snaps', () => {
    const it = snapNoteCandidates('/N/Snaps/Book', 'Book', 175, '2026-10-14 1230');
    expect(it.next().value).toBe('/N/Snaps/Book/Book - p176 - 2026-10-14 1230.note');
    expect(it.next().value).toBe('/N/Snaps/Book/Book - p176 - 2026-10-14 1230 (2).note');
  });
  it('is finite', () => {
    expect(Array.from(snapNoteCandidates('/d', 't', 0, 's'))).toHaveLength(99);
  });
});

describe('paths', () => {
  it('formats a local timestamp as YYYY-MM-DD HHmm', () => {
    expect(formatStamp(new Date(2026, 0, 5, 7, 3))).toBe('2026-01-05 0703');
  });
  it('treats /sdcard and /storage/emulated/0 as the same place', () => {
    expect(samePath('/sdcard/Note/a.note', '/storage/emulated/0/Note/a.note')).toBe(true);
    expect(samePath('/sdcard/Note/a.note', '/sdcard/Note/b.note')).toBe(false);
    expect(samePath(null, '/x')).toBe(false);
  });
  it('builds the hop note and temp paths', () => {
    expect(hopNotePath()).toBe('/storage/emulated/0/Note/.snapmark/hop.note');
    expect(tmpRenderPath('/data/p', new Date(1000))).toBe('/data/p/tmp/render-1000.png');
    expect(parentDir('/a/b/c.note')).toBe('/a/b');
  });
  it('recognises the document formats DOC can open', () => {
    expect(isDocumentPath('/x/a.PDF')).toBe(true);
    expect(isDocumentPath('/x/a.epub')).toBe(true);
    expect(isDocumentPath('/x/a.note')).toBe(false);
  });
});

describe('backlinkSpec', () => {
  const manta = { width: 1920, height: 2560 };
  it('links to the document page (0-based) and labels it 1-based', () => {
    const s = backlinkSpec('/d/Book.pdf', 'Book', 175, manta);
    expect(s.linkType).toBe(LINK_TYPE_DOCUMENT);
    expect(s.destPath).toBe('/d/Book.pdf');
    expect(s.destPage).toBe(175);
    expect(s.showText).toBe('↩ Book, p. 176');
  });
  it('sits bottom-left but clear of NOTE\'s floating toolbar (x < 115) and page bar (y > 2460) on Manta', () => {
    const s = backlinkSpec('/d/Book.pdf', 'Book', 0, manta);
    expect(s.fontSize).toBe(32);
    expect(s.rect.left).toBe(154);
    expect(s.rect.bottom).toBe(2560 - 128);
    expect(s.rect.top).toBeLessThan(s.rect.bottom);
  });
  it('shortens long titles and never overflows the page', () => {
    const s = backlinkSpec('/d/x.pdf', 'x'.repeat(200), 0, manta);
    expect(Array.from(s.showText).length).toBeLessThan(60);
    expect(s.rect.right).toBeLessThanOrEqual(manta.width - 154);
  });
  it('scales with smaller pages but keeps the minimum clearances', () => {
    const s = backlinkSpec('/d/x.pdf', 'x', 0, { width: 1404, height: 1872 });
    expect(s.fontSize).toBe(23);
    expect(s.rect.left).toBe(120);
    expect(s.rect.bottom).toBe(1872 - 110);
  });
});

describe('StepTimer', () => {
  it('reports per-step and total durations', () => {
    let now = 0;
    const t = new StepTimer(() => now);
    now = 100;
    t.mark('a');
    now = 250;
    t.mark('b');
    expect(t.summary()).toBe('a 100 | b 150 | total 250 ms');
  });
});

describe('marker -> underline', () => {
  it('puts the line below a 38 px marker band (thickness 3800, 1/100 px units)', () => {
    expect(underlineOffsetPx(3800)).toBe(25);
  });
  it('straightens a wobbly line highlight at its average height', () => {
    const wobbly = [
      { x: 400, y: 1080 },
      { x: 700, y: 1095 },
      { x: 1000, y: 1078 },
      { x: 1288, y: 1087 },
    ];
    const line = underlinePoints(wobbly, 3800, 2560);
    expect(new Set(line.map(p => p.y))).toEqual(new Set([1085 + 25]));
    expect(line[0].x).toBe(400);
    expect(line[line.length - 1].x).toBe(1288);
    expect(line.length).toBe(Math.ceil(888 / 24) + 1);
  });
  it('keeps the shape of a highlight that spans several lines, clamped to the page', () => {
    expect(underlinePoints([{ x: 10, y: 100 }, { x: 50, y: 2550 }], 3800, 2560)).toEqual([
      { x: 10, y: 125 },
      { x: 50, y: 2559 },
    ]);
  });
});

describe('settings encoding', () => {
  it('round-trips every setting through folder names', () => {
    const entries = [
      encodeSetting('folder', 'Reading/Snaps'),
      encodeSetting('afterSnap', 'stay'),
      encodeSetting('keepHighlights', false),
      encodeSetting('screenshotFreshMinutes', 30),
      encodeSetting('highlightStyle', 'omit'),
      encodeSetting('collect', true),
    ];
    expect(entries.every(e => !e.includes('/'))).toBe(true);
    expect(decodeSettings(entries)).toEqual({
      ...DEFAULT_SETTINGS,
      folder: 'Reading/Snaps',
      afterSnap: 'stay',
      keepHighlights: false,
      screenshotFreshMinutes: 30,
      highlightStyle: 'omit',
      collect: true,
    });
  });
  it('ignores unknown keys, corrupt values and invalid values', () => {
    expect(decodeSettings(['nope=1', 'afterSnap=%%%', 'afterSnap=%22later%22', 'screenshotFreshMinutes=-5', 'no-equals'])).toEqual(
      DEFAULT_SETTINGS,
    );
  });
  it('knows which key an entry belongs to', () => {
    expect(entryKey(encodeSetting('folder', 'Snaps'))).toBe('folder');
    expect(entryKey('folder')).toBeNull();
  });
  it('re-sanitizes a stored folder', () => {
    expect(decodeSettings([encodeSetting('folder', ' ../My:Snaps/ ')]).folder).toBe('My Snaps');
  });
});

describe('inbox', () => {
  it('lives at the root of the snaps folder', () => {
    expect(inboxPath({ ...DEFAULT_SETTINGS, folder: 'Reading/Snaps' })).toBe('/storage/emulated/0/Note/Reading/Snaps/Snaps inbox.note');
  });
});

describe('sanitizeFolder', () => {
  it('keeps nested folders and drops empty or dot segments', () => {
    expect(sanitizeFolder('Reading / Snaps')).toBe('Reading/Snaps');
    expect(sanitizeFolder('/../a//b/.')).toBe('a/b');
    expect(sanitizeFolder(' / ')).toBeNull();
  });
});

describe('screenshots', () => {
  const now = new Date(2026, 9, 14, 12, 0, 0);
  it('parses the native YYYYMMDD_HHMMSS name as local time', () => {
    expect(parseScreenshotTime('/s/20261014_114808.png')).toEqual(new Date(2026, 9, 14, 11, 48, 8));
    expect(parseScreenshotTime('/s/my shot.png')).toBeNull();
  });
  it('sorts newest first, unnamed files last, non-PNGs out', () => {
    const order = newestFirst(['/s/20261014_090000.png', '/s/x.png', '/s/20261014_114808.png', '/s/20261014_114808.jpg']).map(s => s.path);
    expect(order).toEqual(['/s/20261014_114808.png', '/s/20261014_090000.png', '/s/x.png']);
  });
  it('is fresh within the window, never when the window is 0', () => {
    const shot = { path: 'p', takenAt: new Date(2026, 9, 14, 11, 52) };
    expect(isFresh(shot, now, 10)).toBe(true);
    expect(isFresh(shot, now, 5)).toBe(false);
    expect(isFresh(shot, now, 0)).toBe(false);
    expect(isFresh({ path: 'p', takenAt: null }, now, 10)).toBe(false);
  });
  it('describes the age for the picker', () => {
    expect(describeAge({ path: 'p', takenAt: new Date(2026, 9, 14, 11, 55) }, now)).toBe('5 min ago');
    expect(describeAge({ path: 'p', takenAt: new Date(2026, 9, 14, 9, 0) }, now)).toBe('3 h ago');
    expect(describeAge({ path: 'p', takenAt: new Date(2026, 9, 1, 9, 0) }, now)).toBe('2026-10-01');
  });
  it('names screenshot notes and numbers duplicates', () => {
    const it = screenshotNoteCandidates('/N/Snaps/Screenshots', '2026-10-14 1148');
    expect(it.next().value).toBe('/N/Snaps/Screenshots/Screenshot - 2026-10-14 1148.note');
    expect(it.next().value).toBe('/N/Snaps/Screenshots/Screenshot - 2026-10-14 1148 (2).note');
  });
});

describe('private paths', () => {
  it('allows deletes only inside the plugin dir', () => {
    expect(isPrivatePath('/data/user/0/com.ratta.supernote.pluginhost/files/plugins/abc/settings/x=1')).toBe(true);
    expect(isPrivatePath('/storage/emulated/0/Note/.snapmark/settings/x=1')).toBe(false);
    expect(isPrivatePath('/data/user/0/com.ratta.supernote.pluginhost/files/plugins/abc/../../x')).toBe(false);
  });
  it('keeps the blank pool in the private dir, one per orientation', () => {
    const dir = '/data/user/0/com.ratta.supernote.pluginhost/files/plugins/abc';
    expect(poolBlankPath(dir, true)).toBe(`${dir}/pool/blank-portrait.note`);
    expect(poolBlankPath(dir, false)).toBe(`${dir}/pool/blank-landscape.note`);
    expect(isPrivatePath(poolBlankPath(dir, true))).toBe(true);
  });
  it('keeps settings in the private dir', () => {
    expect(settingsDir('/data/user/0/com.ratta.supernote.pluginhost/files/plugins/abc')).toBe(
      '/data/user/0/com.ratta.supernote.pluginhost/files/plugins/abc/settings',
    );
  });
});

describe('export names', () => {
  it('names a page export after the note and its 1-based page, numbering duplicates', () => {
    const it = exportPngCandidates('/storage/emulated/0/EXPORT', 'Snaps inbox', 3);
    expect(it.next().value).toBe('/storage/emulated/0/EXPORT/Snaps inbox - p4.png');
    expect(it.next().value).toBe('/storage/emulated/0/EXPORT/Snaps inbox - p4 (2).png');
  });
  it('keeps the parentheses of a numbered snap note in the title', () => {
    expect(docTitle('/N/Snaps/B/B - p179 - 2026-10-14 1441 (2).note')).toBe('B - p179 - 2026-10-14 1441 (2)');
  });
});

describe('margin mode', () => {
  const manta = { width: 1920, height: 2560 };
  it('shrinks the page to the top-left at the chosen percent', () => {
    const l = marginLayout(manta, 75);
    expect(l.imageSize).toEqual({ width: 1440, height: 1920 });
    expect(l.rect).toEqual({ left: 0, top: 0, right: 1440, bottom: 1920 });
  });
  it('scales handwriting into the same frame, with a minimum pen width', () => {
    const l = marginLayout(manta, 75);
    expect(scalePoints([{ x: 1000, y: 2000 }], l)).toEqual([{ x: 750, y: 1500 }]);
    expect(scaleThickness(700, l)).toBe(525);
    expect(scaleThickness(110, l)).toBe(100);
  });
  it('is a stored, validated setting', () => {
    expect(decodeSettings([encodeSetting('marginPercent', 75)]).marginPercent).toBe(75);
    expect(decodeSettings([encodeSetting('marginPercent', 42)]).marginPercent).toBe(0);
  });
});

describe('floating capture button', () => {
  it('shrinks screenshots clear of the toolbar side and the page bar', () => {
    expect(fitInsetsDp('left')).toEqual({ left: 72, top: 0, right: 0, bottom: 72 });
    expect(fitInsetsDp('right')).toEqual({ left: 0, top: 0, right: 72, bottom: 72 });
    expect(fitInsetsDp('off')).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
  });
  it('only lets NOTE create notes directly; DOC and other apps need NOTE brought up first', () => {
    expect(classifyApp(NOTE_PACKAGE)).toBe('note');
    expect(classifyApp(DOC_PACKAGE)).toBe('other');
    expect(classifyApp('net.quickbible')).toBe('other');
    expect(classifyApp('com.ratta.settings')).toBe('other');
    expect(classifyApp(PLUGIN_HOST_PACKAGE)).toBe('pluginHost');
  });
  it('is off by default, fits for a left toolbar, and both are validated settings', () => {
    expect(DEFAULT_SETTINGS.bubble).toBe(false);
    expect(DEFAULT_SETTINGS.screenshotFit).toBe('left');
    const s = decodeSettings([encodeSetting('bubble', true), encodeSetting('screenshotFit', 'right')]);
    expect(s.bubble).toBe(true);
    expect(s.screenshotFit).toBe('right');
    expect(decodeSettings(['bubble=%22yes%22', 'screenshotFit=%22top%22'])).toMatchObject({ bubble: false, screenshotFit: 'left' });
  });
});
