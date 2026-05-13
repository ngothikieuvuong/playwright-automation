/**
 * Central configuration for the test framework.
 *
 * All environment URLs and credentials are sourced from environment variables
 * (loaded from a local `.env` file — see `.env.example`). The framework throws
 * a clear error at startup if a required variable is missing for the active
 * `TEST_ENV`. Nothing sensitive ships in source.
 *
 * Usage:
 *   TEST_ENV=local npx playwright test     (default)
 *   TEST_ENV=dev   npx playwright test
 */

const ENV = process.env.TEST_ENV || 'local';

const ENVIRONMENTS = {
  local: process.env.LOCAL_BASE_URL || 'http://localhost:8080',
  dev:   process.env.DEV_BASE_URL,
};

if (!ENVIRONMENTS[ENV]) {
  const hint = ENV === 'dev'
    ? 'Set DEV_BASE_URL in your .env file.'
    : `Valid options: ${Object.keys(ENVIRONMENTS).join(', ')}.`;
  throw new Error(`Unknown or unconfigured TEST_ENV "${ENV}". ${hint}`);
}

export const BASE_URL     = process.env.BASE_URL     || ENVIRONMENTS[ENV];
// API may live on the same host as the UI by default; override when BE has its own URL.
export const API_BASE_URL = process.env.API_BASE_URL || BASE_URL;

export const APP_PATH   = '/fid-ui/ctx/index.html';
export const LOGIN_PATH = `${APP_PATH}#/auth/login`;

export const TIMEOUT = {
  // 120s tolerates non-Chromium engines on this Angular app (Firefox cold boot
  // is ~2× Chromium). Headroom for slow CI as well — Chromium tests still
  // finish under 15s so the higher cap costs nothing in the happy path.
  TEST:       120_000,
  EXPECT:      5_000,
  NAVIGATION: 10_000,
  // Cold boot of the Angular app (splash → dashboard) can exceed NAVIGATION.
  // Used for "wait until the app shell is ready" after a fresh page.goto.
  APP_BOOT:   30_000,
};

// Per-environment user credentials — sourced exclusively from env vars.
// See `.env.example` for the variable names. Missing vars trigger a clear
// error the first time a test tries to log in, not at config load (so the
// suite can still be statically analysed without a populated .env).
function readUser(prefix, role) {
  const u = process.env[`${prefix}_USERNAME`];
  const p = process.env[`${prefix}_PASSWORD`];
  return {
    get username() {
      if (!u) throw new Error(`Missing ${prefix}_USERNAME in env — required for ${role} on TEST_ENV=${ENV}.`);
      return u;
    },
    get password() {
      if (!p) throw new Error(`Missing ${prefix}_PASSWORD in env — required for ${role} on TEST_ENV=${ENV}.`);
      return p;
    },
  };
}

const USERS_BY_ENV = {
  local: {
    admin:    readUser('ADMIN',     'local admin user'),
    standard: readUser('USER',      'local standard user'),
  },
  dev: {
    admin:    readUser('DEV_ADMIN', 'dev admin user'),
    standard: readUser('DEV_USER',  'dev standard user'),
  },
};

export const USERS = USERS_BY_ENV[ENV];
