import { test, expect } from '../fixtures/ui.spec.fixtures.js';
import { loginData } from '../../shared/data/loginData.js';
import { addLabel, attachScreenshot, SEVERITY, FEATURE } from '../../shared/utils/allure.js';

test.describe('User Authentication', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.goto();
  });

  test('Login page loads at the correct URL', async ({ page }) => {
    addLabel({
      feature:  FEATURE.AUTH,
      story:    'Login page UI',
      severity: SEVERITY.NORMAL,
      owner:    'qa-team',
    });

    await test.step('Verify login page URL and form elements are visible', async () => {
      await expect(page).toHaveURL(/#\/auth\/login/);
      await expect(page.locator('input[placeholder="Username"]')).toBeVisible();
      await expect(page.locator('input[placeholder="Password"]')).toBeVisible();
      await expect(page.locator('button:has-text("Login")')).toBeVisible();
      await attachScreenshot(page, 'Login page');
    });
  });

  test('User can log in with valid credentials and access the dashboard', async ({ loginPage, page }) => {
    addLabel({
      feature:  FEATURE.AUTH,
      story:    'Login with valid credentials',
      severity: SEVERITY.CRITICAL,
      owner:    'qa-team',
    });

    await test.step('Enter valid username and password', async () => {
      await loginPage.login(loginData.validUser.username, loginData.validUser.password);
    });

    await test.step('Verify user is redirected away from the login page', async () => {
      await expect(page).not.toHaveURL(/#\/auth\/login/);
      await attachScreenshot(page, 'Dashboard after login');
    });
  });

  test('User can navigate to BOTs via the System Models menu', async ({ loginPage, page }) => {
    addLabel({
      feature:  FEATURE.NAVIGATION,
      story:    'Sidebar navigation — System Models',
      severity: SEVERITY.NORMAL,
      owner:    'qa-team',
    });

    await test.step('Log in', async () => {
      await loginPage.login(loginData.validUser.username, loginData.validUser.password);
    });

    await test.step('Expand sidebar by hovering the logo', async () => {
      await page.locator('tql-navbar-logo').hover();
    });

    await test.step('Hover System Models to reveal submenu', async () => {
      await page.locator('.hide-on-collapsed tql-simple-list.level-0 .item', { hasText: 'System Models' }).hover();
    });

    await test.step('Click BOTs menu item', async () => {
      await page.locator('.hide-on-collapsed tql-simple-list.level-1 .item', { hasText: /\bBOTs\b/ }).click();
    });

    await test.step('Verify BOTs page is loaded', async () => {
      await expect(page).toHaveURL(/BOTs|bots/i);
    });

    await test.step('Verify 24 items per page is displayed', async () => {
      await expect(page.getByText('24 / page', { exact: false }).filter({ visible: true })).toBeVisible();
      await attachScreenshot(page, 'BOTs page');
    });
  });
});
