import { request } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_URL, USERS } from './config/config.js';

/**
 * Global setup — runs ONCE before the entire test suite.
 *
 * Responsibilities:
 *   1. Pre-flight: assert the BE is reachable. Fail fast with a clear message
 *      instead of letting every scenario fail with a confusing network error.
 *   2. Warm-up auth: log in via REST `/fid-auth` once, write the session token
 *      to `.auth/api-session.json`. API tests / scripts can read this to skip
 *      the login round-trip when they only need a token.
 *
 * Why a file (and not just an env var):
 *   - Survives across processes (helpful when running ad-hoc scripts in
 *     parallel with the suite).
 *   - Keeps the token out of the shell history.
 *   - File is in `.gitignore` so it never reaches the repo.
 */
const AUTH_DIR  = fileURLToPath(new URL('../.auth/', import.meta.url));
const AUTH_FILE = `${AUTH_DIR}api-session.json`;

export default async function globalSetup() {
  const started = Date.now();

  const apiRequest = await request.newContext({ baseURL: BASE_URL });

  // ── 1. Pre-flight: BE reachable? ───────────────────────────────────────
  try {
    const ping = await apiRequest.get('/', { timeout: 5_000 });
    if (ping.status() >= 500) {
      throw new Error(`BE returned ${ping.status()} on GET / — server unhealthy`);
    }
  } catch (err) {
    await apiRequest.dispose();
    throw new Error(
      `[globalSetup] BE not reachable at ${BASE_URL} — ${err.message}\n` +
      `Hint: check TEST_ENV / docker-compose / VPN, then re-run.`
    );
  }

  // ── 2. Warm-up auth: cache a REST session token to disk ────────────────
  const res  = await apiRequest.post('/fid-auth', {
    data: { login: { email: USERS.standard.username, password: USERS.standard.password } },
  });
  const body = await res.json();
  const login = body?.login;

  if (login?.status !== 'Success') {
    await apiRequest.dispose();
    throw new Error(
      `[globalSetup] Auth warm-up failed — login.status=${login?.status}. ` +
      `Verify USER_USERNAME / USER_PASSWORD env vars for TEST_ENV=${process.env.TEST_ENV || 'local'}.`
    );
  }

  mkdirSync(dirname(AUTH_FILE), { recursive: true });
  writeFileSync(AUTH_FILE, JSON.stringify({
    session:   login.session,
    fid:       login.fid,
    uid:       login.uid,
    baseURL:   BASE_URL,
    cachedAt:  new Date().toISOString(),
  }, null, 2));

  await apiRequest.dispose();

  const elapsed = Date.now() - started;
  console.log(`[globalSetup] BE healthy + auth cached (${elapsed}ms) → ${AUTH_FILE}`);
}

export { AUTH_FILE };
