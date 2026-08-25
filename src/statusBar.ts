import * as vscode from "vscode";
import type { PeriodUsage } from "./api";

const WARN_USED = 80;
const WARN_FG = "#FF6B35";

export class UsageStatusBar {
  private readonly autoItem: vscode.StatusBarItem;
  private readonly apiItem: vscode.StatusBarItem;

  constructor() {
    // Right align: lower priority = farther right. Diff of 1 keeps Auto+API grouped.
    this.autoItem = vscode.window.createStatusBarItem(
      "cursorSpending.auto",
      vscode.StatusBarAlignment.Right,
      Number.MIN_SAFE_INTEGER + 1
    );
    this.apiItem = vscode.window.createStatusBarItem(
      "cursorSpending.api",
      vscode.StatusBarAlignment.Right,
      Number.MIN_SAFE_INTEGER
    );
    for (const item of [this.autoItem, this.apiItem]) {
      item.command = "cursorSpendingTracker.refresh";
      item.tooltip = "Cursor usage";
      item.show();
    }
  }

  setLoading(): void {
    this.autoItem.text = "$(sync~spin) Auto";
    this.apiItem.text = "API";
    this.clearWarn();
    this.autoItem.backgroundColor = undefined;
    this.apiItem.backgroundColor = undefined;
    this.apiItem.show();
    const tip = "Refreshing Cursor usage…";
    this.autoItem.tooltip = tip;
    this.apiItem.tooltip = tip;
  }

  setUsage(usage: PeriodUsage): void {
    // Same % used labels as Settings → Plan & Usage
    this.autoItem.text = `Auto ${usage.autoPercentUsed}%`;
    this.apiItem.text = `API ${usage.apiPercentUsed}%`;
    this.autoItem.backgroundColor = undefined;
    this.apiItem.backgroundColor = undefined;
    this.autoItem.color =
      usage.autoPercentUsed >= WARN_USED ? WARN_FG : undefined;
    this.apiItem.color =
      usage.apiPercentUsed >= WARN_USED ? WARN_FG : undefined;
    this.apiItem.show();

    const tip = usage.billingCycleEnd ?? "Cursor usage";
    this.autoItem.tooltip = tip;
    this.apiItem.tooltip = tip;
  }

  setError(message: string): void {
    this.autoItem.text = "$(warning) Auto · API";
    this.apiItem.text = "";
    this.apiItem.hide();
    this.clearWarn();
    const errBg = new vscode.ThemeColor("statusBarItem.errorBackground");
    this.autoItem.backgroundColor = errBg;
    this.apiItem.backgroundColor = errBg;
    const tip = message;
    this.autoItem.tooltip = tip;
    this.apiItem.tooltip = tip;
  }

  dispose(): void {
    this.autoItem.dispose();
    this.apiItem.dispose();
  }

  private clearWarn(): void {
    this.autoItem.color = undefined;
    this.apiItem.color = undefined;
  }
}
