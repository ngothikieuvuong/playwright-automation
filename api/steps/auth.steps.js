import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/api.fixtures.js';
import { USERS } from '../../shared/config/config.js';

const { When, Then } = createBdd(test);

// ─── When ────────────────────────────────────────────────────────────────────

When('I log in with standard user credentials', async ({ authClient, apiState }) => {
  const start = Date.now();
  const { response, body } = await authClient.login(
    USERS.standard.username,
    USERS.standard.password,
  );
  apiState.durationMs = Date.now() - start;
  apiState.response = response;
  apiState.body = body;
});

// ─── Then ────────────────────────────────────────────────────────────────────

Then('the response status should be {int}', async ({ apiState }, status) => {
  expect(apiState.response.status()).toBe(status);
});

Then('the response time should be under {int} ms', async ({ apiState }, maxMs) => {
  expect(apiState.durationMs).toBeLessThan(maxMs);
});

Then('the login status should be {string}', async ({ apiState }, expected) => {
  expect(apiState.body?.login?.status).toBe(expected);
});

Then('the response should contain a non-empty session identifier', async ({ apiState }) => {
  const session = apiState.body?.login?.session;
  expect(typeof session).toBe('string');
  expect(session.length).toBeGreaterThan(0);
});

Then('the response should contain a non-empty fid', async ({ apiState }) => {
  const fid = apiState.body?.login?.fid;
  expect(typeof fid).toBe('string');
  expect(fid.length).toBeGreaterThan(0);
});
