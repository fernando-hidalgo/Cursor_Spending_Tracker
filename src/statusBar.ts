import * as vscode from "vscode";
import type { PeriodUsage } from "./api";

const WARN_USED = 80;
const WARN_FG = "#FF6B35";

export class UsageStatusBar {
  private readonly autoItem: vscode.StatusBarItem;
  private readonly apiItem: vscode.StatusBarItem;

  constructor() {
    this.autoItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      101
    );
    this.apiItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    for (const item of [this.autoItem, this.apiItem]) {
      item.command = "cursorSpendingTracker.refresh";
      item.tooltip = "Cursor usage — click to refresh";
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

    const lines = [
      `Cursor Models (Auto): ${usage.autoPercentUsed}% used (${usage.autoRemaining}% left)`,
      `Other Models (API): ${usage.apiPercentUsed}% used (${usage.apiRemaining}% left)`,
    ];
    if (usage.billingCycleEnd) {
      lines.push(`Cycle ends: ${usage.billingCycleEnd}`);
    }
    lines.push("Click to refresh");
    const tip = lines.join("\n");
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
    const tip = `${message}\nClick to retry`;
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
