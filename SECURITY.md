# Security policy

## Supported versions

Until the first stable public release, the default branch is the only
supported development line. After a stable release, security fixes target the
latest released version unless a release note states otherwise. Older versions
may stop receiving fixes without notice.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's
private vulnerability reporting flow in the repository's **Security** tab:

[Report a private vulnerability](https://github.com/au79/gizmoplex-downloader/security/advisories/new)

If private reporting is unavailable, open a minimal public issue that contains
no exploit details, credentials, signed URLs, account data, or affected
content, and ask the maintainers for a private reporting channel.

Include, when safe:

- A concise description and impact assessment.
- The affected version or commit.
- Reproduction steps using synthetic data only.
- A suggested mitigation, if known.

Please allow three business days for an acknowledgement and fourteen days for
an initial triage update. These are targets, not guarantees.

## Handling sensitive data

Never include the following in an issue, pull request, CI artifact, log, or
test fixture:

- Gizmoplex credentials, cookies, tokens, or session data.
- Signed download URLs or private account URLs.
- Downloaded media, subtitles, cache files, in-progress plans, or account
  responses.
- Personal filesystem paths or identifying account information.

If any secret is exposed, revoke or rotate it immediately and notify the
maintainers privately. Removing it from the latest commit is not sufficient if
it was committed to Git history.

## Scope and upstream limits

The project is intended for media a user is authorized to download from their
own account. It does not provide access-control bypasses or grant rights to
Gizmoplex content, trademarks, or upstream services. Gizmoplex and its
delivery providers may change or become unavailable; an upstream failure is
not automatically a project vulnerability.

## Dependency and supply-chain triage

Dependency-review pull requests and automated dependency updates are expected
to run through the repository's security workflows. A high- or critical-
severity dependency finding blocks a release until the dependency is upgraded,
the affected path is removed, or a maintainer records a time-bounded risk
acceptance with rationale and mitigation.

Secret-scanning, push-protection, and code-scanning settings must be enabled in
the repository's GitHub security settings. CI artifacts and logs should contain
only test or analysis output and must never include credentials, signed URLs,
downloaded content, caches, plans, or account data.
