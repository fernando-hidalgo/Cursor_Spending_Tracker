import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import initSqlJs from "sql.js";

export interface CursorTokens {
  accessToken: string;
  refreshToken?: string;
}

function stateDbPath(): string {
  const home = os.homedir();
  switch (process.platform) {
    case "win32":
      return path.join(
        process.env.APPDATA ?? path.join(home, "AppData", "Roaming"),
        "Cursor",
        "User",
        "globalStorage",
        "state.vscdb"
      );
    case "darwin":
      return path.join(
        home,
        "Library",
        "Application Support",
        "Cursor",
        "User",
        "globalStorage",
        "state.vscdb"
      );
    default:
      return path.join(
        home,
        ".config",
        "Cursor",
        "User",
        "globalStorage",
        "state.vscdb"
      );
  }
}

function readKey(db: InstanceType<Awaited<ReturnType<typeof initSqlJs>>["Database"]>, key: string): string | undefined {
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
export async function readCursorTokens(): Promise<CursorTokens> {
  const dbPath = stateDbPath();
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Cursor state DB not found at ${dbPath}`);
  }

  const tmp = path.join(os.tmpdir(), `cursor-spending-${process.pid}-${Date.now()}.vscdb`);
  fs.copyFileSync(dbPath, tmp);

  try {
    const SQL = await initSqlJs({
      locateFile: (file) =>
        path.join(__dirname, "..", "node_modules", "sql.js", "dist", file),
    });
    const db = new SQL.Database(fs.readFileSync(tmp));
    try {
      const accessToken = readKey(db, "cursorAuth/accessToken");
      if (!accessToken) {
        throw new Error("cursorAuth/accessToken missing — are you signed into Cursor?");
      }
      return {
        accessToken,
        refreshToken: readKey(db, "cursorAuth/refreshToken"),
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
