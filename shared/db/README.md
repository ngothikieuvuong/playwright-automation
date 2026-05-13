# shared/db

PostgreSQL helpers used by tests to read state from the local BE database.

## Layout

```
shared/db/
├── sql/                    ← raw .sql files, one query per file
│   └── latest-idot-period.sql
├── idotMetric.js           ← JS wrappers (load .sql, exec via psql, parse)
└── README.md
```

## Why a `sql/` folder

- Syntax-highlight + lint in any editor / IDE.
- Copy-paste straight into `psql` to debug — no JS template-string escaping.
- Diff cleanly when a query changes (no noise from JS quotes / `||` concat).
- Tests reference queries by file name, so renaming or refactoring is local.

## Adding a new query

1. Drop the SQL in `sql/<kebab-case-name>.sql`. Keep one query per file. Add a
   `-- ` comment at the top with intent + which test uses it.
2. Create or extend a JS wrapper (e.g. `shared/db/topology.js`) that:
   - Loads the SQL with `readFileSync(new URL('./sql/<name>.sql', import.meta.url), 'utf8')`
   - Calls `psql` with `-At` (tuples-only, unaligned) for machine-parseable output
   - Parses + returns a typed shape
3. **Hard rule (CLAUDE.md)**: SELECT only. Never UPDATE / DELETE / DROP / TRUNCATE
   from test helpers. If a test needs to mutate state, use an API call instead.

## Connection string

Defaults to `postgresql://postgres@localhost:5432/app_dev_db`.
Override per-run via `DB_URL=…` env var.
