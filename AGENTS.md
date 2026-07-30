# Contributor Guide

## Project

`gizmoplex-downloader` is a TypeScript CLI that archives media a user is
authorized to download from their own Gizmoplex account.

## Working conventions

- Use `pnpm`; do not use npm or yarn.
- Run the CLI locally with `pnpm exec tsx src/index.ts`.
- Keep credentials out of source control. The CLI prompts when values are not
  supplied through `.env` (`GIZMOPLEX_EMAIL` or `GIZMOPLEX_USERNAME`, plus
  `GIZMOPLEX_PASSWORD`).
- Preserve the CLI's stdout/stderr contract: dry-run output goes to stdout;
  normal operational output goes to stderr.
- Treat downloaded media, cache files, plans, and credentials as user data.
  Do not add fixtures or logs containing them.
- Add focused tests for behavior changes, especially parsing, link discovery,
  selection, path handling, and output formatting.

## Before submitting a change

Run:

```sh
pnpm test
pnpm run build
pnpm exec tsx src/index.ts --help
```

Keep commits small and use Conventional Commit subjects, for example
`fix(links): Handle signed ZIP filenames`.
