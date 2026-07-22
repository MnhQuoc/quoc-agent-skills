#!/usr/bin/env node
/**
 * Cursor hooks → API token usage.
 * - beforeSubmitPrompt: ghi timestamp thật khi user gửi câu hỏi (trước billing).
 * - afterAgentResponse / stop: cập nhật metadata session (câu hỏi, trạng thái).
 */

const fs = require("fs/promises");
const { extractUserQuery, parseTranscriptUserQueries } = require("../../lib/transcriptParse");
const { normalizeQueryText } = require("../../lib/textEncoding");

const API_BASE = process.env.TOKEN_USAGE_API || "http://localhost:4322";
const CHAT_SESSION_SLUG = "cursor-chat";
const MAX_RESPONSE_CHARS = 120_000;

function truncateText(text, max = MAX_RESPONSE_CHARS) {
  const value = String(text || "");
  return value.length <= max ? value : value.slice(0, max);
}

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

async function postJson(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

async function readTranscriptUserQueries(transcriptPath) {
  if (!transcriptPath) return [];
  try {
    const raw = await fs.readFile(transcriptPath, "utf8");
    return parseTranscriptUserQueries(raw);
  } catch {
    return [];
  }
}

async function handleBeforeSubmitPrompt(input) {
  const conversationId = input.conversation_id;
  const promptText = normalizeQueryText(extractUserQuery(input.prompt));
  if (!conversationId || !promptText) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  await postJson("/api/token-usage/query-event", {
    conversationId,
    promptText,
    at: new Date().toISOString(),
    skillSlug: CHAT_SESSION_SLUG,
    model: input.model || "",
  });

  console.log(JSON.stringify({ continue: true }));
}

async function handleSessionUpdate(input, { sessionEnded = false } = {}) {
  const conversationId = input.conversation_id;
  const responseText = input.text || "";
  // Nội dung + timestamp chuẩn đã ghi qua beforeSubmitPrompt (UTF-8 đúng), nhưng lượt nào
  // hook đó không bắn được (ví dụ prompt kèm ảnh) thì vẫn cần transcript làm nguồn dự phòng —
  // gửi kèm để server tự chọn bản tốt hơn, tránh mất câu hỏi/timestamp của các lượt sau.
  const transcriptQueries = await readTranscriptUserQueries(input.transcript_path);
  const turnCount = transcriptQueries.length || undefined;

  if (!conversationId || (!responseText && !turnCount && !sessionEnded)) {
    return;
  }

  await postJson("/api/token-usage/log", {
    mode: "session",
    conversationId,
    skillSlug: CHAT_SESSION_SLUG,
    responseText: truncateText(responseText),
    userQueries: transcriptQueries.map((row) => row.text),
    userQueryEvents: transcriptQueries.filter((row) => row.at),
    turnCount,
    sessionEnded,
    status: sessionEnded ? "completed" : "in_progress",
    model: input.model || "",
  });
}

async function main() {
  const input = await readStdinJson();
  const event = input.hook_event_name || "";

  if (event === "beforeSubmitPrompt") {
    await handleBeforeSubmitPrompt(input);
    return;
  }

  if (event === "afterAgentResponse") {
    await handleSessionUpdate(input);
    return;
  }

  if (event === "stop") {
    await handleSessionUpdate(input, { sessionEnded: true });
  }
}

main().catch((err) => {
  console.error("[token-report]", err.message);
  if (process.argv.includes("--strict")) process.exit(1);
});
