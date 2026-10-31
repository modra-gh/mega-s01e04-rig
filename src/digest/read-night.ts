import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, ReadNight, RunStatus } from './types.js';

type RunRecord = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function isRunRecord(value: unknown): value is RunRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.at === 'string'
    && typeof record.job === 'string'
    && (record.status === 'ok' || record.status === 'retry' || record.status === 'fail')
    && (typeof record.owner === 'string' || record.owner === null)
    && (!('error' in record) || typeof record.error === 'string');
}

export const readNight: ReadNight = (runsDir, night) => {
  if (night.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  const digest: NightDigest = { night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
  const jobs = new Map<string, DigestRow>();

  for (const line of contents.split('\n')) {
    if (!line.trim()) continue;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      digest.badLines++;
      continue;
    }
    if (!isRunRecord(record)) {
      digest.badLines++;
      continue;
    }

    digest.counts[record.status]++;
    const row = jobs.get(record.job);
    if (row) {
      row.owner = record.owner;
      row.runs++;
      row.retries += Number(record.status === 'retry');
      row.lastStatus = record.status;
      if (record.error) row.lastError = record.error;
      row.lastAt = record.at;
      row.hasFailure ||= record.status === 'fail';
    } else {
      jobs.set(record.job, {
        job: record.job,
        owner: record.owner,
        runs: 1,
        retries: Number(record.status === 'retry'),
        lastStatus: record.status,
        lastError: record.error || null,
        firstAt: record.at,
        lastAt: record.at,
        hasFailure: record.status === 'fail',
      });
    }
  }

  digest.rows = [...jobs.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return digest;
};
