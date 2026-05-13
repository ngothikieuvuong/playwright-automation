import { test as base } from 'playwright-bdd';
import { AuthClient } from '../clients/AuthClient.js';
import { WsClient } from '../clients/WsClient.js';
import { SessionClient } from '../clients/SessionClient.js';
import { BASE_URL, USERS } from '../../shared/config/config.js';

/**
 * BDD test fixture for the API layer.
 *
 * Per-test fixtures
 *   authClient  — REST AuthClient bound to this test's request context
 *   authToken   — pre-authenticated session string for tests that don't care
 *                 about the login flow itself
 *   apiState    — per-scenario mutable bag for passing response state between steps
 *
 * Worker-scoped fixture
 *   wsClient    — one HTTP login + one WebSocket connection + one SetOrg per worker.
 *                 Reused across every API scenario in the worker so tests don't
 *                 redo the handshake.
 *   wsSession   — info about the active org/timezone established by SetOrg
 *
 * @example
 *   When('I fetch organizations', async ({ wsClient }) => {
 *     const { Orgs } = await wsClient.call('GetOrgs');
 *     ...
 *   });
 */
const wsUrlFromFid = (fid) => `${BASE_URL.replace(/^http/, 'ws')}/fid-${fid}`;

export const test = base.extend({
  authClient: async ({ request }, use) => {
    await use(new AuthClient(request));
  },

  authToken: async ({ request }, use) => {
    const client = new AuthClient(request);
    const { body } = await client.login(USERS.standard.username, USERS.standard.password);
    await use(body?.login?.session);
  },

  apiState: async ({}, use) => {
    await use({ response: null, body: null, durationMs: 0 });
  },

  // ── Worker-scoped — one login + WS + SetOrg per worker ──────────────────
  // A nested array `[fn, options]` is Playwright's syntax for fixture options.
  // We construct our own request context so this fixture can run at worker scope
  // (test-scoped fixtures aren't injectable into worker-scoped ones).
  wsClient: [async ({ playwright }, use) => {
    const apiRequest = await playwright.request.newContext({ baseURL: BASE_URL });
    const auth = new AuthClient(apiRequest);
    const { body } = await auth.login(USERS.standard.username, USERS.standard.password);
    const login = body?.login;
    if (!login || login.status !== 'Success') {
      throw new Error(`API fixture: HTTP login failed — ${JSON.stringify(body)}`);
    }
    const ws = new WsClient(wsUrlFromFid(login.fid));
    await ws.connect();
    const session = new SessionClient(ws);
    await session.setActiveOrgFromFirst();
    // Stash session info on the client so tests can read it.
    ws.session = session;
    await use(ws);
    await ws.close();
    await apiRequest.dispose();
  }, { scope: 'worker' }],

  wsSession: async ({ wsClient }, use) => {
    await use(wsClient.session);
  },
});
