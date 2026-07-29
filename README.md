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
cursor --install-extension cursor-spending-tracker-0.1.0.vsix
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
2. Calls unofficial `GetCurrentPeriodUsage` on `api2.cursor.sh`.
3. Shows rounded `% used` for each pool (tooltip also shows % left).

Unofficial API — may break if Cursor changes backends. Tokens never logged; only sent to Cursor hosts.

## Self-check

```bash
npm run check
```
