const TokenLog = require("./models/TokenLog");
const { encode } = require("gpt-tokenizer");
const { fetchCursorUsageCsv } = require("./cursorUsageCsv");
const { mergeBillingWithSessions } = require("./billingSessionMatch");
const {
  looksCorruptedText,
  normalizeQueryText,
  pickBetterText,
} = require("./textEncoding");

const CHAT_SESSION_SLUG = "cursor-chat";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function extractSessionTitle(text) {
  return normalizeQueryText(text);
}

function cleanPromptPreview(text) {
  return extractSessionTitle(text);
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

function estimateTokenCount(text) {
  if (!text || typeof text !== "string") return 0;
  try {
    return encode(text).length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}

function backfillQueryEventsFromQueries(queries, events, createdAt, updatedAt) {
  const normalizedEvents = mergeUserQueryEvents([], events || []);
  if (!queries?.length || normalizedEvents.length >= queries.length) {
    return normalizedEvents;
  }

  const eventByText = new Map(normalizedEvents.map((row) => [row.text, row]));
  const startMs = new Date(createdAt).getTime();
  const endMs = new Date(updatedAt || createdAt).getTime();
  const spanMs = Math.max(endMs - startMs, 1);

  return queries.map((text, index) => {
    const known = eventByText.get(text);
    if (known) return known;
    const ratio = queries.length === 1 ? 0 : index / (queries.length - 1);
    return {
      text,
      at: new Date(startMs + spanMs * ratio),
    };
  });
}

function resolveStoredUserQueries(log, userQueryEvents) {
  const eventQueries = userQueryEvents.map((row) => row.text).filter(Boolean);
  const storedQueries = (Array.isArray(log.userQueries) ? log.userQueries : [])
    .map((query) => normalizeQueryText(query))
    .filter((query) => query && !looksCorruptedText(query));
  // Events từ beforeSubmitPrompt là UTF-8 đúng — ưu tiên trước transcript.
  return mergeUserQueries(eventQueries, storedQueries);
}

function mapLogRow(log) {
  const userQueryEvents = mergeUserQueryEvents([], log.userQueryEvents || []).map((row) => ({
    text: row.text || "",
    at: row.at ? new Date(row.at).toISOString() : null,
  }));
  const userQueries = resolveStoredUserQueries(log, userQueryEvents);
  const sessionTitle =
    userQueries[0] ||
    normalizeQueryText(log.sessionTitle) ||
    normalizeQueryText(log.promptPreview);
  return {
    id: String(log._id),
    skillSlug: log.skillSlug,
    runId: log.runId,
    conversationId: log.runId,
    status: log.status,
    totalTokens: log.totalTokens,
    inputTokens: log.inputTokens,
    outputTokens: log.outputTokens,
    promptPreview: sessionTitle,
    sessionTitle,
    userQueries,
    userQueryEvents,
    source: log.source || "sdk",
    estimated: !!log.estimated,
    model: log.model || "",
    turnCount: log.turnCount || 0,
    sessionEnded: !!log.sessionEnded,
    durationMs: log.durationMs || 0,
    createdAt: log.createdAt,
    updatedAt: log.updatedAt,
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

function mergeUserQueries(existingQueries, incomingQueries) {
  const merged = [];
  const seen = new Set();

  for (const query of [...(existingQueries || []), ...(incomingQueries || [])]) {
    const normalized = normalizeQueryText(query);
    if (!normalized || seen.has(normalized)) continue;
    if (looksCorruptedText(normalized) && merged.some((row) => !looksCorruptedText(row))) continue;
    seen.add(normalized);
    merged.push(normalized);
  }

  return merged.slice(0, 20);
}

function parseQueryEventAt(value) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

// Chỉ coi 2 event là "cùng 1 lượt chat" (báo trùng bởi 2 nguồn khác nhau — hook
// beforeSubmitPrompt vs transcript) khi văn bản khớp/gần khớp nhau; nếu chỉ dựa
// vào khoảng cách thời gian (như trước, 45s) sẽ gộp nhầm các lượt chat KHÁC NHAU
// gửi liên tiếp nhanh (ví dụ test nhiều câu ngắn), làm mất câu bị gộp đè.
const DUPLICATE_EVENT_WINDOW_MS = 5_000;

function isLikelySameTurnText(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.startsWith(b) || b.startsWith(a);
}

function mergeUserQueryEvents(existingEvents, incomingEvents) {
  const events = [...(existingEvents || []), ...(incomingEvents || [])]
    .map((row) => ({
      text: normalizeQueryText(row?.text),
      at: parseQueryEventAt(row?.at),
    }))
    .filter((row) => row.text && row.at)
    .sort((a, b) => a.at - b.at);

  const deduped = [];

  for (const event of events) {
    const near = deduped.find(
      (prev) =>
        Math.abs(prev.at - event.at) <= DUPLICATE_EVENT_WINDOW_MS &&
        isLikelySameTurnText(prev.text, event.text)
    );
    if (!near) {
      deduped.push({ text: event.text, at: event.at });
      continue;
    }

    near.text = pickBetterText(near.text, event.text);
    if (event.at < near.at) {
      near.at = event.at;
    }
  }

  return deduped.slice(0, 20);
}

function buildQueryEventsFromQueries(queries, fallbackAt) {
  const at = parseQueryEventAt(fallbackAt);
  if (!at || !queries?.length) return [];

  // Chỉ gán fallback cho 1 câu — tránh gán cùng timestamp cho nhiều câu trong transcript.
  if (queries.length > 1) return [];

  const text = normalizeQueryText(queries[0]);
  return text && !looksCorruptedText(text) ? [{ text, at }] : [];
}

// Cursor IDE bắn nhiều hook gần như đồng thời cho cùng 1 lượt chat
// (afterAgentResponse + stop), nên đọc-rồi-ghi (find -> findOneAndUpdate)
// có thể bị race: request A đọc dữ liệu cũ, request B ghi trước, rồi A ghi
// đè lại bằng số liệu cũ hơn (turnCount bị "lùi"). Để tránh mất update,
// dùng optimistic concurrency: đọc lại + so khớp `revision` (CAS) mỗi lần
// ghi, retry nếu có ai khác vừa cập nhật trước.
const MAX_UPSERT_ATTEMPTS = 8;

async function upsertCursorIdeSession({
  conversationId,
  skillSlug,
  promptText,
  responseText,
  firstPrompt,
  userQueries,
  userQueryEvents,
  queryAt,
  status,
  model,
  turnCount,
  sessionEnded,
  durationMs,
}) {
  if (!conversationId) {
    throw new Error("conversationId là bắt buộc cho session log");
  }

  const previewSource = firstPrompt || promptText || "";
  const incomingQueries = (Array.isArray(userQueries) ? userQueries : [])
    .map((query) => extractSessionTitle(String(query || "")).trim())
    .filter(Boolean);
  const fallbackTitle = extractSessionTitle(previewSource).slice(0, 300);
  const promptEventText = extractSessionTitle(String(promptText || "")).trim();
  const incomingEvents = mergeUserQueryEvents(
    Array.isArray(userQueryEvents) ? userQueryEvents : [],
    promptEventText && queryAt ? [{ text: promptEventText, at: queryAt }] : []
  );

  const incomingInputTokens = estimateTokenCount(promptText);
  const incomingOutputTokens = estimateTokenCount(responseText);
  const incomingUsage = {
    inputTokens: incomingInputTokens,
    outputTokens: incomingOutputTokens,
    totalTokens: incomingInputTokens + incomingOutputTokens,
  };

  for (let attempt = 0; attempt < MAX_UPSERT_ATTEMPTS; attempt++) {
    const existing = await TokenLog.findOne({ runId: conversationId, source: "cursor-ide" });

    // Luôn merge để không mất câu hỏi cũ khi hook gửi transcript chưa kịp cập nhật.
    const mergedEvents = mergeUserQueryEvents(
      existing?.userQueryEvents,
      incomingEvents.length
        ? incomingEvents
        : buildQueryEventsFromQueries(incomingQueries, queryAt || existing?.updatedAt || new Date())
    );
    const mergedQueries = mergeUserQueries(
      mergeUserQueries(existing?.userQueries, incomingQueries),
      mergedEvents.map((row) => row.text)
    );
    const mergedEventsWithBackfill = backfillQueryEventsFromQueries(
      mergedQueries,
      mergedEvents,
      existing?.createdAt || queryAt || new Date(),
      existing?.updatedAt || queryAt || new Date()
    );
    const mergedTurnCount = Math.max(
      existing?.turnCount || 0,
      turnCount || 0,
      mergedEventsWithBackfill.length,
      mergedQueries.length,
      incomingQueries.length
    );
    const sessionTitle = (
      mergedEventsWithBackfill[0]?.text ||
      mergedQueries[0] ||
      normalizeQueryText(existing?.sessionTitle) ||
      fallbackTitle
    ).slice(0, 300);

    const useIncomingTokens =
      !existing ||
      mergedTurnCount > (existing.turnCount || 0) ||
      incomingUsage.totalTokens >= (existing.totalTokens || 0);
    const tokenFields = useIncomingTokens ? usageFields(incomingUsage) : usageFields(existing);

    const setFields = {
      skillSlug: skillSlug || existing?.skillSlug || CHAT_SESSION_SLUG,
      status: status || existing?.status || "completed",
      sessionTitle,
      promptPreview: sessionTitle,
      userQueries: mergedQueries,
      userQueryEvents: mergedEventsWithBackfill,
      estimated: true,
      model: model || existing?.model || "",
      turnCount: mergedTurnCount,
      sessionEnded:
        !!sessionEnded || !!existing?.sessionEnded || status === "completed",
      durationMs: (() => {
        const ended =
          !!sessionEnded || !!existing?.sessionEnded || status === "completed";
        const spanMs =
          ended && existing?.createdAt
            ? Date.now() - new Date(existing.createdAt).getTime()
            : 0;
        return Math.max(durationMs || 0, existing?.durationMs || 0, spanMs);
      })(),
      ...tokenFields,
    };

    if (!existing) {
      try {
        return await TokenLog.create({
          runId: conversationId,
          source: "cursor-ide",
          revision: 1,
          ...setFields,
        });
      } catch (err) {
        if (err?.code === 11000) continue; // Bị race lúc tạo — thử lại như update.
        throw err;
      }
    }

    // Bản ghi cũ (tạo trước khi thêm `revision`) không có field này trong DB,
    // nên query {revision: 0} sẽ không khớp. Coi "thiếu field" tương đương revision 0.
    const currentRevision = existing.revision || 0;
    const revisionFilter = currentRevision
      ? { revision: currentRevision }
      : { $or: [{ revision: 0 }, { revision: { $exists: false } }] };

    const updated = await TokenLog.findOneAndUpdate(
      { _id: existing._id, ...revisionFilter },
      { $set: setFields, $inc: { revision: 1 } },
      { returnDocument: "after" }
    );
    if (updated) return updated;
    // Ai đó vừa cập nhật trước — đọc lại dữ liệu mới nhất và thử lại.
  }

  throw new Error(`Không cập nhật được session log sau ${MAX_UPSERT_ATTEMPTS} lần thử: ${conversationId}`);
}

async function recordUserQueryEvent({ conversationId, promptText, at, skillSlug, model }) {
  const text = extractSessionTitle(String(promptText || "")).trim();
  const eventAt = parseQueryEventAt(at) || new Date();
  if (!conversationId || !text) {
    throw new Error("conversationId và promptText là bắt buộc");
  }

  return upsertCursorIdeSession({
    conversationId,
    skillSlug,
    promptText: text,
    userQueryEvents: [{ text, at: eventAt }],
    queryAt: eventAt,
    model,
    turnCount: 1,
  });
}

async function getSessionLog(conversationId) {
  const log = await TokenLog.findOne({ runId: conversationId, source: "cursor-ide" }).lean();
  return log ? mapLogRow(log) : null;
}

async function getTodayUsage() {
  const since = startOfToday();
  const logs = await TokenLog.find({ updatedAt: { $gte: since } }).lean();

  const sessionLogs = logs.filter((log) => log.source === "cursor-ide");
  const totals = {
    runCount: logs.length,
    sessionCount: sessionLogs.length,
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
  const logs = await TokenLog.find()
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();
  return logs.map(mapLogRow);
}

async function getRecentSessions(limit = 20) {
  const logs = await TokenLog.find({ source: "cursor-ide" })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();
  return logs.map(mapLogRow);
}

async function getCursorIdeSessionsInRange(start, end) {
  return TokenLog.find({
    source: "cursor-ide",
    $or: [
      { createdAt: { $gte: start, $lte: end } },
      { updatedAt: { $gte: start, $lte: end } },
      { createdAt: { $lte: start }, updatedAt: { $gte: end } },
      { "userQueryEvents.at": { $gte: start, $lte: end } },
    ],
  })
    .sort({ updatedAt: -1 })
    .lean();
}

function sanitizeStoredSession(log) {
  const normalizedEvents = mergeUserQueryEvents([], log.userQueryEvents || []);
  const userQueries = resolveStoredUserQueries(log, normalizedEvents);
  const userQueryEvents = backfillQueryEventsFromQueries(
    userQueries,
    normalizedEvents,
    log.createdAt,
    log.updatedAt || log.createdAt
  );
  const sessionTitle = (
    userQueries[0] ||
    normalizeQueryText(log.sessionTitle) ||
    normalizeQueryText(log.promptPreview)
  ).slice(0, 300);

  const sessionEnded = !!log.sessionEnded || log.status === "completed";
  const durationMs =
    log.durationMs ||
    (sessionEnded && log.createdAt && log.updatedAt
      ? Math.max(0, new Date(log.updatedAt).getTime() - new Date(log.createdAt).getTime())
      : 0);

  return {
    userQueryEvents,
    userQueries,
    sessionTitle,
    promptPreview: sessionTitle,
    turnCount: Math.max(log.turnCount || 0, userQueryEvents.length, userQueries.length),
    sessionEnded,
    durationMs,
  };
}

async function repairCursorIdeSessions() {
  const logs = await TokenLog.find({ source: "cursor-ide" });
  let repaired = 0;

  for (const log of logs) {
    const sanitized = sanitizeStoredSession(log);
    const eventsJson = JSON.stringify(sanitized.userQueryEvents);
    const beforeJson = JSON.stringify(log.userQueryEvents || []);
    const queriesJson = JSON.stringify(sanitized.userQueries);
    const beforeQueries = JSON.stringify(log.userQueries || []);

    if (
      eventsJson === beforeJson &&
      queriesJson === beforeQueries &&
      sanitized.sessionTitle === (log.sessionTitle || log.promptPreview || "") &&
      sanitized.sessionEnded === !!log.sessionEnded &&
      sanitized.durationMs === (log.durationMs || 0)
    ) {
      continue;
    }

    log.userQueryEvents = sanitized.userQueryEvents;
    log.userQueries = sanitized.userQueries;
    log.sessionTitle = sanitized.sessionTitle;
    log.promptPreview = sanitized.promptPreview;
    log.turnCount = sanitized.turnCount;
    log.sessionEnded = sanitized.sessionEnded;
    log.durationMs = sanitized.durationMs;
    await log.save();
    repaired += 1;
  }

  return { total: logs.length, repaired };
}

async function getBillingSessions({
  days = 7,
  startDate,
  endDate,
  tolerance = "30s",
  sessionBuffer = "3min",
} = {}) {
  const { events, dateRange } = await fetchCursorUsageCsv({ days, startDate, endDate });
  const mongoSessions = await getCursorIdeSessionsInRange(dateRange.start, dateRange.end);
  const merged = mergeBillingWithSessions(events, mongoSessions, { tolerance, sessionBuffer });

  return {
    dateRange: {
      start: dateRange.start.toISOString(),
      end: dateRange.end.toISOString(),
      startMs: dateRange.start.getTime(),
      endMs: dateRange.end.getTime(),
    },
    ...merged.stats,
    totals: merged.totals,
    sessions: merged.sessions,
    unmatchedEvents: merged.unmatchedEvents.slice(0, 20).map((row) => ({
      date: row.date,
      eventTime: row.eventTime,
      model: row.model,
      totalTokens: row.totalTokens,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
    })),
  };
}

module.exports = {
  CHAT_SESSION_SLUG,
  logTokenUsage,
  upsertCursorIdeSession,
  recordUserQueryEvent,
  getSessionLog,
  estimateTokenCount,
  getTodayUsage,
  getRecentLogs,
  getRecentSessions,
  getBillingSessions,
  repairCursorIdeSessions,
  sanitizeStoredSession,
  usageFields,
  cleanPromptPreview,
  extractSessionTitle,
  mergeUserQueryEvents,
};
