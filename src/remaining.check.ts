import { remainingPercent, usedPercent, formatCycleEnd } from "./api";

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

console.log("remaining.check: ok");
