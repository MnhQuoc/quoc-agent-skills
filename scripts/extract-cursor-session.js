#!/usr/bin/env node
/**
 * Ghi CURSOR_SESSION_TOKEN (JWT accessToken) vào .env từ Cursor state.vscdb.
 * Cookie billing sẽ được build tự động dạng sub::jwt khi gọi API.
 */
const fs = require("fs");
const path = require("path");
const { readAccessTokenFromDb, getCursorStatePaths } = require("../lib/cursorSessionAuth");

const ENV_PATH = path.join(__dirname, "..", ".env");

function upsertEnvToken(token) {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  const line = `CURSOR_SESSION_TOKEN=${token}`;

  if (/^CURSOR_SESSION_TOKEN=.*$/m.test(content)) {
    content = content.replace(/^CURSOR_SESSION_TOKEN=.*$/m, line);
  } else {
    content = `${content.trimEnd()}\n\n# Cursor session (tu dong tu state.vscdb)\n${line}\n`;
  }
  fs.writeFileSync(ENV_PATH, content, "utf8");
}

function main() {
  const { live, backup } = getCursorStatePaths();
  const token = readAccessTokenFromDb(live) || readAccessTokenFromDb(backup);

  if (!token) {
    console.error("Khong tim thay cursorAuth/accessToken. Hay dang nhap Cursor IDE.");
    process.exit(1);
  }

  upsertEnvToken(token);
  console.log("Da ghi CURSOR_SESSION_TOKEN vao .env");
}

main();
