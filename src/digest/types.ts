export type RunStatus = 'ok' | 'retry' | 'fail';

/** Counts of valid log records, not counts of jobs or their final statuses. */
export type StatusCounts = Record<RunStatus, number>;

/** One job's valid records, accumulated in file order. */
export type DigestRow = {
  job: string;
  /** Owner from the last record, including null for an unassigned job. */
  owner: string | null;
  /** Total valid records for this job, including retry and fail records. */
  runs: number;
  /** Number of records whose status is retry. */
  retries: number;
  lastStatus: RunStatus;
  /** Last nonempty error encountered; retained after recovery, null if none. */
  lastError: string | null;
  /** First/last record timestamps in file order, preserving original offsets. */
  firstAt: string;
  lastAt: string;
  /** True if any record failed, even if the last record succeeded. */
  hasFailure: boolean;
};

export type NightDigest = {
  /** The requested YYYY-MM-DD filename stem, not a timestamp-derived date. */
  night: string;
  /** One row per job, sorted ascending by job using string comparison. */
  rows: DigestRow[];
  /** Nonblank lines with invalid JSON or invalid record structure. */
  badLines: number;
  counts: StatusCounts;
};

/**
 * Contract for readNight, implemented and exported by ./read-night.js.
 *
 * Read runsDir/<night>.jsonl synchronously. Return null for a missing file or an
 * invalid night (only a YYYY-MM-DD filename stem is accepted). Other filesystem
 * errors propagate. An empty file returns an empty digest with zero counts;
 * malformed lines increment badLines without preventing other lines rendering.
 * Ignore blank lines, including a final newline. Accept records with string at
 * and job, status ok/retry/fail, owner string or null, and optional string error.
 * Preserve timestamps verbatim; file order determines first/last records.
 * All consumers use this same result for HTML, JSON, and board status counts.
 */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
