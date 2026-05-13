# CLAUDE.md — playwright-automation

Workspace context cho Claude Code. Luôn load vào context — giữ ngắn, mọi rule phải có lý do.

## Vai trò & mục tiêu

- **User**: Senior QA Automation Engineer (5+ năm), làm việc solo trên repo này.
- **Mục tiêu #1**: Tăng tốc automate ticket mới — từ Jira AC → `.feature` + steps + page/client trong **một phiên**.
- **Phụ**: Giảm flaky, chuẩn hóa convention (wait/locator/handshake), Claude lo log + DB + report khi debug.

## Stack

- **Test framework**: `@playwright/test` + `playwright-bdd` (Cucumber BDD trên Playwright).
- **Ngôn ngữ**: JavaScript (ESM, `"type": "module"`).
- **Transports**:
  - **REST**: chỉ dùng cho `POST /fid-auth`. Client extend [api/clients/BaseClient.js](api/clients/BaseClient.js).
  - **WebSocket** (chủ đạo): `ws://<host>/fid-<fid>`, FID `Async:` BML protocol — xem [api/clients/WsClient.js](api/clients/WsClient.js). Mọi business API qua WS.
- **UI**: Page Object Model, mọi page extend [ui/pages/BasePage.js](ui/pages/BasePage.js).
- **DB**: PostgreSQL **read-only** qua `psql`. SQL files tách riêng trong [shared/db/sql/](shared/db/sql/).
- **Report**: Allure + Playwright HTML. Archive theo ticket: `npm run report:archive -- <KEY>`.
- **Browsers**: Chromium default; Firefox + WebKit qua `BROWSERS=...`.
- **Backend target**: Atomiton FID stack — `local` env (`backend-container` trên `localhost:8080`, deploy bằng `docker-compose`) hoặc `dev` env (`$DEV_BASE_URL`, shared remote BE). Switch qua `TEST_ENV=local|dev`. Credentials auto-switch theo env (xem `USERS_BY_ENV` trong [shared/config/config.js](shared/config/config.js)).
- **CI**: Jenkins. Git hosting: GitHub. **Solo** → commit thẳng `main`.

## Layout

UI và API độc lập — no cross-imports. Logic dùng chung → `shared/`.

```
ui/
  features/      # @ui + @<KEY>; @auth chỉ cho login-flow scenarios
  steps/
  pages/         # BasePage + concrete pages; SELECTORS const ở đầu file
  fixtures/
    ui.fixtures.js       # workerAuthedPage (1 login/worker), page override, loginPage
    ui.spec.fixtures.js  # raw spec (Allure-labelled)
  tests/         # raw *.spec.js, giữ tối thiểu — ưu tiên BDD

api/
  features/      # @api + @<KEY>
  steps/
  clients/
    BaseClient.js          # REST
    AuthClient.js          # REST POST /fid-auth
    WsClient.js            # WS BML "Async:" + sendBml() cho atomic scripts
    SessionClient.js       # bắt buộc handshake: GetOrgs+SetOrg trong MỘT script
    OrganizationClient.js  # WS GetSchemeBasedOrganization
    MetricsClient.js       # WS GetNodeIDotMetric
  fixtures/api.fixtures.js # authClient, authToken, apiState (test-scoped) +
                           # wsClient, wsSession (worker-scoped)

shared/
  config/config.js         # BASE_URL, API_BASE_URL, APP_PATH, TIMEOUT, USERS
  data/
    expectationData/       # *.json — assertions value list (per ticket README)
    users.json, loginData.js
  utils/                   # helpers (randomString, logger), allure (labels)
  db/
    sql/                   # *.sql — one query per file, copy-paste vào psql để debug
    *.js                   # wrappers: readFileSync(SQL) + execFile psql + parse

scripts/
  archive-report.mjs       # npm run report:archive -- <TICKET>

.claude/
  agents/                  # ticket-analyzer, test-author, flaky-doctor, be-deployer
  commands/                # /automate-api-ticket-playwright, /automate-ui-ticket-playwright
```

## Projects trong `playwright.config.js`

| Project           | Tag filter   | Browser     | Note |
|-------------------|--------------|-------------|------|
| `ui`              | NOT `@auth`  | Chromium    | mặc định; reuse `workerAuthedPage` |
| `ui-auth`         | `@auth`      | Chromium    | fresh anonymous context, login-flow tests |
| `api`             | —            | (headless)  | HTTP + WebSocket |
| `ui-spec`         | —            | Chromium    | raw `ui/tests/*.spec.js` |
| `ui-*` / `ui-auth-*` | (same)    | Firefox / WebKit | thêm khi `BROWSERS=firefox,webkit` |

```bash
npm run test:ui          # Chromium UI (ui + ui-auth)
npm run test:api         # API + WS
npm run test:spec        # raw specs
npm run test:ui:firefox  # Firefox only
npm run test:ui:all      # cross-browser
npm test -- --grep "@CT-14315"
```

## FID protocol — must-know

### REST `/fid-auth`
- Wrapper bắt buộc: `{ login: { email, password } }` — KHÔNG phải `{ username, password }` flat.
- Success path: `body.login.status === "Success"` + `{uid, fid, session}`. Failure cũng trả HTTP 200 với `body.login.status === "Error"` → **luôn assert trên `login.status`**, không phải HTTP status.
- `session` = bearer cho REST tiếp theo. `fid` = embed vào WS URL: `ws://<host>/fid-<fid>`.

### WebSocket `Async:` BML
- Wire format: leading `#` + YAML `Async: <ApiName>: <args>`. JSON-only envelope bị một số action reject. Logic trong [api/clients/WsClient.js](api/clients/WsClient.js#L49).
- Response correlated by echoed `mid` (UUID). `{"Status":"Async"}` là ack — bỏ qua.
- **Atomic scripts**: nếu nhiều API phải chia sẻ scope thực thi (vd `GetOrgs() + SetOrg($args)` để populate `$F.AFI-LOCAL`), gửi MỘT BML script qua `wsClient.sendBml(script, mid)` — KHÔNG tách thành 2 `Async:` messages. Tách = BE trả Success nhưng state rỗng, mọi API sau 500.

### Required handshake (đã có sẵn trong `wsClient` fixture)
1. REST login → lấy `fid` + `session`.
2. WS connect tới `ws://<host>/fid-<fid>`.
3. Gửi BML script `GetOrgs().Orgs.getFirst() + SetOrg($args)` (xem [SessionClient.js](api/clients/SessionClient.js)).

→ Tests **không cần làm lại** — `wsClient` worker-scoped fixture đã handle. Chỉ dùng `wsClient.call('<ApiName>', args)` trong steps.

## HARD RULES — tuyệt đối không

1. **Không** `git push` / `git push --force` — kể cả solo.
2. **Không** `DROP`, `DELETE`, `UPDATE` lên DB từ test helpers. SELECT only.
3. **Không** chỉnh sửa `.env` / `.env.*` / secrets. Đọc OK, ghi KHÔNG.
4. **Không** commit khi không được yêu cầu rõ ràng.
5. **Không** tách BML handshake thành 2 messages riêng (xem trên).

## Working agreement

- **Response language**: match user (VI in → VI out, EN in → EN out). Code/log giữ EN.
- **Verbosity**: vừa phải. Giải thích trade-off khi quyết định không hiển nhiên.
- **End-of-turn**: bullet list file đã đổi (markdown link `[file](path#Lxx)`) + 1 dòng "next step". Không recap diff.
- **Code lạ / critical**: dùng Explore agent hoặc hỏi trước khi sửa. Test code phụ → refactor tự do.
- **Auto-run test**: KHÔNG. Chỉ chạy khi user yêu cầu (hoặc invoke slash command). Fail → đọc `allure-results/` + `test-results/`, fix ≤ **2 lần structural** rồi báo.

## Convention bắt buộc

### Locator (UI) — thứ tự ưu tiên

1. `data-testid` — preferred. Nếu thiếu trên element critical, flag cho FE thêm.
2. `getByRole` / `getByLabel` / `getByText`.
3. Semantic CSS (class meaningful, không phải hash).
4. XPath — last resort + comment lý do.

→ Locator XPath dài / brittle trong code cũ: **refactor ngay**, không TODO.

### Wait — chuẩn hóa

- **Bắt buộc**: web-first assertion (`expect(locator).toBeVisible()`, `toHaveURL()`, `toHaveText()`).
- **Polling**: `expect.poll(...)` hoặc `expect.toPass()`.
- **Cấm**: `page.waitForTimeout(...)`, raw `setTimeout`. `wait()` từ helpers chỉ làm last-resort, mỗi lần dùng phải comment lý do.
- **Cold-boot Angular**: dùng `TIMEOUT.APP_BOOT` (30s) khi `page.goto` rồi đợi shell render (`tql-navbar-logo` visible).

### Navigation (UI)

Deep-link bằng `${BASE_URL}${APP_PATH}#/<route>` thay vì hover-and-click sidebar — resilient hơn trên Firefox/WebKit (hover-to-expand hay race sau vài reload).

### Test data & isolation

- **Worker-scoped auth**: `wsClient` (API) và `workerAuthedPage` (UI) — không relogin per scenario.
- **Static expectations**: `shared/data/expectationData/*.json` (list of variableName, ...). README per file giải thích nguồn dữ liệu.
- **Dynamic data**: derive at runtime (vd `getLatestIDotPeriod()` từ DB cho time window). **Không** hardcode dates/IDs có thể đổi.
- **DB SELECT only** — file SQL trong `shared/db/sql/`, JS wrapper load + parse.

### Tags

- Layer: `@ui` / `@api`
- Ticket: `@<KEY>` (bắt buộc đúng 1 per scenario)
- Scope: `@smoke`, `@regression`
- Auth (UI only): `@auth` cho login flow tests — fresh anonymous context
- Status: `@wip` (skip CI), `@skip` (PHẢI có TODO + ticket fix)

### Naming

- Feature: `<JIRA-KEY>-<slug>.feature` → `CT-14315-get-node-idot-metric.feature`.
- Scenario: business action — `Successful login...`, `GetNodeIDotMetric returns NodeData...`.
- Step: declarative (`I request GetNodeIDotMetric with...`), imperative khi cần precise interaction sequence.
- Page method = user intent (`open()`, `waitForChart()`, `getActiveSortField()`), không phải UI primitive.

### Scenario Outline mặc định

Mọi scenario có input → dùng `Scenario Outline + Examples`, kể cả 1 row. Inputs swappable trong Examples table, không touch step logic.

### API verify checklist (≥ 3/4)

- Response status (`body.<key>.status === "Success"` cho FID, không phải HTTP status).
- Schema / shape — required fields present, types đúng.
- Business field giá trị thật (id, count, NodeData numeric, ...).
- Response time SLA (`< Nms`).

## Anti-patterns — block / warn

- `console.log` rác trong test/step (giữ `logger.*` ở utils).
- `try/catch` nuốt error → fail loud.
- `test.skip()` không TODO + ticket.
- Test phụ thuộc thứ tự chạy.
- `page.waitForTimeout()`, raw `setTimeout`.
- XPath > 3 levels hoặc `[index]` selectors.
- Hardcode credentials, prod URLs, tokens.
- **Tách BML handshake thành 2 messages riêng** — phải dùng `wsClient.sendBml(...)`.
- Assert `response.status() === 200` trên endpoint FID (cả success và error đều 200) — assert trên `body.<key>.status`.

## Workflow chính

### Khi nhận ticket Jira mới

1. **Analyze**: `mcp__jira__jira_get_issue` → AC numbered + edge case. Spec từ Confluence nếu có.
2. **Decide layer**: UI / API / cả hai. API: REST hay WS? (Mặc định WS trừ `/fid-auth`).
3. **Plan files**: `features/`, `steps/`, `pages/` hoặc `clients/`, `shared/db/sql/` nếu cần DB.
4. **Implement**: feature draft → step skeleton → page/client method → seed/expectation data. Reuse step text + client method có sẵn.
5. **Run on demand**: `npm run test:ui|test:api -- --grep "@<KEY>"`. Fail → diagnose ≤ 2 lần.
6. **Update Jira**: chỉ khi user OK — comment path + transition status qua MCP.

### Khi flaky

1. Root cause: race / locator / data / network / env / handshake-split.
2. **Race** → web-first assertion / `expect.poll`. Never `waitForTimeout`.
3. **Locator** → testid > role > semantic CSS.
4. **Data** → check `wsClient`/`workerAuthedPage` reuse, DB seed.
5. **Handshake-split** (API trả 500 sau Success ở SetOrg) → ensure dùng `sendBml` không phải 2 calls.
6. 2 lần thử structural → báo cáo, mở ticket fix riêng.

### Khi debug fail

- Đọc trực tiếp `allure-results/` + `test-results/` (trace, screenshot, video).
- Cross-browser fail: check `TIMEOUT.APP_BOOT`, hover-vs-deep-link, dùng `BROWSERS=...` rerun.

### Khi deploy BE

- `docker-compose` local only. Smoke verify qua `/fid-auth`. **Không** restart production.

## Skills & agents

### Slash commands (`.claude/commands/`)

- `/automate-api-ticket-playwright <KEY>` — full cycle API ticket trong repo này (REST + WS). NOT confused với `/automate-api-ticket` (Karate skill, khác repo).
- `/automate-ui-ticket-playwright <KEY>` — full cycle UI ticket.

### Agents (`.claude/agents/`)

- **ticket-analyzer** — Jira/Confluence → AC + draft `.feature`. Read-only.
- **test-author** — `.feature` → steps + page/client, reuse aggressively.
- **flaky-doctor** — allure + trace → root cause + structural fix.
- **be-deployer** — `docker-compose` BE + smoke. Local only.

## MCP

- **Jira**: read ticket/AC/comments + write (comment, transition) — chỉ khi user OK.
- **Confluence**: read spec / design docs.
- **Bitbucket**: thường dùng cho `sustainability` (BE source) khi cần xác minh contract API.
- **Postgres**: SELECT only.

## Memory hint

Khi user nói "lần sau X" / "đừng Y" / "luôn Z" → save vào memory dạng `feedback` với **Why** + **How to apply**.
Auth contract + WS handshake atomic rule đã memo — xem [memory/project_atomiton_fid_auth.md](../../.claude/projects/-Users-vuongngo-Desktop-playwright-automation/memory/project_atomiton_fid_auth.md).
