# Maintainer governance

This project is maintained on a best-effort basis. It is intended to be
usable by outside contributors, but there is no promise of rapid review,
regular releases, or continuous support. Gizmoplex and its upstream providers
may change or become unavailable independently of this repository.

## Ownership and responsibilities

- The `@au79` repository owner is the default code owner and maintainer.
- The maintainer owns repository settings, protected-branch rules, releases,
  dependency alerts, security reports, and decisions about upstream changes.
- There is no separate on-call rotation. Security and release work is handled
  on a best-effort basis by the maintainer.
- A report may remain open, be deferred, or be closed as unsupported when the
  maintainer cannot reproduce it or upstream service behavior has changed.
- Credentials, signed URLs, account data, downloaded content, caches, plans,
  and logs must never be requested as issue or pull-request attachments.

## Review and merge rules

- The sole maintainer reviews and merges all outside contributions.
- The maintainer may merge their own pull requests; no second maintainer or
  rubber-stamp approval is expected.
- Every pull request should pass the required CI checks before merging. If the
  maintainer bypasses a failing or unavailable check, the reason and follow-up
  validation should be recorded in the pull request.
- Outside contributions should not be merged without the maintainer's review.
- Contributions that require access-control bypasses, expose user data, or
  depend on rights the project does not have are out of scope.

## Default-branch protection settings

Apply these settings to `main` in the GitHub repository settings:

- Require a pull request before merging.
- Require maintainer review for pull requests authored by other contributors.
- Require conversation resolution.
- Require the stable CI checks: `Test (Node 20.x)`, `Test (Node 22.x)`, and
  `Docker build`.
- Do not allow force pushes or branch deletion.
- Dismiss stale approvals when the pull request changes materially.
- Allow the sole maintainer to merge their own pull requests after the required
  checks pass; document any emergency bypass and run the checks afterward.

These are administrative settings; this document does not apply them to the
GitHub repository.

## Repository settings

The intended public configuration is:

- Repository visibility: public when the publication gate is complete.
- Issues: enabled for bugs and feature requests using the supplied forms.
- Blank issues: disabled so reports follow the documented paths.
- Security advisories/private vulnerability reporting: enabled.
- Discussions: disabled unless the maintainer chooses to support an ongoing
  community forum.
- Actions: allow the repository workflows and approved third-party actions
  used by the checked-in CI and security workflows.
- Repository administration, secrets, environments, and release publishing:
  restricted to the maintainer.

## Review cadence

There is no guaranteed review cadence. Dependabot and security alerts provide
automated notification paths, but their presence does not imply that a fix or
release will be produced by a particular date.
