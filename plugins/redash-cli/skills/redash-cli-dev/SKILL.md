---
name: redash-cli-dev
description: Work in the redash-cli repository on implementation, tests, README changes, package metadata, or release preparation. Use this for repo-scoped development tasks that need pnpm checks, TypeScript CLI conventions, macOS Keychain awareness, or npm release rules.
---

# redash-cli Development

## Scope

Use this skill for source changes, tests, documentation updates, package metadata, and release preparation in this repository.

Do not use it for ordinary CLI usage after installation; use `redash-cli-usage` instead. Do not use it for first-time machine setup; use `redash-cli-setup` instead.

## Repository Rules

- Think in English and reply to the user in Japanese unless they explicitly ask for another language.
- Treat this as a Node.js 20+ TypeScript CLI package managed with pnpm 10.33.0 or newer.
- Prefer existing source, test, and command patterns over introducing new abstractions.
- Keep CLI behavior, command names, arguments, config format, and output format stable unless the requested change explicitly requires a breaking change.
- Preserve existing user changes in the working tree.
- Avoid broad cleanup or generated-file churn unless it is necessary for the requested task.

## Checks

- Use `pnpm check` as the main preflight because it runs formatting checks, linting, tests, and TypeScript checks.
- Use narrower checks while iterating:
  - `pnpm test`
  - `pnpm lint`
  - `pnpm build`
  - `pnpm exec vitest run <test-file>`
- If Keychain-backed behavior cannot be verified because of OS, permission, or sandbox limits, state the limitation clearly.

## Documentation

- Keep README command examples aligned with actual CLI commands and package metadata.
- The published npm package name is `@urugus/redash-cli`.
- The installed binary name is `redash`.
- Separate published package installation from local development setup:
  - Published package: `npm install --global @urugus/redash-cli`
  - Local development: `pnpm install`, then `pnpm build`

## Release Management

- Keep `package.json` version, Git release tag, and npm package version aligned one-to-one.
- Use SemVer:
  - `patch` for bug fixes.
  - `minor` for backward-compatible CLI features.
  - `major` for breaking CLI behavior, command names, arguments, config format, or output format changes.
- Do not edit `package.json` version manually for releases.
- Use the package scripts:
  - `pnpm release:patch`
  - `pnpm release:minor`
  - `pnpm release:major`
  - `pnpm release:beta`
- Before creating a release, run `pnpm release:check`.
- Do not create release tags manually unless recovering from a specific problem. `npm version` should create the version commit and `vX.Y.Z` tag.
- Do not run `npm publish` manually unless recovering from a specific problem.
- Before pushing release tags, verify the generated `vX.Y.Z` tag and ensure there are no unrelated local tags that would be pushed.
- Normal release order:
  1. `pnpm release:patch` or the appropriate SemVer release script.
  2. `git push origin main --tags`
- Beta release order:
  1. `pnpm release:beta`
  2. `git push origin main --tags`
- If a release command changes `package.json` or `pnpm-lock.yaml`, preserve those changes and include them in the release commit.

## Safety

- Do not publish unbuilt or unverified packages.
- Do not expose Redash API keys or macOS Keychain contents.
