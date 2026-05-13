# Automate API Ticket (Playwright)

Analyze a Jira API automation ticket and implement Playwright + Cucumber BDD tests for it in this `playwright-automation` repo.

**Usage:** `/automate-api-ticket-playwright <TICKET-KEY>`

> This is the **Playwright** version. The Karate equivalent is `/automate-api-ticket` (different repo, different framework).

---

## Session Continuity

**At the start:** Check if `~/.claude/session-handoff.md` exists AND mentions the same ticket key (`$ARGUMENTS`). If yes, read it and resume from the last completed step — skip already-done steps.

**After each step completes:** Save progress to `~/.claude/session-handoff.md` in this format:
```
# In Progress — implement-pw-api-ticket $ARGUMENTS
Last completed step: <N>
Ticket: <summary>
Endpoint: <API name> (<REST|WebSocket>)
Feature file: api/features/<slug>.feature
Files to create: <list>
Key findings: <brief notes from sustainability/Confluence research>
Next: <what step N+1 needs to do>
```

This ensures if context is compacted mid-task, the next session can resume from the correct step.

---

## Repo Conventions — Load Before Starting

Before doing anything, internalise the rules from these files:

1. [CLAUDE.md](../../CLAUDE.md) — locator/wait/handshake conventions, anti-patterns, hard rules (no push, no DB mutation, no `.env` edits, no BML handshake split).
2. **REST**: [api/clients/BaseClient.js](../../api/clients/BaseClient.js) + [api/clients/AuthClient.js](../../api/clients/AuthClient.js). REST is only used for `/fid-auth`. Atomiton FID contract: payload `{login:{email,password}}`, response wrapper `{login:{status:"Success"|"Error", uid, fid, session, ...}}`. Both success and failure return HTTP 200 — always assert on `body.login.status`.
3. **WebSocket** (most business APIs): [api/clients/WsClient.js](../../api/clients/WsClient.js) implements the FID `Async:` BML protocol. Public API: `ws.call(apiName, args)` for single calls, `ws.sendBml(script, mid)` for atomic multi-call scripts.
4. [api/clients/SessionClient.js](../../api/clients/SessionClient.js) — canonical example of an atomic BML script. **CRITICAL**: `GetOrgs + SetOrg` must be one script; two `Async:` messages return Success but leave session state empty → downstream APIs 500.
5. [api/fixtures/api.fixtures.js](../../api/fixtures/api.fixtures.js) — fixtures available:
   - **Test-scoped**: `authClient`, `authToken`, `apiState` (mutable bag for passing response state between steps).
   - **Worker-scoped**: `wsClient` (one HTTP login + WS connect + SetOrg per worker, reused across scenarios), `wsSession` (info about the active org).
6. Reference patterns: [api/features/CT-14315-get-node-idot-metric.feature](../../api/features/CT-14315-get-node-idot-metric.feature) + [api/steps/get-node-idot-metric.steps.js](../../api/steps/get-node-idot-metric.steps.js) for WS; [api/features/auth.feature](../../api/features/auth.feature) for REST.

---

## Execution Plan

### Step 1 — Fetch Jira Ticket

Use `mcp__jira__jira_get_issue` to get full details of `$ARGUMENTS`:
- Summary, description, acceptance criteria
- Linked issues, epics
- Comments (especially from devs about implementation details)
- Labels and components

Extract from the ticket:
- **API name(s)** to test and **transport**: WebSocket `Async:` (default for business APIs) or REST (rare — typically only `/fid-auth`).
- **Input parameters** (for WS: args object passed to `ws.call(apiName, args)`).
- **Expected response structure**. For WS the inner body is `{mid, status, Message, <ApiName-specific fields>...}` — `status: "Success"` is the success sentinel.
- **Whether the API needs chained atomic calls** (multiple actions sharing BML scope). If yes, you must use `wsClient.sendBml(script, mid)`, not multiple `.call(...)`s.
- **Edge cases** to cover.

---

### Step 2 — Understand the Application

Search Bitbucket workspace + Confluence for the implementation:

1. Use `mcp__bitbucket__search_code` on `sustainability` repo for the endpoint/action name (look in `server/actions/`).
2. Use `mcp__bitbucket__get_file_contents` on relevant files to understand:
   - Accepted parameters
   - Response structure (top-level wrapper key, success/error shapes)
   - Auth/permission requirements (most APIs need a valid session from `/fid-auth`)
   - Business logic to validate
3. Search Confluence for documentation:
   - `mcp__jira__confluence_search` with the API/endpoint name
   - `mcp__jira__confluence_search` with the feature/module name
   - Read relevant pages with `mcp__jira__confluence_get_page`

---

### Step 3 — Map Repo Conventions to the Ticket

Locate similar existing features for pattern matching:

1. `ls api/features/` — list existing API features
2. `ls api/clients/` — see which resource clients already exist
3. Read 1-2 closest existing feature files + their step files to mirror the pattern (Gherkin style, step phrasing, assertion shape).
4. Decide:
   - **Reuse existing client** (e.g. `AuthClient`) or **create new client** (e.g. `BotsClient extends BaseClient`).
   - **Reuse existing steps** (grep `api/steps/` for the action phrase) or **add new steps**.

---

### Step 4 — Query Database (if needed)

Use only when the ticket or source code reveals that real DB values are needed (entity IDs, names) for input/expectation data.

Connection: `psql postgresql://postgres@localhost:5432/app_dev_db -c "SELECT ..."` — read-only SELECT only. **Never** UPDATE/DELETE/DROP (hard rule in CLAUDE.md).

```sql
SELECT id, name FROM <table> WHERE <condition> LIMIT 10;
```

**Output:** concrete IDs/names for `inputData` JSON, expected lists for assertions. Skip if data can be derived from source code or Confluence alone.

> ⚠️ **Dynamic data principle:** DB queries are for *understanding shape and confirming valid values exist* — not for hardcoding them. Hardcoded DB values become stale when data is refreshed. Prefer runtime derivation (Step 7).

---

### Step 5 — Plan the Test Implementation

**Files to create (typical):**

| Path | When |
|---|---|
| `api/features/<JIRA-KEY>-<slug>.feature` | Always |
| `api/steps/<slug>.steps.js` | If new step phrasings are introduced |
| `api/clients/<Resource>Client.js` | If hitting a resource without an existing client |
| `shared/data/<slug>.input.json` | If input data is complex enough to externalise |
| `api/schemas/<slug>.schema.js` | If response shape validation is required and worth formalising |

**Scenarios to implement** (minimum):
1. Happy path — valid inputs, verify success response structure
2. Validate key response fields (types, business values)
3. Edge cases derived from ticket acceptance criteria or dev comments

> ⚠️ **Dynamic data strategy — always evaluate before hardcoding:**
>
> | Data type | Preferred approach |
> |---|---|
> | Entity IDs, node IDs, session/fid | Resolve at runtime — call `AuthClient.login()` first, capture `session`/`fid`, use them in the test |
> | Date / time ranges | Derive from an earlier API response, compute bounds via helper in `shared/utils/` |
> | Reference lists | OK to inline if the list is stable system config (e.g. status enums); avoid for temporal data |
> | Counts / totals | Assert `>= N` / `> 0` (`expect(arr.length).toBeGreaterThan(0)`) rather than exact — counts grow with data |

---

### Step 6 — Implement the Feature File

Write `.feature` in `api/features/<JIRA-KEY>-<slug>.feature` following project conventions:

```gherkin
@api @<JIRA-KEY>
Feature: <Module> — <Concise capability>

  @smoke
  Scenario Outline: <ApiName> returns <result> for <variant>
    Given I am authenticated as the standard user
    When I request <ApiName> with "<param>"
    Then the response status should be 200
    And the response time should be under 2000 ms
    And the <ApiName> status should be "Success"
    And the <ApiName> result should contain a valid <resource>

    Examples:
      | param          |
      | <stable-value> |
```

Rules (from CLAUDE.md):
- **Always `Scenario Outline` + `Examples` table** for any scenario with parameterisable input — even a single row. Inputs must be swappable without touching test logic.
- **Tags:** `@api` + `@<JIRA-KEY>` at feature level; `@smoke` or `@regression` at scenario level.
- **Declarative steps:** `When I request <ApiName>` not `When I send a POST to /api/...`.
- **One behaviour per scenario** — avoid chaining multiple `When` steps.
- **Reusable step phrasings** — grep `api/steps/` before inventing new ones.

---

### Step 7 — Implement Step Definitions & Client

### WebSocket path (typical)

**New WS resource client** `api/clients/<Resource>Client.js`:

```js
// Pattern: wraps wsClient.call(...), translates domain args, parses response.
export class MyResourceClient {
  constructor(wsClient) { this.ws = wsClient; }
  getThing(args)  { return this.ws.call('GetThing', args); }
  // Atomic multi-call (rare): use sendBml when chained calls must share BML scope.
}
```

**Steps file** `api/steps/<slug>.steps.js`:

```js
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

Then('the response time should be under {int} ms', async ({ apiState }, maxMs) => {
  expect(apiState.durationMs).toBeLessThan(maxMs);
});
```

Notes:
- `wsClient` is **worker-scoped** — no need to do REST login or SetOrg in your steps. The fixture already did it once for the entire worker.
- Response shape for `wsClient.call('Foo', ...)` is `{apiName, mid, status, ...rest}` — the inner body is flattened with `apiName` included.
- For atomic multi-call needs, use `wsClient.sendBml(scriptString, correlationMid)` — returns the full envelope `{Api1:{...}, Api2:{...}}`. See [api/clients/SessionClient.js](../../api/clients/SessionClient.js).

### REST path (rare — only for `/fid-auth` and other plain endpoints)

**New REST resource client** `api/clients/<Resource>Client.js`:

```js
import { BaseClient } from './BaseClient.js';

export class MyRestClient extends BaseClient {
  list()           { return this.get('/api/things'); }
  create(payload)  { return this.post('/api/things', payload); }
}
```

**Steps file** uses `request` from Playwright via the `authClient` / new client and the `apiState` fixture. Assert on `body.<wrapper>.status` for FID-style responses, not just HTTP status.

---

### Step 8 — Run the Tests

Per CLAUDE.md: **only auto-run if the user asked**. If the slash command was invoked, the user implicitly asked — proceed.

```bash
npm run test:api -- --grep "@<JIRA-KEY>"
```

Or run a specific feature file:
```bash
npx playwright test --project=api api/features/<JIRA-KEY>-<slug>.feature
```

**If tests fail:**
1. Read the error output. Check `allure-results/` and `test-results/` for trace/screenshot if relevant.
2. Classify root cause (per `.claude/agents/flaky-doctor.md`): race / locator (N/A for API) / data / network / env.
3. For API: verify endpoint path, payload field names, response wrapper key, status assertion.
4. Atomiton stack: remember success and failure **both return HTTP 200** — always assert `body.<key>.status`, never just `response.status()`.
5. Fix and re-run. **Stop after 2 structural attempts** — report findings instead of looping.

**When all tests pass:** Remove any debug instrumentation (`console.log`, `* print`-style dumps) before proceeding.

---

### Step 9 — Review & Coverage Checklist

Clear `~/.claude/session-handoff.md` (task done).

Re-read the implemented `.feature` + `.steps.js`, then verify against the ticket:

#### A. Functional Coverage
- [ ] Every acceptance criterion has at least one scenario
- [ ] All required input parameters are exercised in `Examples`
- [ ] Happy path (valid input → success) covered
- [ ] Response structure validated (status, key business fields)
- [ ] Key business logic from ticket asserted
- [ ] Edge cases / error cases covered
- [ ] All scenarios pass (`npm run test:api -- --grep "@<KEY>"` shows 0 failures)
- [ ] **No hardcoded temporal/computed values** — dates, ranges, IDs derived at runtime

#### B. Gherkin / BDD Best Practices
- [ ] Steps are **declarative** (`When I request the overlay metric types`), not imperative (`When I send POST to /api/...`)
- [ ] `Given/When/Then` used correctly — Given=precondition, When=action, Then=assertion
- [ ] One behaviour per scenario — no multi-`When` chains
- [ ] `Background` only contains setup shared by ALL scenarios
- [ ] Step phrasings reused — no duplicate "I do X" with slight wording variation
- [ ] No magic values inline in steps — use Examples table or `shared/data/`
- [ ] Scenario names read as descriptive sentences
- [ ] Tags applied: feature-level `@api @<JIRA-KEY>`, scenario-level `@smoke`/`@regression`

#### C. Scenario Outline — default pattern
- [ ] All scenarios with input parameters use `Scenario Outline` + `Examples` (even with one row)
- [ ] Plain `Scenario` (no Outline) only when there's nothing to parameterise

#### D. Repo-specific
- [ ] Imports from correct paths — `../fixtures/api.fixtures.js`, `../../shared/config/config.js`, `../clients/<Client>.js`
- [ ] New client (if any) extends `BaseClient`
- [ ] No cross-imports from `ui/` (hard rule in CLAUDE.md)
- [ ] Anti-patterns absent: `console.log` rác, `try/catch` swallowing errors, `page.waitForTimeout` (N/A for API), `test.skip` without TODO

If any item is not ticked, refactor before reporting done.

---

### Step 10 — Jira Comment Draft

Display this comment for the user to post manually after the PR is merged. **Do not auto-post** — per CLAUDE.md, Jira write actions need user confirmation.

```
h2. ✅ Automated Test Implementation Complete

*Test Suite:* api/features/<JIRA-KEY>-<slug>.feature
*Framework:* Playwright + Cucumber BDD (playwright-bdd)
*Environment validated:* local

----

h3. Scenarios Automated

|| # || Scenario || Covers ||
| 1 | <scenario name> | <which AC or requirement> |
| 2 | <scenario name> | <which AC or requirement> |
| 3 | <scenario name> | <edge case description> |

h3. Files Added / Modified

* {{api/features/<JIRA-KEY>-<slug>.feature}}
* {{api/steps/<slug>.steps.js}}
* {{api/clients/<Resource>Client.js}}      _(if created)_
* {{shared/data/<slug>.input.json}}        _(if created)_

h3. Run Command

{code:bash}
npm run test:api -- --grep "@<JIRA-KEY>"
{code}

h3. Test Results

*X passed / 0 failed*

h3. Notes

<any important findings — undocumented behaviors, assumptions made, known limitations>
```

> Ask the user whether to post the comment + transition the ticket (e.g. `Ready for QA` → `Done`) via `mcp__jira__jira_add_comment` + `mcp__jira__jira_transition_issue`. Do not act without confirmation.
