import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/ui.fixtures.js';
import { loginData } from '../../shared/data/loginData.js';

const { Given, When, Then } = createBdd(test);

// ─── Given ───────────────────────────────────────────────────────────────────

Given('I am on the login page', async ({ loginPage }) => {
  await loginPage.goto();
});

// ─── When ────────────────────────────────────────────────────────────────────

When('I enter valid credentials', async ({ loginPage }) => {
  await loginPage.fill('input[placeholder="Username"]', loginData.validUser.username);
  await loginPage.fill('input[placeholder="Password"]', loginData.validUser.password);
});

When('I click the login button', async ({ loginPage }) => {
  await loginPage.click('button:has-text("Login")');
});

When('I hover over the logo to expand the sidebar', async ({ page }) => {
  await page.locator('tql-navbar-logo').hover();
});

When('I hover over System Models menu', async ({ page }) => {
  await page.locator('.hide-on-collapsed tql-simple-list.level-0 .item', { hasText: 'System Models' }).hover();
});

When('I click on BOTs', async ({ page }) => {
  await page.locator('.hide-on-collapsed tql-simple-list.level-1 .item', { hasText: /\bBOTs\b/ }).click();
});

// ─── Then ────────────────────────────────────────────────────────────────────

Then('I should be redirected away from the login page', async ({ page }) => {
  await expect(page).not.toHaveURL(/#\/auth\/login/);
});

Then('I should see the BOTs page', async ({ page }) => {
  await expect(page).toHaveURL(/BOTs|bots/i);
});

Then('I should see 24 items per page', async ({ page }) => {
  await expect(page.getByText('24 / page', { exact: false }).filter({ visible: true })).toBeVisible();
});
