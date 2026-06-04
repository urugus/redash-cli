# AGENTS.md

## Communication

- Think in English and reply to the user in Japanese, unless the user explicitly asks for another language.

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
- Before publishing, run:

```sh
pnpm release:check
```

- For a normal release, use this order:

```sh
pnpm release:patch
npm publish
git push origin main --tags
```

- For a beta release, use this order:

```sh
pnpm release:beta
npm publish --tag beta
git push origin main --tags
```

- Do not create release tags by hand unless there is a specific recovery need. `npm version` should create the version commit and `vX.Y.Z` tag.
- Do not publish unbuilt or unverified packages. The package should publish only the built `dist` output plus required metadata.
- If a release command changes `package.json` or `pnpm-lock.yaml`, preserve those changes and include them in the release commit.
