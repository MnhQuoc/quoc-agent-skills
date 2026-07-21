const TokenLog = require("./models/TokenLog");
const { encode } = require("gpt-tokenizer");

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// "cursor-chat" = chat thường (không gõ đúng /ten-skill nào có thật) - không tính là chạy skill,
// nên loại khỏi tổng hợp/theo skill/gần đây để dashboard chỉ hiện các skill thật.
const NON_SKILL_SLUG = "cursor-chat";

// Cursor tự chèn thêm context hệ thống (<manually_attached_skills>, <timestamp>, rule...) phía
// trước nội dung user gõ trong Cursor IDE - chỉ giữ lại phần trong <user_query> để hiển thị
// gọn, không ảnh hưởng số token (vẫn ước lượng trên text gốc đầy đủ).
function cleanPromptPreview(text) {
  if (!text) return "";
  const queries = [...text.matchAll(/<user_query>([\s\S]*?)<\/user_query>/g)].map((m) => m[1].trim()).filter(Boolean);
  if (queries.length > 0) return queries.join(" | ");
  return text;
}

function usageFields(usage) {
  return {
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    cacheReadTokens: usage?.cacheReadTokens ?? 0,
    cacheWriteTokens: usage?.cacheWriteTokens ?? 0,
    reasoningTokens: usage?.reasoningTokens ?? 0,
    totalTokens: usage?.totalTokens ?? 0,
  };
}

async function logTokenUsage({ skillSlug, runId, status, usage, promptPreview, source, estimated, model }) {
  return TokenLog.create({
    skillSlug,
    runId: runId || "",
    status: status || "unknown",
    promptPreview: (promptPreview || "").slice(0, 300),
    source: source || "sdk",
    estimated: !!estimated,
    model: model || "",
    ...usageFields(usage),
  });
}

// Không có API nào trả về token thật khi user chạy skill trực tiếp trong Cursor IDE
// (hooks của Cursor không expose usage). Ta ước lượng bằng tokenizer BPE (cl100k_base) trên
// text prompt/response lấy từ transcript - đủ để có con số tương đối, không phải số billing chính xác.
function estimateTokenCount(text) {
  if (!text || typeof text !== "string") return 0;
  try {
    return encode(text).length;
  } catch {
    // fallback thô nếu tokenizer lỗi với input lạ: ~4 ký tự/token
    return Math.ceil(text.length / 4);
  }
}

async function logCursorIdeUsage({ skillSlug, promptText, responseText, status, model, conversationId }) {
  const inputTokens = estimateTokenCount(promptText);
  const outputTokens = estimateTokenCount(responseText);
  return logTokenUsage({
    skillSlug: skillSlug || NON_SKILL_SLUG,
    runId: conversationId || "",
    status: status || "completed",
    promptPreview: cleanPromptPreview(promptText),
    source: "cursor-ide",
    estimated: true,
    model,
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    },
  });
}

async function getTodayUsage() {
  const since = startOfToday();
  const logs = await TokenLog.find({ createdAt: { $gte: since }, skillSlug: { $ne: NON_SKILL_SLUG } }).lean();

  const totals = {
    runCount: logs.length,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    reasoningTokens: 0,
  };

  const bySkillMap = {};

  for (const log of logs) {
    totals.inputTokens += log.inputTokens || 0;
    totals.outputTokens += log.outputTokens || 0;
    totals.totalTokens += log.totalTokens || 0;
    totals.reasoningTokens += log.reasoningTokens || 0;

    if (!bySkillMap[log.skillSlug]) {
      bySkillMap[log.skillSlug] = { skillSlug: log.skillSlug, runCount: 0, totalTokens: 0 };
    }
    bySkillMap[log.skillSlug].runCount += 1;
    bySkillMap[log.skillSlug].totalTokens += log.totalTokens || 0;
  }

  return {
    date: since.toISOString().slice(0, 10),
    ...totals,
    bySkill: Object.values(bySkillMap).sort((a, b) => b.totalTokens - a.totalTokens),
  };
}

async function getRecentLogs(limit = 20) {
  const logs = await TokenLog.find({ skillSlug: { $ne: NON_SKILL_SLUG } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return logs.map((log) => ({
    id: String(log._id),
    skillSlug: log.skillSlug,
    runId: log.runId,
    status: log.status,
    totalTokens: log.totalTokens,
    inputTokens: log.inputTokens,
    outputTokens: log.outputTokens,
    promptPreview: log.promptPreview,
    source: log.source || "sdk",
    estimated: !!log.estimated,
    model: log.model || "",
    createdAt: log.createdAt,
  }));
}

module.exports = {
  logTokenUsage,
  logCursorIdeUsage,
  estimateTokenCount,
  getTodayUsage,
  getRecentLogs,
  usageFields,
};
