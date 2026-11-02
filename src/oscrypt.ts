import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

export const CURSOR_SAFE_STORAGE_PREFIX = "cursor-safe-storage:v1:";

const V10_PREFIX = Buffer.from("v10");
const DPAPI_PREFIX = Buffer.from("DPAPI");
const GCM_NONCE_LEN = 12;
const GCM_TAG_LEN = 16;

export function isEncryptedCursorToken(value: string): boolean {
  return value.startsWith(CURSOR_SAFE_STORAGE_PREFIX);
}

/** `…/User/globalStorage/state.vscdb` → `…/Local State` (Chromium profile root). */
export function localStateFromStateDb(stateDbPath: string): string {
  // state.vscdb → globalStorage → User → Cursor root
  return path.normalize(
    path.join(path.dirname(stateDbPath), "..", "..", "Local State")
  );
}

/** Decrypt a Chromium/Electron OSCrypt v10 AES-256-GCM blob with a known key. */
export function decryptOsCryptV10(
  ciphertext: Buffer,
  aesKey: Buffer
): string {
  if (ciphertext.length < V10_PREFIX.length + GCM_NONCE_LEN + GCM_TAG_LEN) {
    throw new Error("OSCrypt payload too short");
  }
  if (!ciphertext.subarray(0, V10_PREFIX.length).equals(V10_PREFIX)) {
    throw new Error(
      `Unsupported OSCrypt envelope (expected v10, got ${ciphertext
        .subarray(0, 3)
        .toString("latin1")})`
    );
  }
  const nonce = ciphertext.subarray(
    V10_PREFIX.length,
    V10_PREFIX.length + GCM_NONCE_LEN
  );
  const encAndTag = ciphertext.subarray(V10_PREFIX.length + GCM_NONCE_LEN);
  if (encAndTag.length <= GCM_TAG_LEN) {
    throw new Error("OSCrypt ciphertext missing tag");
  }
  const tag = encAndTag.subarray(encAndTag.length - GCM_TAG_LEN);
  const data = encAndTag.subarray(0, encAndTag.length - GCM_TAG_LEN);
  const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, nonce);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return plain.toString("utf8");
}

/** Encrypt plaintext to OSCrypt v10 (for synthetic tests only). */
export function encryptOsCryptV10(plaintext: string, aesKey: Buffer): Buffer {
  const nonce = crypto.randomBytes(GCM_NONCE_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, nonce);
  const data = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([V10_PREFIX, nonce, data, tag]);
}

const aesKeyByLocalState = new Map<string, Buffer>();

function readWindowsAesKey(localStatePath: string): Buffer {
  const normalized = path.normalize(localStatePath);
  const cached = aesKeyByLocalState.get(normalized);
  if (cached) {
    return cached;
  }
  if (!fs.existsSync(normalized)) {
    throw new Error(`Cursor Local State not found: ${normalized}`);
  }
  let parsed: { os_crypt?: { encrypted_key?: string } };
  try {
    parsed = JSON.parse(fs.readFileSync(normalized, "utf8")) as {
      os_crypt?: { encrypted_key?: string };
    };
  } catch {
    throw new Error(`Failed to parse Cursor Local State: ${normalized}`);
  }
  const b64 = parsed.os_crypt?.encrypted_key;
  if (!b64 || typeof b64 !== "string") {
    throw new Error("Local State missing os_crypt.encrypted_key");
  }
  const wrapped = Buffer.from(b64, "base64");
  if (
    wrapped.length <= DPAPI_PREFIX.length ||
    !wrapped.subarray(0, DPAPI_PREFIX.length).equals(DPAPI_PREFIX)
  ) {
    throw new Error("Local State encrypted_key missing DPAPI prefix");
  }
  const protectedKey = wrapped.subarray(DPAPI_PREFIX.length);
  const key = dpapiUnprotect(protectedKey);
  aesKeyByLocalState.set(normalized, key);
  return key;
}

/**
 * Unwrap DPAPI via .NET ProtectedData in a short-lived PowerShell process.
 * Avoids native Node addons (koffi), which fail to load in Cursor's Electron host.
 */
function dpapiUnprotect(data: Buffer): Buffer {
  const script = [
    "Add-Type -AssemblyName System.Security",
    "$in = [Convert]::FromBase64String($env:CURSOR_DPAPI_IN)",
    "$out = [System.Security.Cryptography.ProtectedData]::Unprotect($in, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)",
    "[Convert]::ToBase64String($out)",
  ].join("; ");

  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    {
      encoding: "utf8",
      windowsHide: true,
      env: {
        ...process.env,
        CURSOR_DPAPI_IN: data.toString("base64"),
      },
    }
  );

  if (result.error) {
    throw new Error(`DPAPI PowerShell failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || "").trim();
    throw new Error(
      `DPAPI CryptUnprotectData failed${err ? `: ${err.slice(0, 200)}` : ""}`
    );
  }
  const b64 = (result.stdout || "").trim().split(/\r?\n/).filter(Boolean).pop();
  if (!b64) {
    throw new Error("DPAPI returned empty key");
  }
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error(`Unexpected DPAPI key length ${key.length} (expected 32)`);
  }
  return key;
}

/**
 * Resolve a Cursor auth token value to plaintext JWT.
 * Legacy plaintext passes through; `cursor-safe-storage:v1:` is decrypted on win32.
 */
export function decryptCursorSafeStorage(
  value: string,
  localStatePath: string,
  platform: NodeJS.Platform = process.platform
): string {
  if (!isEncryptedCursorToken(value)) {
    return value;
  }
  if (platform !== "win32") {
    throw new Error(
      "Cursor tokens are encrypted at rest (cursor-safe-storage); decryption is only supported on Windows"
    );
  }
  const payloadB64 = value.slice(CURSOR_SAFE_STORAGE_PREFIX.length);
  let ciphertext: Buffer;
  try {
    ciphertext = Buffer.from(payloadB64, "base64");
  } catch {
    throw new Error("Invalid cursor-safe-storage base64 payload");
  }
  if (ciphertext.length === 0) {
    throw new Error("Empty cursor-safe-storage payload");
  }
  const aesKey = readWindowsAesKey(localStatePath);
  return decryptOsCryptV10(ciphertext, aesKey);
}
