import * as vscode from "vscode";
import { readCursorTokens } from "./auth";
import { fetchPeriodUsage } from "./api";
import { UsageStatusBar } from "./statusBar";

let statusBar: UsageStatusBar | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let refreshing = false;

async function refresh(): Promise<void> {
  if (!statusBar || refreshing) {
    return;
  }
  refreshing = true;
  statusBar.setLoading();
  try {
    const tokens = await readCursorTokens();
    const usage = await fetchPeriodUsage(
      tokens.accessToken,
      tokens.refreshToken
    );
    statusBar.setUsage(usage);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    statusBar.setError(msg);
  } finally {
    refreshing = false;
  }
}

function intervalMs(): number {
  const minutes = vscode.workspace
    .getConfiguration("cursorSpendingTracker")
    .get<number>("refreshIntervalMinutes", 5);
  const clamped = Math.max(1, Math.min(120, minutes || 5));
  return clamped * 60_000;
}

function restartTimer(): void {
  if (timer) {
    clearInterval(timer);
  }
  timer = setInterval(() => {
    void refresh();
  }, intervalMs());
}

export function activate(context: vscode.ExtensionContext): void {
  statusBar = new UsageStatusBar();

  context.subscriptions.push(
    statusBar,
    vscode.commands.registerCommand(
      "cursorSpendingTracker.refresh",
      () => void refresh()
    ),
    vscode.commands.registerCommand(
      "cursorSpendingTracker.openDashboard",
      () => {
        void vscode.env.openExternal(
          vscode.Uri.parse("https://cursor.com/dashboard?tab=usage")
        );
      }
    ),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration(
          "cursorSpendingTracker.refreshIntervalMinutes"
        )
      ) {
        restartTimer();
      }
    })
  );

  restartTimer();
  void refresh();
}

export function deactivate(): void {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
}
