import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { NightDigest } from '../src/digest/types.js';

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: '',
};

const temporaryDirectories: string[] = [];

async function makeRunsDir(): Promise<string> {
  const runsDir = await mkdtemp(join(tmpdir(), 'rig-digest-routes-'));
  temporaryDirectories.push(runsDir);
  return runsDir;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('digest routes', () => {
  it('serves sorted HTML and matching JSON, preserving row details and timestamps', async () => {
    const runsDir = await makeRunsDir();
    const records = [
      { at: '2026-10-28T08:15:00+02:00', job: 'zeta', status: 'retry', owner: 'Sam', error: 'temporary' },
      { at: '2026-10-28T08:20:00+02:00', job: 'alpha', status: 'fail', owner: 'Lee', error: 'disk full' },
      { at: '2026-10-28T08:25:00+02:00', job: 'zeta', status: 'retry', owner: 'Sam' },
      { at: '2026-10-28T08:30:00+02:00', job: 'alpha', status: 'ok', owner: 'Lee' },
      { at: '2026-10-28T08:35:00+02:00', job: 'zeta', status: 'retry', owner: 'Sam' },
      { at: '2026-10-28T08:40:00+02:00', job: 'zeta', status: 'ok', owner: 'Sam' },
      { at: '2026-10-28T09:00:00-04:00', job: 'unassigned', status: 'ok', owner: null },
    ];
    await writeFile(
      join(runsDir, '2026-10-28.jsonl'),
      `${records.map((record) => JSON.stringify(record)).join('\n')}\nnot-json\n`,
    );

    const app = createApp({ ...config, runsDir });
    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-10-28'),
      app.request('/api/digest/2026-10-28'),
    ]);
    const html = await htmlResponse.text();
    const digest = (await jsonResponse.json()) as NightDigest;

    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(digest).toEqual({
      night: '2026-10-28',
      rows: [
        {
          job: 'alpha', owner: 'Lee', runs: 2, retries: 0, lastStatus: 'ok', lastError: 'disk full',
          firstAt: '2026-10-28T08:20:00+02:00', lastAt: '2026-10-28T08:30:00+02:00', hasFailure: true,
        },
        {
          job: 'unassigned', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-28T09:00:00-04:00', lastAt: '2026-10-28T09:00:00-04:00', hasFailure: false,
        },
        {
          job: 'zeta', owner: 'Sam', runs: 4, retries: 3, lastStatus: 'ok', lastError: 'temporary',
          firstAt: '2026-10-28T08:15:00+02:00', lastAt: '2026-10-28T08:40:00+02:00', hasFailure: false,
        },
      ],
      badLines: 1,
      counts: { ok: 3, retry: 3, fail: 1 },
    });

    expect(html).toMatch(/<title>[^<]*digest[^<]*2026-10-28[^<]*<\/title>/);
    expect(html).toContain('alpha');
    expect(html).toContain('unassigned');
    expect(html).toContain('zeta');
    expect(html).toContain('Lee');
    expect(html).toContain('Sam');
    expect(html).toContain('—');
    expect(html).toContain('2026-10-28T09:00:00-04:00');
    expect(html).toContain('2026-10-28T08:20:00+02:00');
    expect(html).toContain('2026-10-28T08:30:00+02:00');
    expect(html).toContain('2026-10-28T08:15:00+02:00');
    expect(html).toContain('2026-10-28T08:40:00+02:00');
    expect(html).toContain('disk full');
    expect(html).toContain('temporary');
    expect(html).toContain('fail');
    expect(html).toContain('retry');
    expect(html).toContain('3');
    expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('unassigned'));
    expect(html.indexOf('unassigned')).toBeLessThan(html.indexOf('zeta'));
    expect(html).toMatch(/class="[^"]*warn[^"]*"[^>]*>[^<]*fail/);
    expect(html).toMatch(/class="[^"]*warn[^"]*"[^>]*>[^<]*3/);
  });

  it('returns 404 from both routes when the requested night is missing', async () => {
    const runsDir = await makeRunsDir();
    const app = createApp({ ...config, runsDir });

    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-10-27'),
      app.request('/api/digest/2026-10-27'),
    ]);

    expect(htmlResponse.status).toBe(404);
    expect(jsonResponse.status).toBe(404);
  });

  it('returns an empty digest and renders “nothing ran” for an empty night', async () => {
    const runsDir = await makeRunsDir();
    await writeFile(join(runsDir, '2026-10-27.jsonl'), '');
    const app = createApp({ ...config, runsDir });

    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-10-27'),
      app.request('/api/digest/2026-10-27'),
    ]);

    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(await htmlResponse.text()).toContain('nothing ran');
    expect(await jsonResponse.json()).toEqual({
      night: '2026-10-27', rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('keeps valid records when a nonblank line is malformed', async () => {
    const runsDir = await makeRunsDir();
    await writeFile(
      join(runsDir, '2026-10-26.jsonl'),
      `${JSON.stringify({ at: '2026-10-26T11:00:00+03:00', job: 'compile', status: 'ok', owner: 'Jo' })}\n{bad json}\n`,
    );
    const app = createApp({ ...config, runsDir });

    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-10-26'),
      app.request('/api/digest/2026-10-26'),
    ]);

    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(await htmlResponse.text()).toContain('compile');
    expect(await jsonResponse.json()).toEqual({
      night: '2026-10-26',
      rows: [{
        job: 'compile', owner: 'Jo', runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-26T11:00:00+03:00', lastAt: '2026-10-26T11:00:00+03:00', hasFailure: false,
      }],
      badLines: 1,
      counts: { ok: 1, retry: 0, fail: 0 },
    });
  });
});
