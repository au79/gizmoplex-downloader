# Public release checklist

Use this checklist before publishing the repository or creating a public
release. Keep credentials, downloaded media, caches, plans, and logs out of
the checklist evidence itself.

Follow [the release process](release-process.md) for versioning, tagging,
release notes, rollback, and support policy.

## Publication gate

- [x] Confirm the public boundary in
  [`public-repository-scope.md`](public-repository-scope.md).
- [x] Scan the full Git history, branches, tags, ignored files, and generated
  artifacts for secrets and sensitive user data.
- [x] Confirm no secrets were found; no revocation, rotation, or history rewrite
  was required.
- [x] Confirm `.gitignore` and `.dockerignore` exclude local credentials,
  downloaded media, runtime caches, in-progress plans, logs, and generated
  output.
- [x] Review public-facing files for private names, internal paths, account
  identifiers, and stale operational instructions.
- [x] Confirm the repository contains the MIT license naming
  `Christopher D. Goldman` as rights holder.
- [x] Confirm `package.json` contains the intended public author, MIT license,
  description, repository, issue tracker, homepage, and Node.js requirement.
- [x] Confirm the repository is public, Issues are enabled for bug and security
  intake, Discussions, Projects, and Wiki are disabled, and the sole
  collaborator is the maintainer account.
- [x] Inspect the final release archive from a clean checkout; the `HEAD`
  archive contained 78 files plus 7 directory entries, excluded credentials and
  user data, and passed frozen install, tests, build, and CLI help verification.

## Automated verification

- [ ] Required CI checks pass on every supported Node.js version.
- [ ] Tests, coverage, type checking, build, and CLI help smoke test pass.
- [ ] Docker image build and runtime smoke test pass, if Docker distribution is
  enabled.
- [ ] Dependency, secret, and static-analysis checks pass.
- [x] Review `package.json` against the committed `pnpm-lock.yaml`; verify
  dependency resolution and integrity metadata with
  `pnpm install --frozen-lockfile`.
- [x] License decision: no dedicated automated transitive-license checker is
  required currently. Review dependency license metadata during each release;
  revisit this decision if npm publication, a larger dependency set, or a
  dependency with additional notice obligations is introduced.
- [ ] No CI artifact, log, image layer, or release bundle contains credentials,
  signed URLs, downloaded media, caches, plans, or logs.

## Release metadata and communication

- [ ] Version and release tag follow the documented versioning policy.
- [ ] Release notes describe behavior changes, security fixes, breaking
  changes, and configuration changes.
- [x] Support and rollback procedures are available to maintainers.
- [x] The release channels (source, standalone binaries, and Docker) are
  explicitly enabled and have a verification owner; npm publication is
  disabled.
