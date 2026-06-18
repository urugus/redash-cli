---
name: redash-cli-usage
description: Help someone use the installed redash CLI. Use this for configuring profiles, checking authentication, listing data sources or dashboards, checking admin query queue status, inviting users, running SQL, exporting JSON or CSV, explaining PostgreSQL query plans, and choosing safe command examples.
---

# redash-cli Usage

## Scope

Use this skill after the CLI is installed and the user wants help running `redash` commands.

Do not use it for repository implementation or release changes; use `redash-cli-dev` instead. Do not use it for fresh machine or checkout setup; use `redash-cli-setup` instead.

## Core Principles

- Help the user run the installed `redash` command, not modify the repository.
- Ask for missing Redash-specific values only when required: profile name, Redash URL, data source ID, dashboard slug, email address, or SQL.
- Never ask the user to paste an API key into chat. The CLI prompts for it during `redash config set`.
- Do not print, store, or commit API keys.
- Prefer commands that are explicit about `--profile` when the user mentions multiple environments.

## Profile And Authentication

Create or update a profile:

```sh
redash config set --profile default --url https://redash.example.com
```

List profiles:

```sh
redash config list
```

Set the default profile:

```sh
redash config use default
```

Test authentication:

```sh
redash auth test
```

Use a specific profile:

```sh
redash auth test --profile staging
```

Notes:

- Profile metadata is stored at `~/.config/redash-cli/config.json`.
- API keys are stored in macOS Keychain under the `redash-cli` service.
- If authentication fails, check the Redash URL, API key, network access, and whether the key has the required Redash permissions.

## Discovery Commands

List data sources before running queries:

```sh
redash data-sources list
```

List dashboards:

```sh
redash dashboards list
```

Use paging and sort order when the user needs more control:

```sh
redash dashboards list --page 1 --page-size 20 --order=-created_at
```

Get a dashboard by slug:

```sh
redash dashboards get sales-overview
```

Warn that dashboard slugs can change when dashboards are renamed in Redash.

## Admin Commands

Show Redash query queue and worker status:

```sh
redash admin queue-status
```

Use a non-default profile:

```sh
redash admin queue-status --profile staging
```

Guidance:

- `admin queue-status` fetches the Redash admin query queue status and prints JSON.
- It requires a super admin API key.
- Use it when the user wants the CLI equivalent of the Redash admin query tasks page.
- If it returns HTTP 403, check whether the selected profile uses a super admin API key.

## Query Commands

Before running user-provided SQL:

- Treat broad scans, joins across large tables, missing date filters, missing `LIMIT`, `SELECT *`, and aggregation over unknown ranges as potentially heavy.
- For potentially heavy queries on PostgreSQL data sources, preview the plan with `redash query explain` before suggesting `redash query run`.
- If `query explain` is unavailable for the data source, ask the user to confirm the query cost risk before running it and suggest adding restrictive filters, a date range, and `LIMIT`.
- Do not run queries that look like writes or DDL. The CLI usage workflow should prefer read-only `SELECT` or `WITH` queries.
- When the user only wants help composing SQL, provide the SQL and the explain command first; do not jump straight to execution.

Run SQL and return JSON:

```sh
redash query run --data-source-id 1 --sql "select 1 as value"
```

Run SQL and return CSV:

```sh
redash query run --data-source-id 1 --sql "select 1 as value" --format csv
```

Use a non-default profile:

```sh
redash query run --profile staging --data-source-id 1 --sql "select current_date"
```

Guidance:

- Confirm the data source ID before composing query commands.
- Use `--format csv` when the user wants spreadsheet-friendly output.
- Keep SQL examples small and read-only unless the user explicitly asks for another query and understands the effect.
- Prefer adding a narrow date range, selective predicates, and `LIMIT` to exploratory queries.
- Be careful with shell quoting. Wrap SQL in double quotes for simple examples, and mention that complex SQL may be easier to paste from a file or shell-safe quoted string if needed.

## Query Plan Preview

Preview a PostgreSQL query plan without running the query:

```sh
redash query explain --data-source-id 1 --sql "select * from invoices"
```

Explain the constraints:

- `query explain` supports PostgreSQL data sources only.
- It runs `EXPLAIN (FORMAT JSON)` without `ANALYZE`.
- It accepts only a single `SELECT` or `WITH` query.
- It prints a JSON object with a small summary plus the raw plan.
- Use it before executing potentially heavy PostgreSQL queries, especially when the SQL lacks selective filters or has unknown table sizes.

## User Invitations

Invite a user:

```sh
redash users invite --name "Taro Yamada" --email taro@example.com
```

Create a pending invitation without sending email:

```sh
redash users invite --name "Taro Yamada" --email taro@example.com --no-send-email
```

Warn that user invitation requires an admin API key.

## Response Style

- Reply in Japanese unless the user asks for another language.
- Give the exact command first, then short notes about required placeholders and risks.
- When a command can affect Redash state, state that plainly before suggesting execution.
- If the user reports an error, ask for the command, exit output, profile name, and whether the same API key works in the Redash UI, but do not request the API key itself.
