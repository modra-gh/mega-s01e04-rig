import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read-night.js';

const night = '2026-10-28';
const directories: string[] = [];

function runsDir(contents?: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'rig-reader-'));
  directories.push(directory);
  if (contents !== undefined) writeFileSync(join(directory, `${night}.jsonl`), contents);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const record = { at: '2026-10-29T01:00:00+01:00', job: 'lane/sync', status: 'ok', owner: 'rook' };

describe('readNight', () => {
  it('reads the real fixture with five sorted jobs and one bad line', () => {
    const digest = readNight('runs', night);
    expect(digest).toMatchObject({ night, badLines: 1, counts: { ok: 10, retry: 4, fail: 1 } });
    expect(digest?.rows.map(row => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest?.rows[0]).toMatchObject({ owner: null, runs: 1, lastError: null });
    expect(digest?.rows[1]).toEqual({
      job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok',
      lastError: 'upstream 503', firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00', hasFailure: false,
    });
    expect(digest?.rows[3]).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded', hasFailure: true });
  });

  it('keeps file order, timestamp offsets and past failures after recovery', () => {
    const directory = runsDir([
      { ...record, at: '2026-10-29T10:00:00+05:30', status: 'fail', error: 'first error' },
      { ...record, status: 'retry', error: 'latest error' },
      { ...record, at: '2026-10-28T22:00:00-04:00', owner: null, error: '' },
      { ...record, at: '2026-10-28T21:00:00-04:00', owner: null },
    ].map(value => JSON.stringify(value)).join('\n'));
    expect(readNight(directory, night)).toEqual({
      night, badLines: 0, counts: { ok: 2, retry: 1, fail: 1 },
      rows: [{
        job: 'lane/sync', owner: null, runs: 4, retries: 1, lastStatus: 'ok',
        lastError: 'latest error', firstAt: '2026-10-29T10:00:00+05:30',
        lastAt: '2026-10-28T21:00:00-04:00', hasFailure: true,
      }],
    });
  });

  it('counts invalid JSON and structures while processing valid records and blank lines', () => {
    const invalid = [null, [], 42, 'text', {},
      { ...record, at: 1 }, { ...record, job: null }, { ...record, status: 'unknown' },
      { ...record, owner: false }, { ...record, owner: undefined },
      { ...record, error: null }, { ...record, error: 42 },
    ];
    const directory = runsDir([
      JSON.stringify(record), '', ' \t\r', '{broken',
      ...invalid.map(value => JSON.stringify(value)), JSON.stringify(record), '',
    ].join('\n'));
    expect(readNight(directory, night)).toMatchObject({
      badLines: invalid.length + 1, counts: { ok: 2, retry: 0, fail: 0 },
      rows: [{ job: 'lane/sync', runs: 2 }],
    });
  });

  it('uses string ordering and handles object-property names as ordinary jobs', () => {
    const directory = runsDir(['z', '__proto__', 'a', 'Z', 'constructor']
      .map(job => JSON.stringify({ ...record, job })).join('\n'));
    expect(readNight(directory, night)?.rows.map(row => row.job))
      .toEqual(['Z', '__proto__', 'a', 'constructor', 'z']);
  });

  it.each(['', '\n \t\r\n'])('returns an empty digest for an empty or blank file', contents => {
    expect(readNight(runsDir(contents), night)).toEqual({
      night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('returns null for a missing file', () => {
    expect(readNight(runsDir(), night)).toBeNull();
  });

  it.each(['../2026-10-28', '/2026-10-28', '2026-10-28/../2026-10-28', '2026-10-28.jsonl',
    '2026-1-28', '2026-10-28\n', '2026-10-28\\..', ''])('rejects invalid night %j before file access', value => {
    // A non-directory path would throw if the reader attempted filesystem access.
    const directory = runsDir('');
    expect(readNight(join(directory, `${night}.jsonl`), value)).toBeNull();
  });

  it('propagates filesystem errors other than missing files', () => {
    const directory = runsDir();
    mkdirSync(join(directory, `${night}.jsonl`));
    expect(() => readNight(directory, night)).toThrow();
  });
});
