# Release process

This project uses [Semantic Versioning](https://semver.org/) for the CLI and
any published container image.

- `MAJOR`: breaking CLI behavior, supported runtime, plan/cache format, or
  output contract.
- `MINOR`: backward-compatible features or options.
- `PATCH`: backward-compatible fixes and security updates.

The first real public release is **`1.0.0`**. The package is currently
versioned for that intended release, but it is not public until the release
checklist passes and `v1.0.0` is tagged.

## Release steps

1. Choose the version and update `CHANGELOG.md`.
2. Run [the release checklist](release-checklist.md).
3. Commit the release changes on a clean, green `main` checkout.
4. Create an annotated tag such as `v1.0.0`.
5. Create the matching GitHub release and verify its notes and artifacts.

Use `-alpha.N`, `-beta.N`, or `-rc.N` for pre-releases. Do not reuse or move
published tags; issue a corrective patch release instead.

The sole maintainer supports the latest release on a best-effort basis. npm
and Docker publication are not enabled until those distribution decisions are
made separately.
