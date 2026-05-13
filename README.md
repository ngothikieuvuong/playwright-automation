# Playwright Automation Framework

Playwright + Cucumber BDD framework for testing the **Atomiton FID** stack — UI flows in the Angular app and API calls over both REST (`/fid-auth`) and WebSocket (`ws://<host>/fid-<fid>`, BML `Async:` protocol). UI and API layers are kept fully independent.

## Tech Stack

- [Playwright](https://playwright.dev/) — browser + HTTP automation
- [playwright-bdd](https://vitalets.github.io/playwright-bdd/) — Gherkin / Cucumber on top of Playwright
- [`ws`](https://www.npmjs.com/package/ws) — WebSocket client for the FID BML protocol
- [Allure](https://allurereport.org/) — test reporting
- Node.js (ES Modules); Chromium by default, Firefox + WebKit optional
- PostgreSQL — read-only, via `psql`, for deriving test data and verifying side effects

## Project Structure

UI and API are isolated: separate features, steps, fixtures, generated specs. No cross-imports — anything shared lives under `shared/`.

```
playwright-automation/
├── ui/
│   ├── features/                      # *.feature tagged @ui  (Gherkin EN)
│   ├── steps/                         # step defs, use page objects
│   ├── pages/                         # POM — BasePage + concrete pages
│   ├── fixtures/
│   │   ├── ui.fixtures.js             # BDD fixture — workerAuthedPage, page override, loginPage
│   │   └── ui.spec.fixtures.js        # raw spec fixture (Allure-labelled)
│   └── tests/                         # raw *.spec.js (prefer BDD)
│
├── api/
│   ├── features/                      # *.feature tagged @api
│   ├── steps/                         # step defs, use clients + wsClient fixture
│   ├── clients/
│   │   ├── BaseClient.js              # REST base — Playwright request wrapper
│   │   ├── AuthClient.js              # REST POST /fid-auth (login)
│   │   ├── WsClient.js                # WebSocket BML "Async:" protocol
│   │   ├── SessionClient.js           # required GetOrgs+SetOrg handshake (single BML script)
│   │   ├── OrganizationClient.js      # WS GetSchemeBasedOrganization
│   │   └── MetricsClient.js           # WS GetNodeIDotMetric
│   └── fixtures/
│       └── api.fixtures.js            # authClient, authToken, apiState, wsClient (worker-scoped)
│
├── shared/
│   ├── config/config.js               # BASE_URL, API_BASE_URL, APP_PATH, USERS, TIMEOUT
│   ├── data/
│   │   ├── users.json                 # static user profiles
│   │   ├── loginData.js               # default credentials
│   │   └── expectationData/           # JSON arrays asserted against API responses
│   ├── utils/                         # helpers, allure labels
│   └── db/
│       ├── sql/                       # raw .sql files — one query per file
│       └── *.js                       # wrappers loading the SQL + execFile psql
│
├── scripts/
│   └── archive-report.mjs             # bundle allure + playwright reports per ticket
│
├── .claude/                           # Claude Code agents + project-scoped slash commands
├── playwright.config.js
├── CLAUDE.md                          # convention reference for AI assistance
└── package.json
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL client (`psql`) on PATH — used by `shared/db/*.js`
- Backend (`backend-container` on `localhost:8080`) running locally
- [Allure CLI](https://allurereport.org/docs/install/) (`brew install allure` on macOS)

### Install

```bash
npm install
npx playwright install chromium                       # default browser
npx playwright install chromium firefox webkit        # if you want all three
```

### Configure

```bash
cp .env.example .env       # then fill in the values for your environment
```

All URLs, credentials and the DB connection string are sourced from `.env` — nothing sensitive lives in source control. See the [Configuration](#configuration) section for the full variable list. `.env` is gitignored.

## Architecture in 60 seconds

### How a UI test runs

1. Worker boots → `ui.fixtures.js` creates **one** authenticated browser context (`workerAuthedPage`) by completing the real login flow.
2. Each non-`@auth` scenario reuses that page — no relogin between tests.
3. Scenarios tagged `@auth` get a fresh anonymous context so they can exercise the login flow from scratch.
4. Page Objects ([ui/pages/](ui/pages/)) navigate via deep links (`APP_PATH#/...`) rather than sidebar hover-and-click — more resilient across browser engines.

### How an API test runs

1. Worker boots → `api.fixtures.js` performs the FID handshake **once per worker**:
   - REST `POST /fid-auth` returns `{session, fid, ...}`
   - Open WebSocket to `ws://<host>/fid-<fid>`
   - Send a **single BML script** that runs `GetOrgs() + SetOrg($args)` atomically (split into two `Async:` messages leaves backend state empty — see [api/clients/SessionClient.js](api/clients/SessionClient.js))
2. Each scenario uses the `wsClient` fixture to issue `Async:` calls. Responses are matched back by an echoed `mid`.
3. Business APIs go over WS. REST is only used for `/fid-auth` and any other plain endpoint.

### Why worker-scoped?

The handshake (login + WS connect + SetOrg) takes ~1-2 seconds. Doing it per scenario inflates a 5-scenario feature from ~3s to ~13s. Worker scope spreads that cost across the entire suite.

## How to Run Tests

The framework defines multiple projects in [playwright.config.js](playwright.config.js):

| Project        | Source                          | Tag filter       | Browser? |
|----------------|---------------------------------|------------------|----------|
| `ui`           | `ui/features/**/*.feature`      | NOT `@auth`      | yes (Chromium) |
| `ui-auth`      | `ui/features/**/*.feature`      | `@auth` only     | yes (Chromium) |
| `api`          | `api/features/**/*.feature`     | —                | no (HTTP / WS) |
| `ui-spec`      | `ui/tests/*.spec.js` (raw)      | —                | yes (Chromium) |
| `ui-firefox`   | UI BDD                          | NOT `@auth`      | yes (Firefox)  |
| `ui-auth-firefox` | UI BDD                       | `@auth`          | yes (Firefox)  |
| `ui-webkit`    | UI BDD                          | NOT `@auth`      | yes (WebKit)   |
| `ui-auth-webkit`  | UI BDD                       | `@auth`          | yes (WebKit)   |

### Quick commands

```bash
npm run test:ui          # Chromium — non-auth UI scenarios + auth scenarios
npm run test:api         # API/WS scenarios, headless
npm run test:spec        # raw spec files
npm test                 # all default projects (Chromium UI + API + spec)

npm run test:ui:firefox  # UI scenarios on Firefox only
npm run test:ui:webkit   # UI scenarios on WebKit only
npm run test:ui:all      # Chromium + Firefox + WebKit (slower but cross-browser coverage)
```

### Run by tag

Every scenario carries `@ui`/`@api`, the ticket key, and scope tags (`@smoke`, `@regression`):

```bash
# All scenarios for a specific ticket (across UI + API)
npm test -- --grep "@CT-14315"

# Only smoke on the API layer
npm run test:api -- --grep "@smoke"

# Cross-browser run of one ticket
npm run test:ui:all -- --grep "@CT-14684"
```

### Run a single feature

```bash
npx playwright test --project=ui  ui/features/CT-14684-node-fitness-index.feature
npx playwright test --project=api api/features/CT-14315-get-node-idot-metric.feature
```

### Debug

```bash
npm run test:headed       # open Chromium window
npm run test:debug        # Playwright Inspector
npm run test:ui-mode      # interactive UI runner
```

### Switch environments

```bash
TEST_ENV=local npm test          # default
TEST_ENV=dev   npm test
```

Override with `BASE_URL`, `API_BASE_URL`, `USER_USERNAME`, `USER_PASSWORD`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `DB_URL` — see [shared/config/config.js](shared/config/config.js).

## Reports

```bash
npx playwright show-report   # Playwright HTML report
npm run allure:serve         # Allure — live server (quickest)
npm run allure:generate      # Allure — static report
npm run allure:open
```

### Archive reports per ticket

After a run, bundle the latest Allure + Playwright reports under `reports/<TICKET>-<DATE>/` (optionally zipped):

```bash
npm run report:archive -- CT-14684
npm run report:archive -- CT-14684 --no-zip
```

Useful for attaching to Jira PR comments. Output paths are echoed plus reopen instructions.

## Writing Tests

### UI scenario (BDD)

1. Create `ui/features/<JIRA-KEY>-<slug>.feature` with `@ui @<JIRA-KEY>` tags.
2. Add step definitions in `ui/steps/<slug>.steps.js` — import `test` from [ui/fixtures/ui.fixtures.js](ui/fixtures/ui.fixtures.js).
3. For a new page, create `ui/pages/<Name>Page.js` extending [ui/pages/BasePage.js](ui/pages/BasePage.js).
4. **Login is automatic**. Non-`@auth` scenarios receive an already-authenticated `page`. Only tag `@auth` if you're testing the login flow itself.
5. Navigate via deep link (`${BASE_URL}${APP_PATH}#/dashboards/...`) rather than hover-and-click sidebar — more stable across browsers.

```js
// ui/pages/MyPage.js
import { BasePage } from './BasePage.js';
import { APP_PATH, BASE_URL, TIMEOUT } from '../../shared/config/config.js';

const SELECTORS = {
  heading: '[data-testid="my-heading"]',     // 1. data-testid (preferred — flag for FE if missing)
  cell:    '.my-cell',                        // 2. semantic CSS fallback
};

export class MyPage extends BasePage {
  async open() {
    await this.navigate(`${BASE_URL}${APP_PATH}#/dashboards/.../my-page`);
    await this.page.locator('tql-navbar-logo').waitFor({ state: 'visible', timeout: TIMEOUT.APP_BOOT });
  }
}
```

### API scenario (BDD) — WebSocket (typical)

Most business APIs flow over WebSocket. Use the worker-scoped `wsClient` fixture and add a per-resource client extending the pattern in [api/clients/OrganizationClient.js](api/clients/OrganizationClient.js).

```js
// api/clients/MyResourceClient.js
export class MyResourceClient {
  constructor(wsClient) { this.ws = wsClient; }
  getThing(args)  { return this.ws.call('GetThing', args); }
}
```

```js
// api/steps/my-resource.steps.js
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/api.fixtures.js';
import { MyResourceClient } from '../clients/MyResourceClient.js';

const { When, Then } = createBdd(test);

When('I request GetThing with {string}', async ({ wsClient, apiState }, id) => {
  const client = new MyResourceClient(wsClient);
  const start = Date.now();
  apiState.body = await client.getThing({ id });
  apiState.durationMs = Date.now() - start;
});

Then('the WebSocket response status should be {string}', async ({ apiState }, expected) => {
  expect(apiState.body?.status).toBe(expected);
});
```

For chained calls that depend on shared BML execution scope (e.g. `GetOrgs() + SetOrg($args)` in one message), use `wsClient.sendBml(scriptString, correlationMid)` — see [api/clients/SessionClient.js](api/clients/SessionClient.js) for the canonical example and *why* it must be one message.

### API scenario (BDD) — REST

Only used for `/fid-auth`. New REST clients extend [api/clients/BaseClient.js](api/clients/BaseClient.js).

```js
// api/clients/MyRestClient.js
import { BaseClient } from './BaseClient.js';

export class MyRestClient extends BaseClient {
  list()           { return this.get('/api/things'); }
  create(payload)  { return this.post('/api/things', payload); }
}
```

### Raw spec (Allure-rich, no BDD)

Only when BDD is awkward — e.g. UI assertions on page state without a business action.

```js
// ui/tests/dashboard.spec.js
import { test, expect } from '../fixtures/ui.spec.fixtures.js';
import { addLabel, attachScreenshot, SEVERITY, FEATURE } from '../../shared/utils/allure.js';

test('Dashboard loads', async ({ page }) => {
  addLabel({ feature: FEATURE.DASHBOARD, story: 'Initial render', severity: SEVERITY.NORMAL, owner: 'you' });
  await expect(page.locator('[data-testid="widget"]')).toHaveCount(4);
});
```

## DB Helpers

Postgres is read-only — used to derive dynamic test data (e.g. the latest measurement window in `IDotMetricValue`) and to verify side effects.

```
shared/db/
├── sql/                          # raw .sql, one query per file
│   └── latest-idot-period.sql
└── idotMetric.js                 # loads SQL, exec psql, parse, return typed shape
```

See [shared/db/README.md](shared/db/README.md) for the pattern when adding a new query.

**Hard rule:** SELECT only. Never UPDATE/DELETE/TRUNCATE/DROP from test helpers. If a test needs to mutate state, do it via an API call.

## Configuration

All sensitive values (URLs, credentials, DB connection) are loaded from environment variables — **nothing is hardcoded in source**.

```bash
cp .env.example .env       # fill in real values for your environment
```

`.env` is gitignored. See [.env.example](.env.example) for the full list of variables and inline documentation.

| Variable                        | Required for                | Notes |
|---------------------------------|-----------------------------|-------|
| `TEST_ENV`                      | selecting environment       | `local` (default) or `dev` |
| `LOCAL_BASE_URL`                | local (optional)            | defaults to `http://localhost:8080` |
| `DEV_BASE_URL`                  | `TEST_ENV=dev`              | URL of the shared remote BE |
| `USER_USERNAME` / `USER_PASSWORD` | local                     | standard user on local |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | local                   | admin user on local |
| `DEV_USER_USERNAME` / `DEV_USER_PASSWORD` | dev               | standard user on dev |
| `DEV_ADMIN_USERNAME` / `DEV_ADMIN_PASSWORD` | dev             | admin user on dev |
| `DB_URL`                        | tests that read PostgreSQL  | defaults to `postgresql://postgres@localhost:5432/app_dev_db` |
| `BROWSERS`                      | cross-browser runs          | comma-list: `chromium,firefox,webkit` |
| `BASE_URL` / `API_BASE_URL`     | override the selected env   | takes precedence over `LOCAL_BASE_URL` / `DEV_BASE_URL` |

Missing env vars produce a clear startup or first-use error (e.g. `Missing USER_USERNAME in env — required for local standard user`).

Add a new environment in [shared/config/config.js](shared/config/config.js): append to both `ENVIRONMENTS` and `USERS_BY_ENV`, then add the corresponding entries to `.env.example`.

`APP_PATH` (`/fid-ui/ctx/index.html`) and `TIMEOUT.APP_BOOT` (30s) are exposed for Page Object deep-linking and Angular cold-boot waits.

## Tag Convention

Every scenario must carry:

- **Layer:** `@ui` or `@api`
- **Ticket:** `@<JIRA-KEY>` — exactly one per scenario
- **Scope:** `@smoke` (critical happy path) or `@regression` (broader coverage)
- **Auth (UI only):** `@auth` for login-flow tests that need a clean anonymous context
- **Status (optional):** `@wip` (excluded from CI), `@skip` (must include TODO + reason)

## Allure Labels Reference

### Severity

| Constant            | Value     | When to use                  |
|---------------------|-----------|------------------------------|
| `SEVERITY.BLOCKER`  | blocker   | App unusable without this    |
| `SEVERITY.CRITICAL` | critical  | Core business flow           |
| `SEVERITY.NORMAL`   | normal    | Standard functionality       |
| `SEVERITY.MINOR`    | minor     | Edge cases                   |
| `SEVERITY.TRIVIAL`  | trivial   | Low priority / cosmetic      |

### Feature

| Constant             | Value          |
|----------------------|----------------|
| `FEATURE.AUTH`       | Authentication |
| `FEATURE.NAVIGATION` | Navigation     |
| `FEATURE.DASHBOARD`  | Dashboard      |

Add new features to [shared/utils/allure.js](shared/utils/allure.js) as the suite grows.

## Conventions (short)

- **Locator priority:** `data-testid` > `getByRole` / `getByLabel` / `getByText` > semantic CSS > XPath (last resort, commented).
- **Wait:** web-first assertions only (`expect(locator).toBeVisible()`, `expect.poll(...)`). **Never** `page.waitForTimeout()`.
- **Test data:** unique per test (`randomString()` in [shared/utils/helpers.js](shared/utils/helpers.js)); for shared static expectations use `shared/data/expectationData/*.json`.
- **No cross-imports:** `ui/` never imports `api/` and vice versa. Anything shared goes in `shared/`.
- **DB SELECT only.**

See [CLAUDE.md](CLAUDE.md) for the full convention reference and project-specific FID protocol notes.
