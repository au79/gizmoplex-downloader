# Changelog

All notable user-visible changes are recorded here. Release entries use
[Semantic Versioning](https://semver.org/).

## [Unreleased]

Changes intended for the next release are collected here until a release is
tagged.

## [0.9.0] - 2026-08-04

This pre-1.0.0 validation release exercises the standalone binary build and
GitHub Release distribution workflow.

## [1.0.0] - 2026-08-05

First stable public release.

- Add preflight storage checks and confirmation before downloads begin.
- Redact signed URL query parameters from user-facing output and saved plans.
- Harden Gizmoplex hostname validation against lookalike domains.
- Publish standalone binaries with SHA-256 checksums through GitHub Releases.
- Publish immutable Docker image tags with SBOM and provenance attestations.
