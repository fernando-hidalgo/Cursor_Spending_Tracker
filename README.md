# Cursor Spending Tracker

Status bar extension for Cursor: **Auto** (Cursor Models) and **API** (Other Models) **% used**, same as Plan & Usage.

Example: `Auto 6% · API 48%`

## Install (permanent, like any extension)

```bash
npm install
npm run install:cursor
```

Or manually:

```bash
npm run package
cursor --install-extension cursor-spending-tracker-0.1.7.vsix
```

Then **reload Cursor** (Command Palette → “Developer: Reload Window”). Status bar: `Auto X% · API Y%` (% used).

Also: Extensions → `...` → **Install from VSIX…** → pick the `.vsix`.

### Dev (F5)

Open this folder → `npm install` → `npm run compile` → F5.

## Commands

| Command | Action |
|---|---|
| Cursor Spending: Refresh usage | Re-fetch percentages |
| Cursor Spending: Open dashboard | Open cursor.com usage tab |

## Settings

- `cursorSpendingTracker.refreshIntervalMinutes` (default `5`)

## How it works

1. Reads `cursorAuth/accessToken` from Cursor’s local `state.vscdb` (copy, not locked).
2. If Cursor 3.27+ encrypted the token at rest (`cursor-safe-storage:v1:`), decrypts it on **Windows** via Chromium OSCrypt (`Local State` + DPAPI via PowerShell + AES-256-GCM). Plaintext JWTs still work. macOS/Linux encrypted tokens are not decrypted yet.
3. Calls unofficial `GetCurrentPeriodUsage` on `api2.cursor.sh`.
4. Shows rounded `% used` for each pool (tooltip also shows % left).

Tokens are decrypted in memory only — never logged or written back to disk.

### Locating `state.vscdb`

Runtime prefers the DB next to the extension’s `globalStorage` folder (works with custom `--user-data-dir`). If missing, falls back to OS defaults:

| OS | Path |
|---|---|
| Windows | `%APPDATA%\Cursor\User\globalStorage\state.vscdb` |
| macOS | `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` |
| Linux | `$XDG_CONFIG_HOME/Cursor/…` or `~/.config/Cursor/User/globalStorage/state.vscdb` |

Unofficial API — may break if Cursor changes backends. Tokens never logged; only sent to Cursor hosts.

## Self-check

```bash
npm run check
```
