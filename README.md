# redash-cli

A small command-line client for Redash.

This tool manages local Redash profiles, stores API keys in macOS Keychain, and runs ad-hoc SQL through the Redash API.

## Requirements

- Node.js 20 or newer
- pnpm 10.33.0 or newer
- macOS Keychain access for storing Redash API keys
- A Redash API key

## Installation

Install dependencies and build the CLI:

```sh
pnpm install
pnpm build
```

Run the built CLI directly:

```sh
node dist/index.js --help
```

Optionally link it as a global `redash` command:

```sh
pnpm link --global
redash --help
```

## Configuration

Create or update a Redash profile:

```sh
redash config set --profile default --url https://redash.example.com
```

The command prompts for a Redash API key. Profile metadata is saved to:

```text
~/.config/redash-cli/config.json
```

API keys are stored separately in macOS Keychain under the `redash-cli` service.

List configured profiles:

```sh
redash config list
```

Set the default profile:

```sh
redash config use default
```

## Commands

Test authentication for the default profile:

```sh
redash auth test
```

Test authentication for a specific profile:

```sh
redash auth test --profile staging
```

List Redash data sources:

```sh
redash data-sources list
```

List Redash dashboards:

```sh
redash dashboards list
```

List Redash dashboards with explicit paging and sort order:

```sh
redash dashboards list --page 1 --page-size 20 --order=-created_at
```

Get a Redash dashboard by slug:

```sh
redash dashboards get sales-overview
```

Invite a Redash user:

```sh
redash users invite --name "Taro Yamada" --email taro@example.com
```

Create a pending invitation without sending email:

```sh
redash users invite --name "Taro Yamada" --email taro@example.com --no-send-email
```

Run SQL and print JSON:

```sh
redash query run --data-source-id 1 --sql "select 1 as value"
```

Run SQL and print CSV:

```sh
redash query run --data-source-id 1 --sql "select 1 as value" --format csv
```

Use a non-default profile:

```sh
redash query run --profile staging --data-source-id 1 --sql "select current_date"
```

Preview a PostgreSQL query plan without running the query:

```sh
redash query explain --data-source-id 1 --sql "select * from invoices"
```

`query explain` currently supports PostgreSQL data sources only. It runs
`EXPLAIN (FORMAT JSON)` without `ANALYZE`, accepts only single `SELECT` or `WITH`
queries, and prints a JSON object containing a small summary plus the raw plan.

## Development

```sh
pnpm test
pnpm lint
pnpm check
pnpm format
```

Build output is written to `dist/`.

## Release

This package uses npm versions and Git tags as a pair:

```text
package.json version 0.1.2 <=> Git tag v0.1.2 <=> npm package @urugus/redash-cli@0.1.2
```

Before creating a release, verify the package:

```sh
pnpm release:check
```

Pushing a `vX.Y.Z` tag runs the release workflow and publishes the package to npm automatically. Normal versions publish with the `latest` dist-tag, and prerelease versions publish with the `beta` dist-tag.

For a normal release:

```sh
pnpm release:patch
git push origin main --tags
```

Use `release:minor` for compatible feature releases and `release:major` for breaking CLI changes.

For a beta release:

```sh
pnpm release:beta
git push origin main --tags
```

The scoped package is configured for public npm publishing through `publishConfig.access`.
The release workflow requires an `NPM_TOKEN` repository secret.

## Notes

- Supported output formats are `json` and `csv`.
- User invitation requires an admin API key.
- Dashboard listing uses Redash's `/api/dashboards` endpoint. When passing a descending order
  value, use `--order=-created_at` so the shell and CLI parser do not treat it as another flag.
- Dashboard slugs can change when a dashboard is renamed in Redash.
- Query execution uses Redash's `/api/query_results` endpoint and polls asynchronous jobs until completion.
- Query explain uses PostgreSQL `EXPLAIN (FORMAT JSON)` and does not execute `EXPLAIN ANALYZE`.
- Redash URLs must start with `http://` or `https://`.
