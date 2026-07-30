# Gizmoplex Downloader Specification

## Status and scope

This document describes the supported behavior of the CLI. It is an
implementation specification, not a guarantee that Gizmoplex or its upstream
providers will continue to expose the same pages and APIs.

The [accepted requirements awaiting implementation](#accepted-requirements-awaiting-implementation)
section records approved behavior that is not present in the current release.

The terms **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are used as described
by [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

The tool is for creating a local archive of media that the user is authorized
to access through their own Gizmoplex account. It does not provide account
creation, payment, content sharing, or access-control bypasses.

## Runtime and credentials

- The application MUST be a Node.js command-line program and MUST use a CLI
  library for argument parsing.
- Development and runtime commands MUST use pnpm. Local execution MUST use
  `tsx`.
- On each run requiring authentication, the application MUST obtain an email
  and password. It MUST prompt for a missing value.
- `GIZMOPLEX_EMAIL` or `GIZMOPLEX_USERNAME` supplies the email, and
  `GIZMOPLEX_PASSWORD` supplies the password when present in the environment
  or a local `.env` file.
- Credentials, downloaded content, metadata caches, and saved plans MUST NOT
  be written to source control.

## Transaction and media discovery

- The application MUST authenticate through the Gizmoplex login flow and read
  transactions from its customer transaction endpoint.
- Each transaction MUST retain its date, product name, and product URL.
- The product URL MUST be inspected for video pages and downloadable ZIP
  assets.
- A video page MUST be inspected for directly exposed media and for Vimeo/VHX
  metadata when available. Subtitle discovery MUST support VHX subtitle data
  as well as page links.
- The application MUST select the highest-resolution available video link.
- It MUST support SRT and VTT subtitles. When no subtitle option is supplied,
  SRT is the default; supplying both `--srt` and `--vtt` selects both.
- ZIP assets MUST be treated as independent downloadable items and deduplicated
  by their resolved filename when possible.

## Metadata and filenames

- Video metadata MUST be cached under `<output>/.cache/videos` and reused when
  available.
- Cached records MUST contain distilled metadata rather than raw page HTML.
- `--clear-cache` MUST remove the metadata cache before discovery.
- The preferred video-title order is Vimeo `video.title`, VHX `title`, VHX
  `name`, then page metadata. Placeholder titles such as `untitled` MUST NOT
  be selected when a better value exists.
- Files MUST be placed beneath a sanitized transaction directory. Video and
  subtitle filenames use the sanitized selected title; ZIP filenames use their
  signed URL or link metadata when available.
- Existing files MUST be skipped rather than downloaded again.

## Planning and recovery

- Non-dry-run downloads MUST build a plan for an item before writing its files.
- An interrupted non-dry-run MUST save its plan as `<output>/.in-progress`,
  unless `--in-progress-plan <path>` specifies another location.
- A subsequent run with an existing plan MUST offer to resume it. A successful
  resumed run MUST remove the plan.
- `--show-in-progress-plan` MUST display the selected plan without logging in
  or downloading files.
- Dry runs MUST NOT create, consume, or delete an in-progress plan.

## Non-interactive archive runs

Non-interactive mode is the default when `--interactive` is not supplied.

- The CLI MUST print the authenticated account's transactions, then process
  every transaction without asking the user to choose items.
- For each transaction, it MUST inspect the product page for ZIP assets and
  video pages. ZIP assets are planned and, outside a dry run, downloaded as
  they are encountered.
- It MUST then process each discovered video page, plan the selected video and
  subtitle files, and download that item's unskipped files immediately.
- The default non-interactive mode MUST NOT require a final confirmation before
  transferring files.
- In a dry run, it MUST perform the same discovery and planning but MUST report
  `would download` or `skip` instead of transferring media.
- When a delay is configured, the CLI MUST wait only between video pages whose
  previous plan contains at least one unskipped download. It MUST NOT delay
  after an item that was entirely skipped.

## Output and interaction

- `--out <directory>` sets the archive root; the default is
  `./gizmoplex-archive/`.
- `--dry-run` MUST list planned downloads, skipped existing files, source URLs,
  file sizes when available, and a summary. Dry-run output goes to stdout;
  normal operational output goes to stderr.
- A summary MUST report already-downloaded, remaining, and total-required
  items, with counts for MP4, ZIP, VTT, SRT, and unknown sizes.
- `--delay <min-max>` MUST accept an inclusive positive-integer range in
  seconds. It defaults to `1-10` in a dry run and to no delay otherwise.
- `--interactive` (or `-i`) MUST allow users to build a selection across
  transactions, review it grouped by transaction, and explicitly confirm or
  cancel before downloading.
- Interactive mode MUST keep current basket selections when revisiting a
  transaction and MUST hide items already present locally from the picker.

## Networking and errors

- Requests MUST retry network failures, timeouts, and HTTP 5xx responses up to
  ten times with exponential backoff starting at one second.
- Final errors MUST identify the failed resource without exposing credential or
  token values.
- The CLI MUST show download progress and print total runtime using a compact,
  zero-padded duration format.

## Verification

Changes to the implementation SHOULD include focused automated tests for
parsing, discovery, selection, path handling, or formatting as appropriate.
Before submitting a change, run:

```sh
pnpm test
pnpm run build
pnpm exec tsx src/index.ts --help
```

## Accepted requirements awaiting implementation

- A default non-interactive run MUST build and display the complete archive
  plan and summary before transferring files. It MUST require confirmation;
  `--yes` MAY explicitly bypass that confirmation for unattended runs.
- When distinct assets would resolve to the same destination path, the CLI MUST
  preserve both files by appending a deterministic, source-derived suffix before
  the extension.
- The CLI MUST write each download to a temporary file and rename it only after
  success. When the response provides `Content-Length`, the streamed byte count
  MUST match it before rename. A cryptographic digest MUST be checked when a
  trusted expected digest is available from the source.
