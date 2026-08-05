# Release process

This project uses [Semantic Versioning](https://semver.org/) for the CLI and
any published container image.

- `MAJOR`: breaking CLI behavior, supported runtime, plan/cache format, or
  output contract.
- `MINOR`: backward-compatible features or options.
- `PATCH`: backward-compatible fixes and security updates.

The first real public release remains **`1.0.0`**. Version `0.9.0` is a
pre-1.0.0 validation release for exercising the standalone binary and GitHub
Release workflow; it does not change the planned 1.0.0 release milestone.

## Release steps

1. Choose the version and update `CHANGELOG.md`.
2. Run [the release checklist](release-checklist.md).
3. Commit the release changes on a clean, green `main` checkout.
4. Create an annotated tag such as `v1.0.0`.
5. Push the tag; GitHub Actions builds the standalone binaries, creates
   `SHA256SUMS`, publishes the assets to the matching GitHub Release, and
   publishes versioned Docker images to Docker Hub.
6. Verify the release notes, assets, checksums, and Docker image tags.

Use `-alpha.N`, `-beta.N`, or `-rc.N` for pre-releases. Do not reuse or move
published tags; issue a corrective patch release instead.

The sole maintainer supports the latest release on a best-effort basis. npm
publication is not enabled. Docker publication uses versioned tags only; a
moving `latest` tag remains deferred.
