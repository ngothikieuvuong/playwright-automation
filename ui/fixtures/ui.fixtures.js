import { test as base } from 'playwright-bdd';
import { LoginPage } from '../pages/LoginPage.js';
import { loginData } from '../../shared/data/loginData.js';
import { TIMEOUT } from '../../shared/config/config.js';

/**
 * Auth strategy for the UI BDD suite
 * ──────────────────────────────────
 * This Angular app keeps its auth token in IndexedDB. Playwright's
 * `storageState` flag for IndexedDB exists but does not reliably restore
 * the token across fresh contexts on this BE — about half the tests get
 * redirected to /auth/login.
 *
 * Instead we run ONE authenticated browser context per worker and hand each
 * test its own page from that context. Authentication therefore carries over
 * for free; nothing is serialised to disk.
 *
 * @auth-tagged scenarios (the login UI tests themselves) bypass this and get
 * a clean, anonymous context so they can exercise the login flow from scratch.
 */
export const test = base.extend({
  // Worker-scoped: ONE authenticated page reused across every non-@auth test
  // in the worker. Reusing the same tab (instead of a fresh page per test on
  // a shared context) avoids the auth re-check that intermittently rejects
  // restored sessions on this BE.
  workerAuthedPage: [async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const login = new LoginPage(page);
    await login.goto();
    await login.login(loginData.validUser.username, loginData.validUser.password);
    await page.locator('tql-navbar-logo').waitFor({ state: 'visible', timeout: TIMEOUT.APP_BOOT });
    await use(page);
    await ctx.close();
  }, { scope: 'worker' }],

  // Override the default `page` fixture:
  //   * `@auth` scenarios → fresh anonymous context (to exercise the login UI)
  //   * everything else  → the shared, already-authed page (one login per worker)
  page: async ({ browser, workerAuthedPage }, use, testInfo) => {
    const isAuthFlow = (testInfo.tags || []).includes('@auth');
    if (isAuthFlow) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await use(page);
      await ctx.close();
    } else {
      await use(workerAuthedPage);
    }
  },

  autoScreenshot: [async ({ page }, use, testInfo) => {
    await use();
    if (testInfo.status !== testInfo.expectedStatus) {
      const screenshot = await page.screenshot({ fullPage: true });
      await testInfo.attach('failure-screenshot', {
        body: screenshot,
        contentType: 'image/png',
      });
    }
  }, { auto: true }],

  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
});
