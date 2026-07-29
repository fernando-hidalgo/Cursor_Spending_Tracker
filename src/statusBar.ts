import * as vscode from "vscode";
import type { PeriodUsage } from "./api";

const WARN_USED = 80;

export class UsageStatusBar {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.command = "cursorSpendingTracker.refresh";
    this.item.tooltip = "Cursor usage — click to refresh";
    this.item.show();
  }

  setLoading(): void {
    this.item.text = "$(sync~spin) Auto · API";
    this.item.backgroundColor = undefined;
    this.item.tooltip = "Refreshing Cursor usage…";
  }

  setUsage(usage: PeriodUsage): void {
    // Same % used labels as Settings → Plan & Usage
    this.item.text = `Auto ${usage.autoPercentUsed}% · API ${usage.apiPercentUsed}%`;
    const high =
      usage.autoPercentUsed >= WARN_USED || usage.apiPercentUsed >= WARN_USED;
    this.item.backgroundColor = high
      ? new vscode.ThemeColor("statusBarItem.warningBackground")
      : undefined;

    const lines = [
      `Cursor Models (Auto): ${usage.autoPercentUsed}% used (${usage.autoRemaining}% left)`,
      `Other Models (API): ${usage.apiPercentUsed}% used (${usage.apiRemaining}% left)`,
    ];
    if (usage.billingCycleEnd) {
      lines.push(`Cycle ends: ${usage.billingCycleEnd}`);
    }
    lines.push("Click to refresh");
    this.item.tooltip = lines.join("\n");
  }

  setError(message: string): void {
    this.item.text = "$(warning) Auto · API";
    this.item.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.errorBackground"
    );
    this.item.tooltip = `${message}\nClick to retry`;
  }

  dispose(): void {
    this.item.dispose();
  }
}
