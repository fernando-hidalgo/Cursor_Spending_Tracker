import * as crypto from "crypto";
import * as path from "path";
import {
  remainingPercent,
  usedPercent,
  formatCycleEnd,
  formatCycleRemaining,
} from "./api";
import {
  cursorStateDbCandidates,
  cursorStateDbFromGlobalStorage,
} from "./auth";
import {
  CURSOR_SAFE_STORAGE_PREFIX,
  decryptCursorSafeStorage,
  decryptOsCryptV10,
  encryptOsCryptV10,
  isEncryptedCursorToken,
  localStateFromStateDb,
} from "./oscrypt";

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

const now = 1_700_000_000_000;
const end = now + 2 * 86_400_000 + 5 * 3_600_000 + 30 * 60_000;
assert(
  formatCycleRemaining(end, now) === "2 days, 5 hours left",
  "2d 5h left"
);
assert(
  formatCycleRemaining(now - 1, now) === "0 days, 0 hours left",
  "past end → 0"
);
assert(
  formatCycleRemaining(now + 3_600_000, now) === "0 days, 1 hour left",
  "1 hour singular"
);

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

assert(
  isEncryptedCursorToken(`${CURSOR_SAFE_STORAGE_PREFIX}abc`) === true,
  "detects safe-storage prefix"
);
assert(isEncryptedCursorToken("eyJhbGciOi") === false, "JWT not encrypted");

const fromDb = localStateFromStateDb(
  path.join("Cursor", "User", "globalStorage", "state.vscdb")
);
assert(
  path.basename(fromDb) === "Local State",
  "state.vscdb → Local State basename"
);
assert(
  path.basename(path.dirname(fromDb)) === "Cursor",
  "Local State under Cursor root"
);

const syntheticKey = crypto.randomBytes(32);
const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.sig";
const v10 = encryptOsCryptV10(jwt, syntheticKey);
assert(decryptOsCryptV10(v10, syntheticKey) === jwt, "v10 round-trip");

const wrapped = `${CURSOR_SAFE_STORAGE_PREFIX}${v10.toString("base64")}`;
assert(
  decryptCursorSafeStorage(jwt, "/nonexistent", "linux") === jwt,
  "plaintext passthrough"
);
try {
  decryptCursorSafeStorage(wrapped, "/nonexistent", "linux");
  assert(false, "encrypted on linux should throw");
} catch (e) {
  assert(
    e instanceof Error && e.message.includes("only supported on Windows"),
    "linux encrypted error message"
  );
}

console.log("remaining.check: ok");
