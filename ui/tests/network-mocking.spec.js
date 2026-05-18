import { test, expect } from '../fixtures/ui.spec.fixtures.js';
import { addLabel, attachScreenshot, SEVERITY, FEATURE } from '../../shared/utils/allure.js';

/**
 * Demonstrates Playwright's `page.route()` — intercept REST traffic and return
 * canned responses without touching the real BE.
 *
 * Why this matters for senior automation:
 *   1. Determinism — exercise UI error paths (5xx, validation rejects, slow
 *      network) that are hard to provoke against a real BE.
 *   2. Isolation — UI tests stop being coupled to BE uptime / data state.
 *   3. Contract verification — assert FE sends the EXACT request shape the BE
 *      expects (`{login:{email,password}}`, NOT `{username,password}` flat).
 *
 * Trade-off: mocks can drift from real contract over time. Mitigate by keeping
 * a separate API contract suite hitting the real BE.
 *
 * Run with:
 *   SKIP_GLOBAL_SETUP=1 npm run test:spec -- --grep "@mock"
 * (SKIP_GLOBAL_SETUP because these tests don't need a live BE.)
 */
import { BASE_URL, LOGIN_PATH } from '../../shared/config/config.js';

const LOGIN_URL = `${BASE_URL}${LOGIN_PATH}`;

test.describe('@mock Network mocking — login flow via page.route()', () => {

  test('FE sends the correct request shape and navigates on mocked success', async ({ page, loginPage }) => {
    addLabel({
      feature:  FEATURE.AUTH,
      story:    'Auth REST contract — request shape',
      severity: SEVERITY.CRITICAL,
      owner:    'qa-team',
    });

    /** @type {unknown} */
    let capturedBody;

    await test.step('Intercept POST /fid-auth and assert contract', async () => {
      await page.route('**/fid-auth', async (route) => {
        const req = route.request();
        expect(req.method()).toBe('POST');
        capturedBody = req.postDataJSON();

        // Reply with a fabricated success envelope — no real BE involved.
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            login: {
              status:  'Success',
              mid:     '00000000-0000-0000-0000-000000000000',
              uid:     'mock-uid',
              fid:     'mock-fid',
              host:    'localhost',
              port:    8080,
              mode:    'mock',
              session: 'mock-session-token',
            },
          }),
        });
      });
    });

    await test.step('Submit the form', async () => {
      await loginPage.goto();
      await loginPage.login('alice@example.com', 'pa$$w0rd');
    });

    await test.step('FE used the {login:{email,password}} wrapper (not flat)', async () => {
      expect(capturedBody).toEqual({
        login: { email: 'alice@example.com', password: 'pa$$w0rd' },
      });
    });

    await test.step('FE navigates away from /auth/login on Success', async () => {
      await expect(page).not.toHaveURL(/#\/auth\/login/);
      await attachScreenshot(page, 'Post-mock-success state');
    });
  });

  test('UI stays on /auth/login when BE responds with login.status=Error', async ({ page, loginPage }) => {
    addLabel({
      feature:  FEATURE.AUTH,
      story:    'Auth REST error path — login.status=Error',
      severity: SEVERITY.NORMAL,
      owner:    'qa-team',
    });

    await page.route('**/fid-auth', (route) => route.fulfill({
      status: 200,                 // FID returns 200 for both success AND error
      contentType: 'application/json',
      body: JSON.stringify({
        login: { status: 'Error', errorMsg: 'Invalid credentials' },
      }),
    }));

    await loginPage.goto();
    await loginPage.login('bad-user', 'bad-pass');

    // FE should NOT navigate away — login URL persists.
    await expect(page).toHaveURL(/#\/auth\/login/);
  });

  test('UI tolerates slow BE — login button stays interactive while request is pending', async ({ page, loginPage }) => {
    addLabel({
      feature:  FEATURE.AUTH,
      story:    'Auth REST — slow network resilience',
      severity: SEVERITY.MINOR,
      owner:    'qa-team',
    });

    // Hold the response for 2s to simulate a slow BE.
    await page.route('**/fid-auth', async (route) => {
      await new Promise((r) => setTimeout(r, 2_000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          login: { status: 'Success', session: 'mock-session', fid: 'mock-fid', uid: 'mock-uid' },
        }),
      });
    });

    await loginPage.goto();
    const start = Date.now();
    await loginPage.login('slow@example.com', 'slow-pass');

    // Eventually navigates, despite the artificial latency.
    await expect(page).not.toHaveURL(/#\/auth\/login/, { timeout: 10_000 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(2_000);
  });
});
