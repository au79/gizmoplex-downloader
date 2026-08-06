# Standalone binaries: step-by-step guide

This guide is for people who want to use Gizmoplex Downloader without
installing Node.js, pnpm, or a programming tool.

## Before you begin

You need:

- A Gizmoplex account you are authorized to use.
- The computer platform listed below.
- Enough free space for the files you want to download.

Download the binary and the `SHA256SUMS` file from the same version on the
[GitHub Releases page](https://github.com/au79/gizmoplex-downloader/releases).
Choose exactly one binary:

| Computer | File |
| --- | --- |
| Windows 64-bit | `gizmoplex-downloader-win32-x64.exe` |
| Mac with Apple silicon (M1, M2, M3, or M4) | `gizmoplex-downloader-darwin-arm64` |
| Linux 64-bit | `gizmoplex-downloader-linux-x64` |

The macOS binary is for Apple-silicon Macs, not older Intel Macs. The Linux
binary is for 64-bit Linux computers.

## Set up your credentials

The easiest option is to let the program ask for your email and password each
time. Your password is not displayed while you type it.

To avoid entering credentials each time, create a plain-text file named `.env`
in the same folder as the binary:

```dotenv
GIZMOPLEX_EMAIL=you@example.com
GIZMOPLEX_PASSWORD=your-password
```

Keep this file private. Never send it to anyone or upload it to GitHub. You can
use `GIZMOPLEX_USERNAME` instead of `GIZMOPLEX_EMAIL` if that is how your
account is identified.

## Verify the download (recommended)

Download `SHA256SUMS` from the same GitHub Release as the binary. This confirms
that the binary was not changed after publication.

On Linux, open Terminal, move into the folder containing the files, and run:

```sh
sha256sum -c SHA256SUMS
```

Look for `OK` next to the binary you downloaded.

On macOS, run this instead:

```sh
shasum -a 256 -c SHA256SUMS
```

On Windows, open PowerShell in the folder containing the files and run:

```powershell
Get-FileHash .\gizmoplex-downloader-win32-x64.exe -Algorithm SHA256
```

Compare the `Hash` shown with the matching line in `SHA256SUMS`.

## Windows

1. Download `gizmoplex-downloader-win32-x64.exe` and `SHA256SUMS` from the
   release page. The files normally appear in **Downloads**.
2. Create the `.env` file in the same folder if you do not want to type your
   credentials each time.
3. Open **PowerShell**. You can find it by searching for “PowerShell” in the
   Start menu.
4. Move to your Downloads folder:

   ```powershell
   cd $HOME\Downloads
   ```

5. Start the interactive program:

   ```powershell
   .\gizmoplex-downloader-win32-x64.exe --interactive
   ```

6. Follow the prompts to choose what to download. Files are saved in a
   `gizmoplex-archive` folder in the folder where you started the program.

If Windows SmartScreen warns you, first verify the checksum and confirm that
you downloaded the file from the project’s GitHub Release. Then select **More
info** and **Run anyway** if you trust that release. The binaries are not
code-signed.

## macOS (Apple silicon)

1. Download `gizmoplex-downloader-darwin-arm64` and `SHA256SUMS` from the
   release page. The files normally appear in **Downloads**.
2. Create the `.env` file in the same folder if you do not want to type your
   credentials each time.
3. Open **Terminal** from Applications → Utilities.
4. Move to your Downloads folder:

   ```sh
   cd ~/Downloads
   ```

5. Make the downloaded file runnable:

   ```sh
   chmod +x ./gizmoplex-downloader-darwin-arm64
   ```

6. Start the interactive program:

   ```sh
   ./gizmoplex-downloader-darwin-arm64 --interactive
   ```

7. Follow the prompts to choose what to download. Files are saved in a
   `gizmoplex-archive` folder in the folder where you started the program.

macOS may warn that Apple cannot check the application. If you verified the
checksum and downloaded it from the project’s GitHub Release, open **System
Settings → Privacy & Security**, find the blocked application message, and
select **Open Anyway**. The binaries are not notarized.

## Linux (64-bit)

1. Download `gizmoplex-downloader-linux-x64` and `SHA256SUMS` from the release
   page.
2. Put the files in a folder you can find, such as `Downloads`.
3. Create the `.env` file in the same folder if you do not want to type your
   credentials each time.
4. Open your Terminal application and move to that folder. For the usual
   Downloads folder, run:

   ```sh
   cd ~/Downloads
   ```

5. Make the downloaded file runnable:

   ```sh
   chmod +x ./gizmoplex-downloader-linux-x64
   ```

6. Start the interactive program:

   ```sh
   ./gizmoplex-downloader-linux-x64 --interactive
   ```

7. Follow the prompts to choose what to download. Files are saved in a
   `gizmoplex-archive` folder in the folder where you started the program.

## Useful choices

The interactive command above is the recommended first run. Other useful
options are:

```text
--out <folder>   Choose where downloaded files are saved.
--srt            Include SRT subtitles.
--vtt            Include VTT subtitles.
--dry-run        Preview the download without writing files.
--yes            Skip download and low-storage confirmations for unattended use.
```

Before a download begins, the program checks whether the target device may not
have enough space and asks whether to continue. The `--yes` option bypasses
that question as well as the normal download confirmation.

If you need help, include your operating system and the exact error message.
Do not include your password, `.env` contents, downloaded files, saved plans,
or complete signed URLs.
