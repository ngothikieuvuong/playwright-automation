// @ts-check
import 'dotenv/config';                                 // auto-load `.env` into process.env
import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
import { BASE_URL, API_BASE_URL, TIMEOUT } from './shared/config/config.js';

// ─── BDD configs ─────────────────────────────────────────────────────────────
// UI and API are isolated: separate features, steps, fixtures, and gen output.
// Step text never collides between layers.

const uiTestDir = defineBddConfig({
  features:  'ui/features/**/*.feature',
  steps:     ['ui/steps/**/*.js', 'ui/fixtures/ui.fixtures.js'],
  outputDir: '.features-gen/ui',
});

const apiTestDir = defineBddConfig({
  features:  'api/features/**/*.feature',
  steps:     ['api/steps/**/*.js', 'api/fixtures/api.fixtures.js'],
  outputDir: '.features-gen/api',
});

// ─── Multi-browser support ───────────────────────────────────────────────────
// Default: Chromium only (project names `ui` and `ui-auth`, unchanged).
// To run other browsers, set `BROWSERS` env var (comma-separated) and pick the
// corresponding `--project=ui-<browser>` / `ui-auth-<browser>`:
//
//   npm run test:ui                                  # chromium only (default)
//   npm run test:ui:firefox                          # firefox only
//   npm run test:ui:all                              # chromium + firefox + webkit
//   BROWSERS=chromium,firefox npm run test:ui -- --project=ui --project=ui-firefox
//
// Chromium keeps the bare names `ui` / `ui-auth` so existing scripts work as-is.
// Other browsers append a suffix: `ui-firefox`, `ui-auth-webkit`, etc.
const BROWSERS = (process.env.BROWSERS || 'chromium').split(',').map((b) => b.trim());

const BROWSER_DEVICE = {
  chromium: devices['Desktop Chrome'],
  firefox:  devices['Desktop Firefox'],
  webkit:   devices['Desktop Safari'],
};

/** @satisfies {import('@playwright/test').PlaywrightTestConfig['use']} */
const COMMON_UI_USE = {
  baseURL: BASE_URL,
  trace: /** @type {const} */ ('on-first-retry'),
  screenshot: /** @type {const} */ ('only-on-failure'),
  video: /** @type {const} */ ('on-first-retry'),
};

const uiProjects = BROWSERS.flatMap((browser) => {
  const device = BROWSER_DEVICE[browser];
  if (!device) {
    throw new Error(`Unknown BROWSER "${browser}". Use chromium, firefox, or webkit.`);
  }
  const suffix = browser === 'chromium' ? '' : `-${browser}`;
  return [
    {
      name: `ui-auth${suffix}`,
      testDir: uiTestDir,
      grep: /@auth/,
      use: { ...COMMON_UI_USE, ...device },
    },
    {
      name: `ui${suffix}`,
      testDir: uiTestDir,
      grepInvert: /@auth/,
      use: { ...COMMON_UI_USE, ...device },
    },
  ];
});

export default defineConfig({
  timeout: TIMEOUT.TEST,
  expect:  { timeout: TIMEOUT.EXPECT },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  // Runs ONCE before any worker starts: BE pre-flight + auth warm-up.
  // See shared/globalSetup.js. Skip with `SKIP_GLOBAL_SETUP=1` for fast iter.
  globalSetup: process.env.SKIP_GLOBAL_SETUP ? undefined : './shared/globalSetup.js',

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['allure-playwright', { outputFolder: 'allure-results' }],
  ],

  projects: [
    ...uiProjects,
    {
      name: 'ui-spec',
      testDir: './ui/tests',
      use: { ...COMMON_UI_USE, ...devices['Desktop Chrome'] },
    },
    {
      name: 'api',
      testDir: apiTestDir,
      use: {
        baseURL: API_BASE_URL,
        trace: 'on-first-retry',
        // no browser, no screenshot, no video — headless HTTP only
      },
    },
  ],
});
