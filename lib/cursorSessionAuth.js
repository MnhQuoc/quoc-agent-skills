const fs = require("fs");
const os = require("os");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const ACCESS_TOKEN_KEY = "cursorAuth/accessToken";

function getCursorStatePaths() {
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const base = path.join(appData, "Cursor", "User", "globalStorage");
  return {
    live: path.join(base, "state.vscdb"),
    backup: path.join(base, "state.vscdb.backup"),
  };
}

function decodeJwtSub(token) {
  const payloadPart = token.split(".")[1];
  if (!payloadPart) throw new Error("JWT không hợp lệ");

  const padded = payloadPart + "=".repeat((4 - (payloadPart.length % 4)) % 4);
  const payload = JSON.parse(Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  const sub = payload.sub;
  if (!sub) throw new Error("JWT thiếu claim sub");

  return sub.includes("|") ? sub.split("|")[1] : sub;
}

function readAccessTokenFromDb(dbPath) {
  if (!fs.existsSync(dbPath)) return null;

  let tmpDir;
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-state-"));
    const tmpDb = path.join(tmpDir, "state.vscdb");
    fs.copyFileSync(dbPath, tmpDb);

    for (const suffix of ["-wal", "-shm"]) {
      const src = `${dbPath}${suffix}`;
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, `${tmpDb}${suffix}`);
      }
    }

    const db = new DatabaseSync(tmpDb, { readOnly: true });
    const row = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get(ACCESS_TOKEN_KEY);
    db.close();
    if (!row?.value) return null;
    return Buffer.isBuffer(row.value) ? row.value.toString("utf8") : String(row.value);
  } catch {
    return null;
  } finally {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

function buildSessionCookie(accessToken) {
  const sub = decodeJwtSub(accessToken);
  return `WorkosCursorSessionToken=${sub}%3A%3A${accessToken}`;
}

function resolveCursorSessionCookie() {
  const rawCookie = process.env.CURSOR_SESSION_COOKIE?.trim();
  if (rawCookie) return rawCookie;

  const manual = process.env.CURSOR_SESSION_TOKEN?.trim();
  if (manual) {
    if (manual.includes("%3A%3A") || manual.includes("::")) {
      return manual.startsWith("WorkosCursorSessionToken=")
        ? manual
        : `WorkosCursorSessionToken=${manual.replace("::", "%3A%3A")}`;
    }
    return buildSessionCookie(manual);
  }

  const { live, backup } = getCursorStatePaths();
  const accessToken = readAccessTokenFromDb(live) || readAccessTokenFromDb(backup);
  if (!accessToken) {
    return "";
  }

  return buildSessionCookie(accessToken);
}

module.exports = {
  resolveCursorSessionCookie,
  decodeJwtSub,
  buildSessionCookie,
  readAccessTokenFromDb,
  getCursorStatePaths,
};
