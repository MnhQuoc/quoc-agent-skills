const TokenLog = require("./models/TokenLog");

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
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

async function logTokenUsage({ skillSlug, runId, status, usage, promptPreview }) {
  return TokenLog.create({
    skillSlug,
    runId: runId || "",
    status: status || "unknown",
    promptPreview: (promptPreview || "").slice(0, 300),
    ...usageFields(usage),
  });
}

async function getTodayUsage() {
  const since = startOfToday();
  const logs = await TokenLog.find({ createdAt: { $gte: since } }).lean();

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
  const logs = await TokenLog.find().sort({ createdAt: -1 }).limit(limit).lean();
  return logs.map((log) => ({
    id: String(log._id),
    skillSlug: log.skillSlug,
    runId: log.runId,
    status: log.status,
    totalTokens: log.totalTokens,
    inputTokens: log.inputTokens,
    outputTokens: log.outputTokens,
    promptPreview: log.promptPreview,
    createdAt: log.createdAt,
  }));
}

module.exports = { logTokenUsage, getTodayUsage, getRecentLogs, usageFields };
