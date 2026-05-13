# Automate UI Ticket (Playwright)

Analyze a Jira UI automation ticket and implement Playwright + Cucumber BDD UI tests for it in this `playwright-automation` repo.

**Usage:** `/automate-ui-ticket-playwright <TICKET-KEY>`

> Sister skill: `/automate-api-ticket-playwright` for API-layer tickets.

---

## Session Continuity

**At the start:** Check if `~/.claude/session-handoff.md` exists AND mentions the same ticket key (`$ARGUMENTS`). If yes, read it and resume from the last completed step.

**After each step completes:** Save progress to `~/.claude/session-handoff.md`:
```
# In Progress — implement-pw-ui-ticket $ARGUMENTS
Last completed step: <N>
Ticket: <summary>
User flow: <short description of the journey under test>
Pages involved: <LoginPage, BotsPage, ...>
Feature file: ui/features/<slug>.feature
Files to create: <list>
Key findings: <notes from Confluence / UI inspection / dev comments>
Next: <what step N+1 needs to do>
```

This ensures if context is compacted mid-task, the next session can resume from the correct step.

---

## Repo Conventions — Load Before Starting

Before doing anything, internalise the rules from these files:

1. [CLAUDE.md](../../CLAUDE.md) — locator priority, wait strategy, anti-patterns, hard rules.
2. [ui/pages/BasePage.js](../../ui/pages/BasePage.js) — extend it for new pages.
3. [ui/pages/NodeFitnessIndexPage.js](../../ui/pages/NodeFitnessIndexPage.js) — reference Page Object: deep-link nav, `waitForChart` with `expect.poll`, semantic CSS fallback when `data-testid` missing.
4. [ui/fixtures/ui.fixtures.js](../../ui/fixtures/ui.fixtures.js) — `workerAuthedPage` (one login per worker) + `page` override:
   - Non-`@auth` scenarios receive an already-authenticated `page` — **do not write login steps**.
   - Only `@auth` scenarios get a fresh anonymous context for testing login itself.
5. [shared/config/config.js](../../shared/config/config.js) — `APP_PATH` for deep-linking, `TIMEOUT.APP_BOOT` (30s) for Angular cold boot.
6. Reference patterns: [ui/features/CT-14684-node-fitness-index.feature](../../ui/features/CT-14684-node-fitness-index.feature) + [ui/steps/node-fitness-index.steps.js](../../ui/steps/node-fitness-index.steps.js).

**Reminder of hard rules (CLAUDE.md):** Never push to remote, never DROP/DELETE PostgreSQL, never edit `.env`, only commit when explicitly asked.

---

## Execution Plan

### Step 1 — Fetch Jira Ticket

Use `mcp__jira__jira_get_issue` to get full details of `$ARGUMENTS`:
- Summary, description, acceptance criteria
- Linked issues, epics (especially design specs in Confluence)
- Comments — particularly screenshots, dev notes about component names, data-testid attributes
- Attachments (mockups, design files)
- Labels and components

Extract from the ticket:
- **User flow** — the sequence of actions the user takes
- **Pages / screens** involved (existing or new)
- **Pre-conditions** — login state, data setup needed
- **Expected outcomes** — visible elements, URL changes, side effects
- **Edge cases** — error states, validation messages, empty states

---

### Step 2 — Understand the UI

Two sources, in order:

1. **Confluence design specs:**
   - `mcp__jira__confluence_search` with the feature/module name
   - `mcp__jira__confluence_get_page` on hits — read interaction specs, error states, copy

2. **Inspect the live UI** (only if BE running locally):
   - For `local`: confirm `localhost:8080` is up (`docker ps | grep backend-container`). For `dev`: confirm `$DEV_BASE_URL` is reachable (no docker check needed — it's shared remote BE).
   - Navigate to the relevant page manually OR ask user to share a screenshot of the page + DevTools Elements panel.
   - Identify selectors in priority order (CLAUDE.md):
     1. `data-testid` — preferred; if missing, flag for dev team to add
     2. `getByRole` / `getByLabel` / `getByText`
     3. Semantic CSS class (not hash-generated)
     4. XPath — last resort, with comment justifying

3. **Frontend source (optional, for component/test-id confirmation):**
   - `mcp__bitbucket__search_code` on the frontend repo for the component name
   - Look for Angular `[attr.data-testid]` / React `data-testid={}` bindings

---

### Step 3 — Map Repo Conventions to the Ticket

Locate similar existing UI features and pages for pattern matching:

1. `ls ui/features/` — list existing UI features
2. `ls ui/pages/` — see which Page Objects already exist
3. Read 1-2 closest existing feature files + their step files to mirror Gherkin style and step phrasing.
4. Read the corresponding Page Object to mirror locator + method conventions.
5. Decide:
   - **Reuse existing Page Object** (add methods) or **create new one** (`<Name>Page extends BasePage`)
   - **Reuse existing steps** (grep `ui/steps/` for the action phrase) or **add new ones**
   - **Reuse `loginPage` fixture** for auth precondition (already wired in [ui/fixtures/ui.fixtures.js](../../ui/fixtures/ui.fixtures.js))

---

### Step 4 — Query Database (only if needed)

Most UI tests don't need direct DB access — they verify what the user sees. Skip unless:
- The ticket requires data to exist (a specific BOT, organisation, etc.) before the user can interact
- Cleanup of UI-created entities is needed in `afterAll`

Connection: `psql postgresql://postgres@localhost:5432/app_dev_db -c "SELECT ..."` — read-only SELECT only. **Never** UPDATE/DELETE/DROP (hard rule).

> Prefer setup via API call (`AuthClient` + a resource client) over raw SQL when possible — it exercises real BE behaviour and survives schema changes better.

---

### Step 5 — Plan the Test Implementation

**Files to create (typical):**

| Path | When |
|---|---|
| `ui/features/<JIRA-KEY>-<slug>.feature` | Always |
| `ui/steps/<slug>.steps.js` | If new step phrasings are introduced |
| `ui/pages/<Name>Page.js` | If interacting with a page not yet modelled |
| `shared/data/<slug>.input.json` | If parameterised test data benefits from externalisation |

**Scenarios to implement** (minimum):
1. Happy path — user completes the flow successfully, expected outcomes visible
2. Validation / error case — invalid input produces the expected error UI
3. Edge case derived from AC (empty state, permission boundary, etc.)

---

### Step 6 — Implement / Extend the Page Object

Create or extend `ui/pages/<Name>Page.js`:

```js
import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { APP_PATH, BASE_URL, TIMEOUT } from '../../shared/config/config.js';

// Selector priority: data-testid > role/label/text > semantic CSS > XPath (last, commented).
const SELECTORS = {
  heading:     '[data-testid="bots-heading"]',
  searchInput: '[data-testid="bots-search"]',
  rowByName:   (name) => `[data-testid="bot-row"]:has-text("${name}")`,
};

const BOTS_PATH = `${APP_PATH}#/dashboards/system-models/bots`;

export class BotsPage extends BasePage {
  /** Direct deep-link navigation; relies on workerAuthedPage so no login needed. */
  async open() {
    await this.navigate(`${BASE_URL}${BOTS_PATH}`);
    // Wait for the app shell — Angular cold boot can exceed NAVIGATION timeout.
    await this.page.locator('tql-navbar-logo').waitFor({ state: 'visible', timeout: TIMEOUT.APP_BOOT });
  }

  async isLoaded() {
    await this.waitForVisible(SELECTORS.heading);
  }

  async search(query) { await this.fill(SELECTORS.searchInput, query); }
  async openBot(name) { await this.click(SELECTORS.rowByName(name)); }
}
```

Rules:
- **Deep-link, not hover-and-click sidebar.** Hover-to-expand sidebar races on Firefox/WebKit after several reloads. Build the URL from `APP_PATH` + the SPA route fragment.
- **Use `TIMEOUT.APP_BOOT`** (30s) when waiting for the Angular shell after `page.goto`.
- **Locators in `SELECTORS` constant at the top** — never inline locator strings inside methods.
- **Method names = user actions / business intent** (`openBot`, `search`) — not UI primitives (`clickBotLink`).
- **No XPath** unless commented with justification.
- **No `page.waitForTimeout`** — use web-first assertions or `expect.poll`.
- For dynamically-loading content (heatmap, table that grows), prefer `expect.poll(() => locator.count(), { ... }).toBeGreaterThan(0)` over polling on visibility alone.

---

### Step 7 — Implement the Feature File

Write `.feature` in `ui/features/<JIRA-KEY>-<slug>.feature`:

```gherkin
@ui @<JIRA-KEY>
Feature: <Module> — <Capability under test>

  Background:
    Given I am logged in as the standard user

  @smoke
  Scenario Outline: User can <action> on the <screen>
    Given I am on the <screen> page
    When I <perform action> with "<input>"
    Then I should see <expected outcome>

    Examples:
      | input          |
      | <stable-value> |
```

Rules (from CLAUDE.md):
- **Always `Scenario Outline` + `Examples`** for scenarios with parameterisable input — even one row. Inputs swappable without touching test logic.
- **Tags:** `@ui` + `@<JIRA-KEY>` at feature level; `@smoke` or `@regression` at scenario level.
- **Declarative steps** — `When I create a BOT named "X"` (not `When I click the Create button and type "X" in the name field and click Submit`). Imperative is OK only when the precise interaction sequence matters for the test.
- **Background** holds setup shared by ALL scenarios — login, navigation to a common starting screen.
- **One behaviour per scenario** — avoid multi-`When` chains.
- **Reusable step phrasings** — grep `ui/steps/` before inventing new ones.

---

### Step 8 — Implement Step Definitions

Create or extend `ui/steps/<slug>.steps.js`:

```js
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/ui.fixtures.js';
import { BotsPage } from '../pages/BotsPage.js';

const { Given, When, Then } = createBdd(test);

// NOTE: no "I am logged in" step needed — workerAuthedPage handles auth.
// Only add explicit login steps for scenarios tagged @auth.

Given('I open the BOTs page', async ({ page }) => {
  const bots = new BotsPage(page);
  await bots.open();
  await bots.isLoaded();
});

When('I search for {string}', async ({ page }, query) => {
  const bots = new BotsPage(page);
  await bots.search(query);
});

Then('I should see a BOT named {string}', async ({ page }, name) => {
  await expect(page.locator(`[data-testid="bot-row"]`, { hasText: name })).toBeVisible();
});
```

Rules:
- **No login plumbing for non-`@auth` scenarios** — `page` is already authenticated by `workerAuthedPage`.
- **Wait via web-first assertions** — `expect(locator).toBeVisible()`, `toHaveText`, `toHaveURL`. **Never** `waitForTimeout`.
- **Instantiate Page Object inside the step** (cheap) OR add as a fixture if reused across many steps.
- **Anti-patterns to refuse:** raw `console.log`, `try{}catch{}` swallowing errors, hardcoded credentials, XPath > 3 levels, `[index]` selectors.

---

### Step 9 — Run the Tests

Per CLAUDE.md, only auto-run if user asked. Slash command invocation = implicit ask.

```bash
# Tag-filtered (most precise)
npm run test:ui -- --grep "@<JIRA-KEY>"

# Specific feature file
npx playwright test --project=ui ui/features/<JIRA-KEY>-<slug>.feature

# Watch the browser (helpful for debugging UI flow)
npm run test:headed -- --grep "@<JIRA-KEY>"

# Step-through with Inspector
npm run test:debug -- --grep "@<JIRA-KEY>"
```

**Cross-browser run (when the ticket needs cross-browser coverage):**

```bash
npm run test:ui:firefox -- --grep "@<JIRA-KEY>"
npm run test:ui:webkit  -- --grep "@<JIRA-KEY>"
npm run test:ui:all     -- --grep "@<JIRA-KEY>"      # chromium + firefox + webkit
```

**If tests fail:**
1. Read error output. Open `allure-results/` and `test-results/<test>/` — Claude is permitted to read these directly (CLAUDE.md).
2. Inspect `trace.zip` if present — instruct user `npx playwright show-trace test-results/<...>/trace.zip` (don't auto-open).
3. Classify root cause (per `.claude/agents/flaky-doctor.md`): **race / locator / data / network / env / cross-browser**.
4. Fix per CLAUDE.md:
   - **Race** → web-first assertion or `expect.poll`. Never `waitForTimeout`.
   - **Locator** → refactor to `data-testid` > role > semantic CSS.
   - **Cross-browser only** → check `TIMEOUT.APP_BOOT` headroom; replace hover-to-expand sidebar with deep-link navigation in the Page Object.
   - **Auth context lost** → check if the scenario should be `@auth` (fresh context) or non-`@auth` (worker-authed).
5. **Stop after 2 structural attempts** — report findings instead of looping.

**When all tests pass:** Remove any debug instrumentation (`console.log`, redundant `await page.pause()`) before reporting done.

---

### Step 10 — Review & Coverage Checklist

Clear `~/.claude/session-handoff.md` (task done).

Re-read implemented files, then verify against the ticket:

#### A. Functional Coverage
- [ ] Every acceptance criterion has at least one scenario
- [ ] Happy path (user completes the flow) covered
- [ ] At least one validation/error scenario if the ticket implies one
- [ ] Edge cases from ticket or dev comments covered
- [ ] Side effects asserted (URL, DOM changes, data persisted) — not just final visibility
- [ ] All scenarios pass (`npm run test:ui -- --grep "@<KEY>"` → 0 failures)
- [ ] **No hardcoded temporal/computed values** — dates, IDs derived at runtime or via fixture

#### B. Gherkin / BDD Best Practices
- [ ] Steps are **declarative business actions**, not imperative UI primitives (use imperative only when the precise click sequence is part of what's tested)
- [ ] `Given/When/Then` used correctly — Given=precondition, When=action under test, Then=outcome
- [ ] One behaviour per scenario — no multi-`When` chains
- [ ] `Background` only contains setup shared by ALL scenarios
- [ ] Step phrasings reused across scenarios — no slight wording duplicates
- [ ] Scenario names read as descriptive sentences of expected behaviour
- [ ] Tags applied: feature-level `@ui @<JIRA-KEY>`, scenario-level `@smoke`/`@regression`

#### C. Scenario Outline — default pattern
- [ ] All scenarios with input parameters use `Scenario Outline` + `Examples` (even one row)

#### D. UI Quality (Playwright / CLAUDE.md)
- [ ] **Locator priority respected**: data-testid > role/label/text > semantic CSS > XPath
- [ ] No `page.waitForTimeout()`, no raw `setTimeout` — web-first assertions only
- [ ] No XPath > 3 levels deep, no `[index]` selectors
- [ ] No hardcoded credentials, URLs, tokens — all from `shared/config/config.js` or `process.env`
- [ ] Page Object methods named after user intent, not UI primitives
- [ ] Selectors centralised in `SELECTORS` constant at top of Page Object
- [ ] If `data-testid` was missing on a critical element, flagged for dev team in notes

#### E. Repo-specific
- [ ] Imports from correct paths — `../fixtures/ui.fixtures.js`, `../../shared/config/config.js`, `../pages/<Name>Page.js`
- [ ] New Page Object (if any) extends `BasePage`
- [ ] No cross-imports from `api/` (hard rule in CLAUDE.md)
- [ ] Anti-patterns absent: `console.log` rác, `try/catch` swallowing errors, `test.skip` without TODO + reason

If any item is not ticked, refactor before reporting done.

---

### Step 11 — Jira Comment Draft

Display this comment for the user to post manually after the PR is merged. **Do not auto-post** — Jira write actions need user confirmation per CLAUDE.md.

```
h2. ✅ Automated UI Test Implementation Complete

*Test Suite:* ui/features/<JIRA-KEY>-<slug>.feature
*Framework:* Playwright + Cucumber BDD (playwright-bdd)
*Browser:* Chromium
*Environment validated:* local

----

h3. Scenarios Automated

|| # || Scenario || Covers ||
| 1 | <scenario name> | <which AC or requirement> |
| 2 | <scenario name> | <which AC or requirement> |
| 3 | <scenario name> | <edge case description> |

h3. Files Added / Modified

* {{ui/features/<JIRA-KEY>-<slug>.feature}}
* {{ui/steps/<slug>.steps.js}}
* {{ui/pages/<Name>Page.js}}             _(if created)_
* {{shared/data/<slug>.input.json}}      _(if created)_

h3. Run Command

{code:bash}
npm run test:ui -- --grep "@<JIRA-KEY>"
{code}

h3. Test Results

*X passed / 0 failed*

h3. Notes

<important findings — missing data-testid attributes flagged for dev, assumptions, known limitations>
```

> Ask the user whether to post + transition the ticket via `mcp__jira__jira_add_comment` + `mcp__jira__jira_transition_issue`. Do not act without confirmation.
