# AGENTS.md

## Communication

- Think in English and reply to the user in Japanese, unless the user explicitly asks for another language.

## CLI Command Changes

- When adding or changing CLI commands, update the relevant documentation and agent skills in the same change.
  - Keep `README.md` command examples aligned with the actual CLI behavior.
  - Update the relevant files under `plugins/redash-cli/skills/`, especially `redash-cli-usage`, when user-facing command usage changes.

## Release Management

- Keep `package.json` version, Git release tag, and npm package version aligned one-to-one.
- Use SemVer for all releases:
  - `patch` for bug fixes.
  - `minor` for backward-compatible CLI features.
  - `major` for breaking CLI behavior, command names, arguments, config format, or output format changes.
- Use `npm version` through the package scripts instead of manually editing the version field:
  - `pnpm release:patch`
  - `pnpm release:minor`
  - `pnpm release:major`
  - `pnpm release:beta`
- Before creating a release, run:

```sh
pnpm release:check
```

- Pushing a `vX.Y.Z` tag runs the release workflow and publishes to npm automatically.
  - Normal versions publish with the `latest` npm dist-tag.
  - Prerelease versions publish with the `beta` npm dist-tag.
- For a normal release, use this order:

```sh
pnpm release:patch
git push origin main --tags
```

- For a beta release, use this order:

```sh
pnpm release:beta
git push origin main --tags
```

- Do not create release tags by hand unless there is a specific recovery need. `npm version` should create the version commit and `vX.Y.Z` tag.
- Do not run `npm publish` by hand unless there is a specific recovery need.
- Do not publish unbuilt or unverified packages. The package should publish only the built `dist` output plus required metadata.
- If a release command changes `package.json` or `pnpm-lock.yaml`, preserve those changes and include them in the release commit.
