import * as path from "path";
import { remainingPercent, usedPercent, formatCycleEnd } from "./api";
import {
  cursorStateDbCandidates,
  cursorStateDbFromGlobalStorage,
} from "./auth";

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    throw new Error(msg);
  }
}

assert(usedPercent(0) === 0, "0 → 0 used");
assert(usedPercent(6.36) === 6, "6.36 → 6 used");
assert(usedPercent(47.95) === 48, "47.95 → 48 used");
assert(usedPercent(100) === 100, "100 → 100 used");
assert(usedPercent(-5) === 0, "negative clamped");
assert(usedPercent(150) === 100, "over 100 clamped");
assert(usedPercent(Number.NaN) === 0, "NaN → 0");

assert(remainingPercent(0) === 100, "0 used → 100 left");
assert(remainingPercent(100) === 0, "100 used → 0 left");
assert(remainingPercent(6) === 94, "6 used → 94 left");

const sample = formatCycleEnd(Date.UTC(2026, 7, 20, 17, 30, 1));
assert(
  typeof sample === "string" && /^\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(sample),
  "cycle date format"
);
assert(formatCycleEnd("1787247001000") !== undefined, "ms string parses");

const fromGs = cursorStateDbFromGlobalStorage(
  path.join("User", "globalStorage", "pub.ext")
);
assert(
  path.basename(fromGs) === "state.vscdb",
  "globalStorage sibling → state.vscdb"
);
assert(
  path.basename(path.dirname(fromGs)) === "globalStorage",
  "state.vscdb under globalStorage"
);

const win = cursorStateDbCandidates("win32", {}, "C:\\Users\\test");
assert(
  win.some((p) => p.includes(path.join("AppData", "Roaming", "Cursor"))),
  "win candidate has AppData/Roaming/Cursor"
);

const mac = cursorStateDbCandidates("darwin", {}, "/Users/test");
assert(
  mac.some((p) =>
    p.includes(path.join("Library", "Application Support", "Cursor"))
  ),
  "mac candidate has Library/Application Support/Cursor"
);

const linux = cursorStateDbCandidates(
  "linux",
  { XDG_CONFIG_HOME: "/custom/cfg" },
  "/home/test"
);
assert(
  linux[0] ===
    path.normalize(
      path.join("/custom/cfg", "Cursor", "User", "globalStorage", "state.vscdb")
    ),
  "linux prefers XDG_CONFIG_HOME"
);

console.log("remaining.check: ok");
