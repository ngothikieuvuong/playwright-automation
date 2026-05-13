// ─── Random String ───────────────────────────────────────────────────────────

/**
 * Returns a random alphanumeric string of the given length.
 * @example randomString(8) // 'k4f9xz2m'
 */
export function randomString(length = 8) {
  return Math.random().toString(36).substring(2, 2 + length);
}

// ─── Wait Helper ─────────────────────────────────────────────────────────────

/**
 * Pauses execution for the given number of milliseconds.
 * Prefer Playwright's built-in waiting over this — use only as a last resort.
 * @example await wait(500);
 */
export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Logger ──────────────────────────────────────────────────────────────────

/**
 * Lightweight console logger with timestamp and level prefix.
 * @example
 * logger.info('Test started');   // [12:00:00] [INFO ] Test started
 * logger.warn('Slow response');  // [12:00:01] [WARN ] Slow response
 * logger.error('Login failed');  // [12:00:02] [ERROR] Login failed
 */
export const logger = {
  _log(level, message) {
    const time = new Date().toTimeString().split(' ')[0];
    console.log(`[${time}] [${level.padEnd(5)}] ${message}`);
  },
  info(message)  { this._log('INFO',  message); },
  warn(message)  { this._log('WARN',  message); },
  error(message) { this._log('ERROR', message); },
};
