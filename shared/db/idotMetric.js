import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

const DB_URL = process.env.DB_URL
  || 'postgresql://postgres@localhost:5432/app_dev_db';

const SQL_LATEST_PERIOD = readFileSync(
  new URL('./sql/latest-idot-period.sql', import.meta.url),
  'utf8',
);

/**
 * Returns `{ start, end }` for the most-recent `IDotMetricValue` row.
 *
 * Both values are `YYYY-MM-DD HH:MM:SS` strings — the format the BE expects in
 * `metricTimeFilter`. Per CLAUDE.md hard rule, only SELECT is used here.
 *
 * The actual SQL lives in `shared/db/sql/latest-idot-period.sql` so the query
 * can be copy-pasted into psql for debugging and so changes show up cleanly in
 * git diff.
 */
export async function getLatestIDotPeriod() {
  const { stdout } = await execFileP('psql', [DB_URL, '-At', '-c', SQL_LATEST_PERIOD]);
  const line = stdout.trim();
  if (!line) throw new Error('IDotMetricValue is empty — cannot derive a time window');
  const [start, end] = line.split('|');
  if (!start || !end) throw new Error(`Unexpected psql output: "${line}"`);
  return { start, end };
}
