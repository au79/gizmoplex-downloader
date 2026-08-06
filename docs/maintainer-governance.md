# Maintainer governance

This project is provided without promises, warranties, guarantees, or other
commitments beyond the applicable license. There is no promise of review,
maintenance, releases, support, response, compatibility, availability, or
remediation. The documents in this repository describe current configuration
and preferences; they do not create obligations. Gizmoplex and its upstream
providers may change or become unavailable independently of this repository.

> **Use at your own risk.** This project is provided “as is,” without promises,
> warranties, support, updates, availability, security, correctness, or
> compatibility. You are solely responsible for evaluating and using it
> lawfully, protecting your credentials and data, and accepting any consequences
> of its use. The maintainer assumes no responsibility for loss, damage, service
> interruption, account action, or other consequences arising from use.

## Ownership and responsibilities

- The `@au79` repository owner is the default code owner and maintainer.
- The maintainer owns repository settings, protected-branch rules, releases,
  dependency alerts, security reports, and decisions about upstream changes.
- There is no separate on-call rotation or commitment to handle security or
  release work.
- A report may remain open, be deferred, or be closed as unsupported when the
  maintainer cannot reproduce it or upstream service behavior has changed.
- Credentials, signed URLs, account data, downloaded content, caches, plans,
  and logs must never be requested as issue or pull-request attachments.

## Review and merge rules

- The sole maintainer reviews and merges all outside contributions.
- The maintainer may merge their own pull requests without a second approval;
  no other maintainer or rubber-stamp review is expected.
- The sole maintainer has final and unrestricted authority over repository
  changes, including whether to merge, defer, reject, or override a review or
  check. No explanation or justification is owed for those decisions.
- CI checks and review workflows are operational safeguards and guidance, not
  promises or conditions that limit the maintainer's authority.
- Outside contributions should not be merged without the maintainer's review.
- Contributions that require access-control bypasses, expose user data, or
  depend on rights the project does not have are out of scope.

## Default-branch protection settings

Apply these settings to `main` in the GitHub repository settings:

- Require a pull request before merging.
- Require maintainer review for pull requests authored by other contributors.
- Do not require an approving review for pull requests authored by the sole
  maintainer.
- Require conversation resolution.
- Require the stable CI checks: `Test (Node 20.x)`, `Test (Node 22.x)`, and
  `Docker build`.
- Do not allow force pushes or branch deletion.
- If additional reviewers are ever enabled, dismiss stale approvals when the
  pull request changes materially.
- Allow the sole maintainer to merge, bypass, or decline checks at their sole
  discretion.

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

There is no review cadence or response commitment. Dependabot and security
alerts provide automated notification paths, but their presence does not imply
that anyone will review, fix, release, or respond to anything.
