import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import initSqlJs from "sql.js";
import {
  decryptCursorSafeStorage,
  localStateFromStateDb,
} from "./oscrypt";

export interface CursorTokens {
  accessToken: string;
  refreshToken?: string;
}

const STATE_DB = "state.vscdb";

/** `…/User/globalStorage/<extId>` → sibling `state.vscdb`. */
export function cursorStateDbFromGlobalStorage(
  extensionGlobalStorageFsPath: string
): string {
  return path.normalize(
    path.join(extensionGlobalStorageFsPath, "..", STATE_DB)
  );
}

function underCursorUserGlobalStorage(base: string): string {
  return path.join(base, "Cursor", "User", "globalStorage", STATE_DB);
}

/** OS default locations for Cursor `state.vscdb` (Win / macOS / Linux). */
export function cursorStateDbCandidates(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir()
): string[] {
  const out: string[] = [];
  const add = (p: string) => {
    const n = path.normalize(p);
    if (!out.includes(n)) {
      out.push(n);
    }
  };

  switch (platform) {
    case "win32": {
      const roaming =
        env.APPDATA?.trim() || path.join(home, "AppData", "Roaming");
      add(underCursorUserGlobalStorage(roaming));
      add(
        underCursorUserGlobalStorage(path.join(home, "AppData", "Roaming"))
      );
      break;
    }
    case "darwin":
      add(
        underCursorUserGlobalStorage(
          path.join(home, "Library", "Application Support")
        )
      );
      break;
    default: {
      const xdg = env.XDG_CONFIG_HOME?.trim();
      if (xdg) {
        add(underCursorUserGlobalStorage(xdg));
      }
      add(underCursorUserGlobalStorage(path.join(home, ".config")));
      break;
    }
  }
  return out;
}

/** First existing path among preferred + OS candidates. */
export function resolveCursorStateDb(preferred?: string): string {
  const tried: string[] = [];
  const seen = new Set<string>();
  const tryPath = (p: string | undefined): string | undefined => {
    if (!p) {
      return undefined;
    }
    const n = path.normalize(p);
    if (seen.has(n)) {
      return undefined;
    }
    seen.add(n);
    tried.push(n);
    return fs.existsSync(n) ? n : undefined;
  };

  const hit =
    tryPath(preferred) ??
    cursorStateDbCandidates().reduce<string | undefined>(
      (found, c) => found ?? tryPath(c),
      undefined
    );

  if (hit) {
    return hit;
  }
  throw new Error(
    `Cursor state DB not found. Tried:\n${tried.map((p) => `  - ${p}`).join("\n")}`
  );
}

function readKey(
  db: InstanceType<Awaited<ReturnType<typeof initSqlJs>>["Database"]>,
  key: string
): string | undefined {
  const stmt = db.prepare("SELECT value FROM ItemTable WHERE key = ?");
  try {
    stmt.bind([key]);
    if (!stmt.step()) {
      return undefined;
    }
    const row = stmt.getAsObject() as { value?: unknown };
    return typeof row.value === "string" ? row.value : undefined;
  } finally {
    stmt.free();
  }
}

/** Reads Cursor JWT from a copy of state.vscdb (avoids locking the live DB). */
export async function readCursorTokens(
  preferredStateDb?: string
): Promise<CursorTokens> {
  const dbPath = resolveCursorStateDb(preferredStateDb);

  const tmp = path.join(
    os.tmpdir(),
    `cursor-spending-${process.pid}-${Date.now()}.vscdb`
  );
  fs.copyFileSync(dbPath, tmp);

  try {
    const SQL = await initSqlJs({
      locateFile: (file) =>
        path.join(__dirname, "..", "node_modules", "sql.js", "dist", file),
    });
    const db = new SQL.Database(fs.readFileSync(tmp));
    try {
      const accessRaw = readKey(db, "cursorAuth/accessToken");
      if (!accessRaw) {
        throw new Error(
          "cursorAuth/accessToken missing — are you signed into Cursor?"
        );
      }
      const localStatePath = localStateFromStateDb(dbPath);
      const refreshRaw = readKey(db, "cursorAuth/refreshToken");
      return {
        accessToken: decryptCursorSafeStorage(accessRaw, localStatePath),
        refreshToken: refreshRaw
          ? decryptCursorSafeStorage(refreshRaw, localStatePath)
          : undefined,
      };
    } finally {
      db.close();
    }
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}
