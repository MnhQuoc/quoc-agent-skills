require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { connectDB } = require("../lib/db");
const TokenLog = require("../lib/models/TokenLog");
const { parseTranscriptUserQueries } = require("../lib/transcriptParse");
const { mergeUserQueryEvents } = require("../lib/tokenUsage");

const TRANSCRIPT = process.argv[2];

async function main() {
  await connectDB();
  const log = await TokenLog.findOne({ source: "cursor-ide" }).sort({ updatedAt: -1 });
  if (!log) {
    console.log("Không có session cursor-ide.");
    return;
  }

  if (!TRANSCRIPT) {
    console.log("Cần truyền đường dẫn transcript JSONL.");
    process.exit(1);
  }

  const raw = fs.readFileSync(path.resolve(TRANSCRIPT), "utf8");
  const parsed = parseTranscriptUserQueries(raw).map((row) => ({
    text: row.text,
    at: new Date(row.at),
  }));
  const merged = mergeUserQueryEvents([], parsed);

  log.userQueryEvents = merged;
  log.userQueries = merged.map((row) => row.text);
  log.turnCount = merged.length;
  await log.save();

  console.log(
    JSON.stringify(
      merged.map((row) => ({
        text: row.text.slice(0, 50),
        at: row.at.toISOString(),
      })),
      null,
      2
    )
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
