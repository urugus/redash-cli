---
name: redash-cli-setup
description: Set up the redash-cli repository or CLI from a fresh checkout or clean machine. Use this for checking Node.js and pnpm versions, installing dependencies, building, linking the local binary, configuring Redash profiles, and verifying the CLI works.
---

# redash-cli Setup

## Scope

Use this skill when the user wants to get redash-cli installed, built, linked, or configured for the first time.

Do not use this skill for implementation or release work; use `redash-cli-dev` instead. Do not use it for routine command guidance after setup; use `redash-cli-usage` instead.

## Prerequisites

- Require Node.js 20 or newer.
- Require pnpm 10.33.0 or newer for local development.
- Require macOS Keychain access when storing Redash API keys.
- Require a Redash API key only for profile configuration and live authentication checks.

Check versions:

```sh
node --version
pnpm --version
```

## Local Repository Setup

From the repository root:

```sh
pnpm install
pnpm build
node dist/index.js --help
```

If the user wants a local global `redash` command for development:

```sh
pnpm link --global
redash --help
```

Use `pnpm check` after setup when the user wants confidence that the checkout is healthy. It runs formatting checks, linting, tests, and TypeScript checks.

## Published Package Setup

If the user wants to install the published CLI instead of working from source:

```sh
npm install --global @urugus/redash-cli
redash --help
```

With pnpm:

```sh
pnpm add --global @urugus/redash-cli
redash --help
```

## Redash Profile Setup

Only configure a profile when the user has a Redash URL and API key.

```sh
redash config set --profile default --url https://redash.example.com
redash config list
redash config use default
redash auth test
```

Notes:

- The config file is stored at `~/.config/redash-cli/config.json`.
- API keys are stored separately in macOS Keychain under the `redash-cli` service.
- Do not ask the user to paste API keys into chat.
- Do not print or commit API keys.
- If authentication fails, verify the Redash URL, API key, permissions, and network access before changing code.

## Troubleshooting

- If `redash` is not found after `pnpm link --global`, inspect pnpm's global bin setup and PATH rather than changing package code.
- If `node dist/index.js --help` fails, run `pnpm build` again and inspect TypeScript or packaging errors.
- If dependency installation fails because of network or registry access, report the environment issue clearly.
- If Keychain access fails, distinguish macOS permission problems from application bugs.
