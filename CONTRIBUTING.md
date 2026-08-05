# Contributing

Thanks for helping improve `gizmoplex-downloader`. Contributions should keep
the tool safe for users, respectful of upstream services, and suitable for a
public repository.

## Scope and authorized use

This project archives media that a user is authorized to download from their
own Gizmoplex account. Contributions must not add account creation, access-
control bypasses, content sharing, or behavior intended to evade provider
controls.

Gizmoplex pages, authentication, APIs, delivery providers, and service
availability may change or end independently of this project. A contribution
that depends on upstream behavior should document that dependency and its
failure mode.

## Development setup

Requirements:

- Node.js 20.12 or newer
- pnpm

Set up a checkout with:

```sh
pnpm install
pnpm exec tsx src/app.ts --help
```

Use a local, ignored `.env` for credentials when needed. Never commit real
credentials, cookies, account responses, signed URLs, downloaded media, cache
files, in-progress plans, or logs.

## Making changes

- Keep changes focused and explain user-visible behavior in the pull request.
- Preserve the CLI output contract: dry-run output goes to stdout; normal
  operational output goes to stderr.
- Add focused tests for behavior changes, especially parsing, discovery,
  selection, path handling, storage checks, URL redaction, and output format.
- Use synthetic fixtures only. Do not copy data from a real account or
  download session into tests or examples.
- Update the README, specifications, or release documentation when behavior,
  security expectations, or supported workflows change.
- Use small Conventional Commit subjects, such as
  `fix(links): Handle signed ZIP filenames`.

## Required checks

Run these before opening a pull request:

```sh
pnpm test
pnpm test:coverage
pnpm exec tsc --noEmit
pnpm run build
pnpm exec tsx src/app.ts --help
git diff --check
```

The GitHub Actions workflow runs the same checks on supported Node.js versions
and builds the Docker image.

## Pull requests

Use the pull-request template. Include the reason for the change, tests run,
documentation impact, and any security, privacy, licensing, or upstream-
compatibility considerations. Keep unrelated refactors out of a behavioral
change unless they are necessary for correctness.

## Reporting problems

Use the bug and feature issue forms for ordinary public discussion. Do not post
credentials, signed URLs, account data, downloaded content, or private
responses in an issue. Report suspected vulnerabilities through the private
process in [`SECURITY.md`](SECURITY.md).
