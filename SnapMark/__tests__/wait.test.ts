// waitUntilCurrent: the current file must hold steady before file-level edits (SPIKES.md R77).

jest.mock('sn-plugin-lib', () => ({ PluginManager: { getDeviceType: jest.fn().mockResolvedValue(0) } }));
jest.mock('../src/sdk/sn', () => ({ Sn: { currentFilePath: jest.fn() } }));
jest.mock('../src/platform/log', () => ({ log: jest.fn(), logError: jest.fn() }));

import { Sn } from '../src/sdk/sn';
import { ensureStillCurrent, waitUntilCurrent } from '../src/sdk/wait';

const current = Sn.currentFilePath as jest.Mock;

/** What NOTE reports at each moment since the start: [fromMs, path][] */
function reports(timeline: Array<[number, string | null]>): void {
  const t0 = Date.now();
  current.mockImplementation(async () => {
    const t = Date.now() - t0;
    let path: string | null = null;
    for (const [from, p] of timeline) {
      if (t >= from) {
        path = p;
      }
    }
    return path;
  });
}

describe('waitUntilCurrent', () => {
  it('waits for the path to hold, through a flip-back to the previous note', async () => {
    reports([
      [0, '/N/new.note'],
      [40, '/N/old.note'],
      [80, '/N/new.note'],
    ]);
    const waited = await waitUntilCurrent('/N/new.note', 1000, 5, 100);
    expect(waited).toBeGreaterThanOrEqual(180);
  });
  it('lets the stable window run past the deadline once the path was seen', async () => {
    reports([
      [0, '/N/old.note'],
      [150, '/N/new.note'],
    ]);
    await expect(waitUntilCurrent('/N/new.note', 200, 5, 100)).resolves.toBeGreaterThanOrEqual(250);
  });
  it('gives up when the path never shows', async () => {
    reports([[0, '/N/old.note']]);
    await expect(waitUntilCurrent('/N/new.note', 100, 5, 50)).rejects.toThrow('did not open in time');
  });
  it('re-waits before a reload only when NOTE moved away', async () => {
    reports([[0, '/N/new.note']]);
    const calls = current.mock.calls.length;
    await ensureStillCurrent('/N/new.note');
    expect(current.mock.calls.length).toBe(calls + 1);
    reports([
      [0, '/N/old.note'],
      [30, '/N/new.note'],
    ]);
    await expect(ensureStillCurrent('/N/new.note')).resolves.toBeUndefined();
  });
});
