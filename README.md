# Gizmoplex Downloader

[![Built with OpenAI Codex](https://img.shields.io/badge/Built%20with-OpenAI%20Codex-000000?logo=openai&logoColor=white)](https://openai.com/codex/)

A command-line tool for making a local archive of videos, subtitles, and ZIP
assets available through your Gizmoplex account.

Use it only with an account and content you are authorized to access. Gizmoplex
and its delivery APIs may change or become unavailable; this tool has no
affiliation with Gizmoplex.

## Requirements

- Node.js 20.12 or newer
- [pnpm](https://pnpm.io/)

## Install

```sh
git clone https://github.com/au79/gizmoplex-downloader.git
cd gizmoplex-downloader
pnpm install
```

The CLI asks for Gizmoplex credentials each time it runs. To avoid entering
them interactively, create a local `.env` file (it is ignored by Git):

```dotenv
GIZMOPLEX_EMAIL=you@example.com
GIZMOPLEX_PASSWORD=your-password
```

`GIZMOPLEX_USERNAME` may be used instead of `GIZMOPLEX_EMAIL`.

## Usage

Start the interactive picker:

```sh
pnpm start
```

Archive every discovered item without prompts:

```sh
pnpm exec tsx src/app.ts
```

This non-interactive mode shows the complete plan and asks for confirmation
before transferring files. Before a download session starts, the CLI also
checks available space on the target device and asks whether to continue when
the known planned download size exceeds it. Use `--yes` only for an unattended
non-interactive run; it bypasses the transfer and insufficient-space
confirmations.

Preview what would be downloaded, including file sizes and items that already
exist locally:

```sh
pnpm dry-run
```

Download to a different directory and include both subtitle formats:

```sh
pnpm exec tsx src/app.ts --out ./archive --srt --vtt
```

## Docker

Build the image from the repository root:

```sh
pnpm docker:build
```

Run with credentials from the local `.env` file and persist downloads in the
repository's `gizmoplex-archive` directory:

```sh
pnpm docker:run
```

For an unattended non-interactive run, use the equivalent command with
`--yes` instead of `--interactive`:

```sh
docker run --rm \
  --env-file .env \
  --volume "$PWD/gizmoplex-archive:/archive" \
  gizmoplex-downloader --out /archive --yes
```
The `/archive` volume also retains interrupted `.in-progress` plans and the
transaction and video metadata caches between containers.

Useful options:

- `-i, --interactive` — choose transactions and items before downloading.
- `--out <directory>` — change the archive location (default:
  `./gizmoplex-archive/`).
- `--srt` / `--vtt` — select subtitle formats; SRT is the default when neither
  option is given.
- `--clear-cache` — discard cached transactions and video metadata before
  starting. Transactions are refreshed on every run and the cache is replaced
  only when the fetched list changes.
- `--delay <min-max>` — wait a random number of seconds between downloadable
  items, such as `--delay 1-10`. This is courtesy pacing to avoid overtaxing
  upstream servers or making the request pattern appear malicious; individual
  file transfers remain sequential and are naturally spaced by their requests
  and transfer time.
- `--show-in-progress-plan` — display a saved interrupted download plan without
  logging in.
- `-y, --yes` — bypass non-interactive download and insufficient-space confirmations.

Run `pnpm exec tsx src/app.ts --help` for the full option list.

Interrupted non-dry-run downloads save a resumable plan in the output
directory. The next run can use that plan instead of repeating selection.

## Development

```sh
pnpm test
pnpm run build
pnpm exec tsx src/app.ts --help
```

The project was developed with [OpenAI Codex](https://openai.com/codex/). See
[AGENTS.md](AGENTS.md) for contributor guidance and
[docs/specifications.md](docs/specifications.md) for supported behavior.

For public contribution, security, and conduct guidance, see
[CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Review the
[public repository scope](docs/public-repository-scope.md) before adding
fixtures, logs, or downloaded data.

Maintainer responsibilities and repository settings are documented in the
[maintainer governance guide](docs/maintainer-governance.md).

## License

The source code is licensed under the [MIT License](LICENSE).

This license applies to this repository's code and documentation only. It does
not grant rights to Gizmoplex content, trademarks, or upstream services. Use
the tool only with an account and content you are authorized to access.
