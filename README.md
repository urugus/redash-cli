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

## Development

```sh
pnpm test
pnpm lint
pnpm check
pnpm format
```

Build output is written to `dist/`.

## Notes

- Supported output formats are `json` and `csv`.
- Query execution uses Redash's `/api/query_results` endpoint and polls asynchronous jobs until completion.
- Redash URLs must start with `http://` or `https://`.
