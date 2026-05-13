import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/api.fixtures.js';

const { When, Then } = createBdd(test);

When('I call {string} over the WebSocket', async ({ wsClient, apiState }, apiName) => {
  const start = Date.now();
  const body = await wsClient.call(apiName);
  apiState.durationMs = Date.now() - start;
  apiState.body = body;
});

Then('the WebSocket response status should be {string}', async ({ apiState }, expected) => {
  expect(apiState.body?.status).toBe(expected);
});

Then('the response should contain at least {int} organization(s)', async ({ apiState }, min) => {
  const count = Object.keys(apiState.body?.Orgs ?? {}).length;
  expect(count, 'Orgs count').toBeGreaterThanOrEqual(min);
});
