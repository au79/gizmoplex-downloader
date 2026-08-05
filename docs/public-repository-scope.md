# Public repository scope

This document defines what may be published in the public
`gizmoplex-downloader` repository and what must remain local user data.

## Publishable project assets

The public repository may contain:

- TypeScript source and focused tests under `src/`.
- Public documentation, specifications, release plans, and contribution
  guidance.
- `README.md` and `LICENSE`.
- `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, and test/build
  configuration.
- `Dockerfile` and `.dockerignore`.
- Public GitHub configuration, including CI workflows, issue forms, pull
  request templates, security policy, ownership rules, and release
  configuration.
- Sanitized examples and fixtures that contain no credentials, private URLs,
  account data, downloaded media, or user-specific metadata.

## Local-only user and machine data

The following must not be committed, packaged, uploaded as a release artifact,
or included in a Docker build context:

- `.env` files, credentials, access tokens, cookies, and session data.
- Downloaded media, subtitle files, and other archive contents, including
  `gizmoplex-archive/`.
- Metadata caches, in-progress plans, transaction data, and logs that may
  contain account information, private URLs, signed URLs, or user paths.
- `node_modules/`, `.pnpm-store/`, `coverage/`, `dist/`, and other generated
  build or dependency output.
- IDE settings, operating-system metadata, local editor history, and machine-
  specific configuration.
- Any test fixture or diagnostic output copied from a real account or download
  session.

## Publication rules

- Treat downloaded media, cache files, plans, logs, and credentials as user
  data even when they are stored under the repository directory.
- Use synthetic values in tests and examples; never copy real signed URLs or
  account responses into source control.
- Review new files against this scope before committing them.
- Keep `.gitignore` and `.dockerignore` aligned with this boundary.
- Run the repository's secret scan before publication and before creating a
  release artifact.
- If a file's public status is uncertain, keep it local until its ownership,
  privacy, and licensing status are confirmed.

## Verification checklist

- [ ] A fresh clone contains only intended public project assets.
- [ ] A clean Docker build context contains no credentials, archive contents,
  caches, plans, logs, or generated output.
- [ ] Test fixtures contain synthetic data only.
- [ ] The full Git history has been scanned for secrets.
- [ ] The release artifact has been inspected before publication.
