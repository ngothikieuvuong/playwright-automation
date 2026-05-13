import { test as base } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage.js';

export const test = base.extend({
  // Automatically attaches a full-page screenshot to Allure on any test failure.
  // Runs for every test — no changes needed in spec files.
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

export const { expect } = base;
