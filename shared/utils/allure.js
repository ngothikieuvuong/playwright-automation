import { test } from '@playwright/test';

// ─── Constants ────────────────────────────────────────────────────────────────

export const SEVERITY = {
  BLOCKER:  'blocker',   // app is unusable
  CRITICAL: 'critical',  // core business flow
  NORMAL:   'normal',    // standard functionality
  MINOR:    'minor',     // edge case
  TRIVIAL:  'trivial',   // low priority
};

export const FEATURE = {
  AUTH:       'Authentication',
  NAVIGATION: 'Navigation',
  DASHBOARD:  'Dashboard',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Adds Allure metadata labels to the current test.
 * Call at the top of each test body.
 *
 * @example
 * addLabel({ feature: FEATURE.AUTH, story: 'Login', severity: SEVERITY.CRITICAL, owner: 'qa-team' });
 */
export function addLabel({ feature, story, severity, owner }) {
  test.info().annotations.push(
    { type: 'feature',  value: feature },
    { type: 'story',    value: story },
    { type: 'severity', value: severity },
    { type: 'owner',    value: owner },
  );
}

/**
 * Captures a full-page screenshot and attaches it to the Allure report.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name - Label shown in the Allure Attachments tab
 *
 * @example
 * await attachScreenshot(page, 'Dashboard after login');
 */
export async function attachScreenshot(page, name = 'screenshot') {
  const screenshot = await page.screenshot({ fullPage: true });
  await test.info().attach(name, {
    body: screenshot,
    contentType: 'image/png',
  });
}
