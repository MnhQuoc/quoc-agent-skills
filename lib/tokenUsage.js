const TokenLog = require("./models/TokenLog");
const fs = require("fs/promises");
const path = require("path");
const {
  fetchCursorUsageCsv,
  downloadAndSaveUsageCsv,
  parseCursorUsageCsv,
  DEFAULT_CSV_FILENAME,
  CSV_DIR,
  resolveDateRange,
} = require("./cursorUsageCsv");
const { mergeBillingWithSessions } = require("./billingSessionMatch");
const {
  looksCorruptedText,
  normalizeQueryText,
  pickBetterText,
  filterUserQueryTexts,
  filterUserQueryEvents,
  startOfTodayMs,
  hasActivityOnOrAfter,
  isInternalCursorPrompt,
} = require("./textEncoding");
const { resolveSessionSkillSlug } = require("./skillDetect");

const CHAT_SESSION_SLUG = "cursor-chat";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function isLogActiveInRange(log, startMs, endMs) {
  const events = filterUserQueryEvents(log.userQueryEvents || []);
  if (events.length) {
    return events.some((row) => {
      const ts = new Date(row.at).getTime();
      return Number.isFinite(ts) && ts >= startMs && ts <= endMs;
    });
  }
  const ts = new Date(log.updatedAt || log.createdAt).getTime();
  return Number.isFinite(ts) && ts >= startMs && ts <= endMs;
}

function extractSessionTitle(text) {
  return normalizeQueryText(text);
}

function cleanPromptPreview(text) {
  return extractSessionTitle(text);
}

function backfillQueryEventsFromQueries(queries, events, createdAt, updatedAt) {
  const normalizedEvents = mergeUserQueryEvents([], events || []);
  const hasGoodEvents = normalizedEvents.some((row) => !looksCorruptedText(row.text));
  // Đã có timestamp từ beforeSubmitPrompt — không backfill từ transcript (dễ trùng + mojibake).
  if (hasGoodEvents || !queries?.length) {
    return normalizedEvents;
  }

  if (normalizedEvents.length >= queries.length) {
    return normalizedEvents;
  }

  const eventByText = new Map(normalizedEvents.map((row) => [row.text, row]));
  const startMs = new Date(createdAt).getTime();
  const endMs = new Date(updatedAt || createdAt).getTime();
  const spanMs = Math.max(endMs - startMs, 1);

  return queries
    .map((text, index) => {
      const normalized = normalizeQueryText(text);
      if (!normalized || looksCorruptedText(normalized)) return null;
      const known = eventByText.get(normalized);
      if (known) return known;
      const ratio = queries.length === 1 ? 0 : index / (queries.length - 1);
      return {
        text: normalized,
        at: new Date(startMs + spanMs * ratio),
      };
    })
    .filter(Boolean);
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
  const userQueryEvents = filterUserQueryEvents(
    mergeUserQueryEvents([], log.userQueryEvents || []).map((row) => ({
      text: row.text || "",
      at: row.at,
    }))
  ).map((row) => ({
    text: row.text || "",
    at: row.at ? new Date(row.at).toISOString() : null,
  }));
  const userQueries = filterUserQueryTexts(resolveStoredUserQueries(log, userQueryEvents));
  const sessionTitle =
    userQueries[0] ||
    normalizeQueryText(log.sessionTitle) ||
    normalizeQueryText(log.promptPreview);
  const skillSlug = resolveSessionSkillSlug({
    skillSlug: log.skillSlug,
    existingSkillSlug: log.skillSlug,
    texts: [
      sessionTitle,
      log.sessionTitle,
      log.promptPreview,
      ...userQueries,
      ...userQueryEvents.map((row) => row.text),
    ],
  });
  return {
    id: String(log._id),
    skillSlug,
    runId: log.runId,
    conversationId: log.runId,
    status: log.status,
    promptPreview: sessionTitle,
    sessionTitle,
    userQueries,
    userQueryEvents,
    source: log.source || "sdk",
    model: log.model || "",
    turnCount: log.turnCount || 0,
    sessionEnded: !!log.sessionEnded,
    durationMs: log.durationMs || 0,
    createdAt: log.createdAt,
    updatedAt: log.updatedAt,
  };
}

async function logTokenUsage({ skillSlug, runId, status, promptPreview, source, model }) {
  return TokenLog.create({
    skillSlug,
    runId: runId || "",
    status: status || "unknown",
    promptPreview: (promptPreview || "").slice(0, 300),
    source: source || "sdk",
    model: model || "",
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

// Hook beforeSubmitPrompt vs transcript afterAgentResponse có thể lệch vài phút.
const TRANSCRIPT_PAIR_WINDOW_MS = 180_000;

function isLikelySameTurnText(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.startsWith(b) || b.startsWith(a);
}

function extractTurnAnchor(text) {
  const value = String(text || "");
  const fileRef = value.match(/@[\w./-]+\s*\(\d+-\d+\)/i);
  if (fileRef) return fileRef[0];
  const atRef = value.match(/@[\w./-]+/);
  return atRef ? atRef[0] : "";
}

function isLikelySameTurnEvent(a, b) {
  if (isLikelySameTurnText(a.text, b.text)) return true;

  const dt = Math.abs(a.at - b.at);
  if (dt > TRANSCRIPT_PAIR_WINDOW_MS) return false;

  const aBad = looksCorruptedText(a.text);
  const bBad = looksCorruptedText(b.text);
  if (aBad !== bBad) {
    const anchorA = extractTurnAnchor(a.text);
    const anchorB = extractTurnAnchor(b.text);
    if (anchorA && anchorA === anchorB) return true;
    // Hook vs transcript cùng lượt thường lệch vài chục giây.
    return dt <= 60_000;
  }

  return false;
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
        Math.abs(prev.at - event.at) <= TRANSCRIPT_PAIR_WINDOW_MS &&
        isLikelySameTurnEvent(prev, event)
    );
    if (near) {
      near.text = pickBetterText(near.text, event.text);
      if (event.at < near.at) near.at = event.at;
      continue;
    }

    const prev = deduped[deduped.length - 1];
    if (prev && isLikelySameTurnEvent(prev, event)) {
      prev.text = pickBetterText(prev.text, event.text);
      if (event.at < prev.at) prev.at = event.at;
      continue;
    }

    deduped.push({ text: event.text, at: event.at });
  }

  return deduped.slice(0, 20);
}

function computeSessionDurationMs(events, { createdAt, updatedAt, sessionEnded } = {}) {
  const sorted = (events || [])
    .map((row) => parseQueryEventAt(row?.at))
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (sorted.length >= 2) {
    return sorted[sorted.length - 1] - sorted[0];
  }
  if (sessionEnded && createdAt && updatedAt) {
    return Math.max(0, new Date(updatedAt).getTime() - new Date(createdAt).getTime());
  }
  return 0;
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
  skipStaleImport = false,
}) {
  if (!conversationId) {
    throw new Error("conversationId là bắt buộc cho session log");
  }

  const previewSource = firstPrompt || promptText || "";
  const incomingQueries = filterUserQueryTexts(
    (Array.isArray(userQueries) ? userQueries : []).map((query) =>
      extractSessionTitle(String(query || "")).trim()
    )
  );
  const fallbackTitle = extractSessionTitle(previewSource).slice(0, 300);
  const promptEventText = extractSessionTitle(String(promptText || "")).trim();
  const incomingEvents = mergeUserQueryEvents(
    filterUserQueryEvents(Array.isArray(userQueryEvents) ? userQueryEvents : []),
    promptEventText && queryAt && !isInternalCursorPrompt(promptEventText)
      ? [{ text: promptEventText, at: queryAt }]
      : []
  );

  if (
    skipStaleImport &&
    sessionEnded &&
    incomingEvents.length > 0 &&
    !hasActivityOnOrAfter(incomingEvents, startOfTodayMs())
  ) {
    return null;
  }

  if (!incomingQueries.length && !incomingEvents.length && !fallbackTitle) {
    return null;
  }

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
    const mergedQueriesFiltered = filterUserQueryTexts(mergedQueries);
    const mergedEventsWithBackfill = filterUserQueryEvents(
      backfillQueryEventsFromQueries(
        mergedQueriesFiltered,
        mergedEvents,
        existing?.createdAt || queryAt || new Date(),
        existing?.updatedAt || queryAt || new Date()
      ).map((row) => ({ text: row.text, at: row.at }))
    );
    const mergedTurnCount = Math.max(
      turnCount || 0,
      mergedEventsWithBackfill.length,
      mergedQueriesFiltered.length,
      incomingQueries.length
    );
    const sessionTitle = (
      mergedEventsWithBackfill[0]?.text ||
      mergedQueriesFiltered[0] ||
      normalizeQueryText(existing?.sessionTitle) ||
      fallbackTitle
    ).slice(0, 300);

    const setFields = {
      skillSlug: resolveSessionSkillSlug({
        skillSlug,
        existingSkillSlug: existing?.skillSlug,
        texts: [
          sessionTitle,
          fallbackTitle,
          promptEventText,
          ...mergedQueriesFiltered,
          ...mergedEventsWithBackfill.map((row) => row.text),
        ],
      }),
      status: status || existing?.status || "completed",
      sessionTitle,
      promptPreview: sessionTitle,
      userQueries: mergedQueriesFiltered,
      userQueryEvents: mergedEventsWithBackfill,
      model: model || existing?.model || "",
      turnCount: mergedTurnCount,
      sessionEnded:
        !!sessionEnded || !!existing?.sessionEnded || status === "completed",
      durationMs: (() => {
        const ended =
          !!sessionEnded || !!existing?.sessionEnded || status === "completed";
        const eventSpan = computeSessionDurationMs(mergedEventsWithBackfill, {
          createdAt: existing?.createdAt,
          updatedAt: existing?.updatedAt,
          sessionEnded: ended,
        });
        return Math.max(durationMs || 0, existing?.durationMs || 0, eventSpan);
      })(),
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
  if (!conversationId || !text || isInternalCursorPrompt(text)) {
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

async function getUsageByDate(dateStr) {
  const start = startOfDay(new Date(dateStr));
  const end = endOfDay(new Date(dateStr));
  const startMs = start.getTime();
  const endMs = end.getTime();
  const logs = await getCursorIdeSessionsInRange(start, end);
  const sessionLogs = logs.filter((log) => isLogActiveInRange(log, startMs, endMs));

  const bySkillMap = {};
  for (const log of sessionLogs) {
    if (!bySkillMap[log.skillSlug]) {
      bySkillMap[log.skillSlug] = { skillSlug: log.skillSlug, runCount: 0 };
    }
    bySkillMap[log.skillSlug].runCount += 1;
  }

  return {
    date: dateStr,
    runCount: sessionLogs.length,
    sessionCount: sessionLogs.length,
    sessions: sessionLogs.map(mapLogRow),
    bySkill: Object.values(bySkillMap).sort((a, b) => b.runCount - a.runCount),
  };
}

async function getTodayUsage() {
  const today = startOfToday();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return getUsageByDate(`${y}-${m}-${d}`);
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

function sanitizeStoredSession(log) {
  const normalizedEvents = filterUserQueryEvents(mergeUserQueryEvents([], log.userQueryEvents || []));
  const userQueries = filterUserQueryTexts(resolveStoredUserQueries(log, normalizedEvents));
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
  const durationMs = computeSessionDurationMs(userQueryEvents, {
    createdAt: log.createdAt,
    updatedAt: log.updatedAt,
    sessionEnded,
  });

  return {
    userQueryEvents,
    userQueries,
    sessionTitle,
    promptPreview: sessionTitle,
    turnCount: Math.max(userQueryEvents.length, userQueries.length),
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

function buildBillingSessionsResponse(events, dateRange, mongoSessions, options = {}) {
  const { tolerance = "30s", sessionBuffer = "3min" } = options;
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

async function readSavedUsageEvents() {
  const filePath = path.join(CSV_DIR, DEFAULT_CSV_FILENAME);
  try {
    const text = await fs.readFile(filePath, "utf8");
    return text.trim() ? parseCursorUsageCsv(text) : [];
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function getBillingSessions({
  days = 7,
  startDate,
  endDate,
  tolerance = "30s",
  sessionBuffer = "3min",
  useLocalCsv = false,
} = {}) {
  const dateRange = resolveDateRange({ days, startDate, endDate });
  const startMs = dateRange.start.getTime();
  const endMs = dateRange.end.getTime();

  let events;
  if (useLocalCsv) {
    const savedEvents = await readSavedUsageEvents();
    if (savedEvents == null) {
      const fetched = await fetchCursorUsageCsv({ days, startDate, endDate });
      events = fetched.events;
    } else {
      events = savedEvents.filter(
        (row) => row.eventTime >= startMs && row.eventTime <= endMs
      );
    }
  } else {
    ({ events } = await fetchCursorUsageCsv({ days, startDate, endDate }));
  }

  const mongoSessions = (await getCursorIdeSessionsInRange(dateRange.start, dateRange.end)).filter(
    (log) => isLogActiveInRange(log, startMs, endMs)
  );
  return buildBillingSessionsResponse(events, dateRange, mongoSessions, { tolerance, sessionBuffer });
}

function getSavedCsvFilePath() {
  return path.join(CSV_DIR, DEFAULT_CSV_FILENAME);
}

async function downloadBillingCsv({
  days,
  startDate,
  endDate,
  useBillingCycle = true,
} = {}) {
  const { saved, filePath, csvDir, dateRange, text, saveWarning } = await downloadAndSaveUsageCsv({
    days,
    startDate,
    endDate,
    useBillingCycle,
  });
  const events = text.trim() ? parseCursorUsageCsv(text) : [];

  return {
    saved: saved && Boolean(filePath),
    filePath,
    csvDir,
    csvRelativePath: filePath ? `CSV/${DEFAULT_CSV_FILENAME}` : null,
    saveWarning,
    csvFilename: DEFAULT_CSV_FILENAME,
    csvText: text || "",
    eventCount: events.length,
    dateRange: {
      start: dateRange.start.toISOString(),
      end: dateRange.end.toISOString(),
    },
  };
}

module.exports = {
  CHAT_SESSION_SLUG,
  logTokenUsage,
  upsertCursorIdeSession,
  recordUserQueryEvent,
  getSessionLog,
  getTodayUsage,
  getUsageByDate,
  getRecentLogs,
  getRecentSessions,
  getBillingSessions,
  getSavedCsvFilePath,
  readSavedUsageEvents,
  downloadBillingCsv,
  repairCursorIdeSessions,
  sanitizeStoredSession,
  cleanPromptPreview,
  extractSessionTitle,
  mergeUserQueryEvents,
};
