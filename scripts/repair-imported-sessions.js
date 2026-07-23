require("dotenv").config();

const fs = require("fs");
const path = require("path");
const os = require("os");
const { connectDB } = require("../lib/db");
const TokenLog = require("../lib/models/TokenLog");
const { parseTranscriptUserQueries } = require("../lib/transcriptParse");
const {
  filterUserQueryTexts,
  filterUserQueryEvents,
  hasActivityOnOrAfter,
  startOfTodayMs,
} = require("../lib/textEncoding");

function findTranscriptPath(conversationId) {
  const cursorProjects = path.join(os.homedir(), ".cursor", "projects");
  const candidates = [];

  try {
    for (const entry of fs.readdirSync(cursorProjects, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      candidates.push(
        path.join(cursorProjects, entry.name, "agent-transcripts", conversationId, `${conversationId}.jsonl`)
      );
    }
  } catch {
    return null;
  }

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

async function repairSession(log) {
  const conversationId = log.runId;
  const transcriptPath = findTranscriptPath(conversationId);
  let events = filterUserQueryEvents(log.userQueryEvents || []);
  let queries = filterUserQueryTexts(log.userQueries || []);

  if (transcriptPath) {
    const raw = fs.readFileSync(transcriptPath, "utf8");
    const parsed = parseTranscriptUserQueries(raw).map((row) => ({
      text: row.text,
      at: row.at ? new Date(row.at) : null,
    }));
    events = filterUserQueryEvents(parsed);
    queries = filterUserQueryTexts(parsed.map((row) => row.text));
  }

  if (!queries.length && !events.length) {
    await TokenLog.deleteOne({ _id: log._id });
    return { action: "deleted", conversationId };
  }

  log.userQueries = queries;
  log.userQueryEvents = events;
  log.turnCount = Math.max(events.length, queries.length);
  log.sessionTitle = (queries[0] || log.sessionTitle || "").slice(0, 300);
  log.promptPreview = log.sessionTitle;
  await log.save();

  return {
    action: "repaired",
    conversationId,
    turnCount: log.turnCount,
    hasTodayActivity: hasActivityOnOrAfter(events, startOfTodayMs()),
  };
}

async function main() {
  await connectDB();
  const logs = await TokenLog.find({ source: "cursor-ide" });
  const results = [];

  for (const log of logs) {
    results.push(await repairSession(log));
  }

  const summary = {
    total: results.length,
    deleted: results.filter((row) => row.action === "deleted").length,
    repaired: results.filter((row) => row.action === "repaired").length,
    todaySessions: results.filter((row) => row.hasTodayActivity).length,
  };

  console.log(JSON.stringify(summary, null, 2));
  console.log(
    results
      .filter((row) => row.action !== "deleted")
      .map((row) => `${row.conversationId}: ${row.turnCount} lượt, hôm nay=${row.hasTodayActivity}`)
      .join("\n")
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
