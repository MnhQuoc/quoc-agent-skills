// Khi prompt kèm ảnh/file, Cursor có thể gửi `input.prompt` dạng mảng nhiều phần
// (text + ảnh) hoặc object thay vì chuỗi thuần — cần bóc phần text ra trước,
// nếu không hook sẽ bỏ qua lượt đó (không ghi được timestamp thật) và hệ thống
// phải rơi về đọc transcript (dễ bị mojibake).
const { normalizeQueryText } = require("./textEncoding");

function coercePromptToText(value) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value
      .map((part) => coercePromptToText(typeof part === "string" ? part : part?.text ?? part?.content))
      .filter(Boolean)
      .join("\n");
  }
  if (typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    if (typeof value.content === "string") return value.content;
    if (Array.isArray(value.content)) return coercePromptToText(value.content);
  }
  return "";
}

function extractUserQuery(text) {
  if (!text) return "";
  const value = coercePromptToText(text);
  if (!value) return "";
  const match = value.match(/<user_query>([\s\S]*?)<\/user_query>/i);
  if (match) return match[1].trim();
  return value.trim();
}

function parseTimestampValue(raw) {
  if (raw == null) return null;
  const date = raw instanceof Date ? raw : new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

function parseEmbeddedTimestamp(text) {
  if (!text) return null;
  const match = String(text).match(/<timestamp>([\s\S]*?)<\/timestamp>/i);
  if (!match) return null;
  return parseTimestampValue(match[1].trim());
}

function parseMessageTimestamp(msg) {
  const raw = msg?.createdAt ?? msg?.timestamp ?? msg?.time ?? msg?.created_at;
  return parseTimestampValue(raw);
}

function extractMessageText(msg) {
  if (typeof msg?.text === "string") return msg.text;
  if (typeof msg?.content === "string") return msg.content;
  if (typeof msg?.rawText === "string") return msg.rawText;
  if (typeof msg?.message === "string") return msg.message;

  const content = msg?.message?.content;
  if (Array.isArray(content)) {
    return content
      .filter((part) => part?.type === "text" && part?.text)
      .map((part) => part.text)
      .join("\n");
  }

  return "";
}

function isUserMessage(msg) {
  const role = String(msg?.type || msg?.role || "").toLowerCase();
  return role === "user" || role === "human" || role === "1" || msg?.isUser === true;
}

function parseTranscriptMessages(raw) {
  if (!raw?.trim()) return [];

  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data?.messages)) return data.messages;
    if (Array.isArray(data?.conversation)) return data.conversation;
    if (Array.isArray(data)) return data;
  } catch {
    // JSONL: mỗi dòng là một message/event.
  }

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const row = JSON.parse(line);
        return row?.type === "turn_ended" ? [] : [row];
      } catch {
        return [];
      }
    });
}

function parseTranscriptUserQueries(raw) {
  return parseTranscriptMessages(raw)
    .filter(isUserMessage)
    .map((msg) => {
      const body = extractMessageText(msg);
      const text = normalizeQueryText(extractUserQuery(body));
      if (!text) return null;

      const at = parseMessageTimestamp(msg) || parseEmbeddedTimestamp(body);
      return {
        text,
        at: at ? at.toISOString() : null,
      };
    })
    .filter(Boolean)
    .slice(0, 20);
}

module.exports = {
  extractUserQuery,
  parseEmbeddedTimestamp,
  parseMessageTimestamp,
  extractMessageText,
  parseTranscriptMessages,
  parseTranscriptUserQueries,
};
