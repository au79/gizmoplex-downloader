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
pnpm exec tsx src/index.ts
```

This non-interactive mode shows the complete plan and asks for confirmation
before transferring files. Use `--yes` only for an unattended run.

Preview what would be downloaded, including file sizes and items that already
exist locally:

```sh
pnpm dry-run
```

Download to a different directory and include both subtitle formats:

```sh
pnpm exec tsx src/index.ts --out ./archive --srt --vtt
```

Useful options:

- `-i, --interactive` — choose transactions and items before downloading.
- `--out <directory>` — change the archive location (default:
  `./gizmoplex-archive/`).
- `--srt` / `--vtt` — select subtitle formats; SRT is the default when neither
  option is given.
- `--clear-cache` — discard cached video metadata before starting.
- `--delay <min-max>` — wait a random number of seconds between video pages,
  such as `--delay 1-10`.
- `--show-in-progress-plan` — display a saved interrupted download plan without
  logging in.
- `-y, --yes` — bypass the confirmation prompt in non-interactive mode.

Run `pnpm exec tsx src/index.ts --help` for the full option list.

Interrupted non-dry-run downloads save a resumable plan in the output
directory. The next run can use that plan instead of repeating selection.

## Development

```sh
pnpm test
pnpm run build
pnpm exec tsx src/index.ts --help
```

The project was developed with [OpenAI Codex](https://openai.com/codex/). See
[AGENTS.md](AGENTS.md) for contributor guidance and
[docs/specifications.md](docs/specifications.md) for supported behavior.

## License

No license has been granted for this repository yet. Do not redistribute or
reuse the code unless the repository owner adds a license.
