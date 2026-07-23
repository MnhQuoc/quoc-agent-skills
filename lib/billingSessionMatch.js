const MS = {
  second: 1000,
  minute: 60 * 1000,
};

function parseDurationMs(value, fallbackMs) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return fallbackMs;

  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours)?$/i);
  if (!match) return fallbackMs;

  const amount = parseFloat(match[1]);
  const unit = (match[2] || "s").toLowerCase();
  if (unit.startsWith("m") && unit !== "ms") return amount * MS.minute;
  if (unit.startsWith("h")) return amount * 60 * MS.minute;
  if (unit === "ms") return amount;
  return amount * MS.second;
}

function getStoredQueryEvents(session) {
  const events = Array.isArray(session.userQueryEvents) ? session.userQueryEvents : [];
  return events
    .map((row) => {
      const text = String(row?.text || "").trim();
      const at = row?.at ? new Date(row.at).getTime() : NaN;
      if (!text || !Number.isFinite(at)) return null;
      return { text, at };
    })
    .filter(Boolean)
    .sort((a, b) => a.at - b.at);
}

function buildSessionWindows(mongoSessions) {
  return mongoSessions
    .map((session) => {
      const queryEvents = getStoredQueryEvents(session);
      const createdAt = new Date(session.createdAt).getTime();
      const updatedAt = new Date(session.updatedAt || session.createdAt).getTime();
      const sessionStart = queryEvents.length ? queryEvents[0].at : createdAt;
      const sessionEnd = queryEvents.length
        ? Math.max(queryEvents[queryEvents.length - 1].at, updatedAt)
        : Math.max(updatedAt, createdAt);
      const queries = Array.isArray(session.userQueries) ? session.userQueries.filter(Boolean) : [];
      const firstPrompt =
        queryEvents[0]?.text || queries[0] || session.sessionTitle || session.promptPreview || "";

      return {
        sessionId: session.runId || session.conversationId,
        sessionStart,
        sessionEnd: Math.max(sessionEnd, sessionStart),
        firstPrompt,
        userTurns: session.turnCount || queryEvents.length || queries.length || 1,
        queryEvents,
        mongoSession: session,
      };
    })
    .filter((row) => row.sessionId)
    .sort((a, b) => a.sessionStart - b.sessionStart);
}

function buildMessageAnchors(windows) {
  const messages = [];

  for (const window of windows) {
    const storedEvents = window.queryEvents?.length
      ? window.queryEvents
      : getStoredQueryEvents(window.mongoSession);
    if (storedEvents.length) {
      for (const event of storedEvents) {
        messages.push({
          sessionId: window.sessionId,
          timestamp: event.at,
          promptText: String(event.text).slice(0, 100),
          isUser: true,
        });
      }
      continue;
    }

    const queries = window.mongoSession?.userQueries?.filter(Boolean) || [];
    const promptList = queries.length ? queries : [window.firstPrompt].filter(Boolean);

    if (!promptList.length) {
      messages.push({
        sessionId: window.sessionId,
        timestamp: window.sessionStart,
        promptText: "",
        isUser: true,
      });
      continue;
    }

    if (promptList.length === 1) {
      messages.push({
        sessionId: window.sessionId,
        timestamp: window.sessionStart,
        promptText: String(promptList[0]).slice(0, 100),
        isUser: true,
      });
      continue;
    }

    const span = Math.max(window.sessionEnd - window.sessionStart, 1);
    promptList.forEach((query, index) => {
      const ratio = promptList.length === 1 ? 0 : index / (promptList.length - 1);
      messages.push({
        sessionId: window.sessionId,
        timestamp: window.sessionStart + span * ratio,
        promptText: String(query).slice(0, 100),
        isUser: true,
      });
    });
  }

  return messages.sort((a, b) => a.timestamp - b.timestamp);
}

function pickBestSessionForEvent(event, candidates, messages, graceMs) {
  const candidateIds = new Set(candidates.map((window) => window.sessionId));
  const sessionMessages = (messages || []).filter(
    (msg) => msg.isUser && candidateIds.has(msg.sessionId)
  );

  // Billing thường đi sau câu hỏi — chọn lượt chat mới nhất ngay trước thời điểm billing.
  let bestMessage = null;
  let bestMessageTs = -Infinity;
  for (const message of sessionMessages) {
    if (message.timestamp <= event.eventTime + graceMs && message.timestamp > bestMessageTs) {
      bestMessageTs = message.timestamp;
      bestMessage = message;
    }
  }

  if (bestMessage) {
    return candidates.find((window) => window.sessionId === bestMessage.sessionId) || candidates[0];
  }

  let nearest = null;
  let nearestDiff = Infinity;
  for (const message of sessionMessages) {
    const diff = Math.abs(event.eventTime - message.timestamp);
    if (diff < nearestDiff) {
      nearestDiff = diff;
      nearest = message;
    }
  }
  if (nearest) {
    return candidates.find((window) => window.sessionId === nearest.sessionId) || candidates[0];
  }

  let best = candidates[0];
  let bestDiff = Infinity;
  for (const window of candidates) {
    const mid = window.sessionStart + (window.sessionEnd - window.sessionStart) / 2;
    const diff = Math.abs(event.eventTime - mid);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = window;
    }
  }
  return best;
}

function assignByWindow(events, windows, toleranceMs, sessionBufferMs, messages) {
  const graceMs = Math.max(toleranceMs, sessionBufferMs);
  return events.map((event) => {
    const candidates = windows.filter(
      (window) =>
        window.sessionStart - toleranceMs <= event.eventTime &&
        event.eventTime <= window.sessionEnd + sessionBufferMs + toleranceMs
    );

    if (candidates.length === 1) {
      return { ...event, sessionId: candidates[0].sessionId, matchMethod: "session_window" };
    }

    if (candidates.length > 1) {
      const best = pickBestSessionForEvent(event, candidates, messages, graceMs);
      return { ...event, sessionId: best.sessionId, matchMethod: "session_window" };
    }

    return { ...event, sessionId: null, matchMethod: null };
  });
}

function assignByNearestMessage(events, messages, toleranceMs, sessionBufferMs) {
  const userMessages = messages.filter((msg) => msg.isUser);
  const source = userMessages.length ? userMessages : messages;
  const graceMs = Math.max(toleranceMs, sessionBufferMs || 0);

  return events.map((event) => {
    let best = null;
    let bestTs = -Infinity;

    for (const message of source) {
      if (message.timestamp <= event.eventTime + graceMs && message.timestamp > bestTs) {
        bestTs = message.timestamp;
        best = message;
      }
    }

    if (!best) {
      let nearestDiff = Infinity;
      for (const message of source) {
        const diff = Math.abs(event.eventTime - message.timestamp);
        if (diff <= graceMs && diff < nearestDiff) {
          nearestDiff = diff;
          best = message;
        }
      }
    }

    return {
      ...event,
      sessionId: best?.sessionId || null,
      matchMethod: best ? "nearest_message" : "unmatched",
    };
  });
}

function emptyTokenBreakdown() {
  return {
    inputNoCache: 0,
    inputCacheWrite: 0,
    cacheRead: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
}

function addTokenBreakdown(target, row) {
  target.inputNoCache += row.inputNoCache || 0;
  target.inputCacheWrite += row.inputCacheWrite || 0;
  target.cacheRead += row.cacheRead || 0;
  target.outputTokens += row.outputTokens || 0;
  target.totalTokens += row.totalTokens || 0;
}

function summarizeBillingEvents(events) {
  const breakdown = emptyTokenBreakdown();
  let costAmount = 0;
  let hasNumericCost = false;
  let hasIncludedCost = false;

  for (const row of events) {
    addTokenBreakdown(breakdown, row);
    if (row.costAmount != null) {
      costAmount += row.costAmount;
      hasNumericCost = true;
    } else if (/^included$/i.test(String(row.cost || "").trim())) {
      hasIncludedCost = true;
    }
  }

  return {
    breakdown,
    costAmount: hasNumericCost ? costAmount : null,
    costLabel: hasNumericCost ? null : hasIncludedCost ? "Included" : null,
  };
}

function mapBillingEvent(row) {
  return {
    date: row.date,
    eventTime: row.eventTime,
    model: row.model || "",
    inputNoCache: row.inputNoCache || 0,
    inputCacheWrite: row.inputCacheWrite || 0,
    cacheRead: row.cacheRead || 0,
    outputTokens: row.outputTokens || 0,
    totalTokens: row.totalTokens || 0,
    cost: row.cost || "",
    costAmount: row.costAmount ?? null,
    matchMethod: row.matchMethod || null,
  };
}

function addCsvTotals(acc, row) {
  acc.totalTokens += row.totalTokens || 0;
  acc.inputTokens += row.inputTokens || 0;
  acc.outputTokens += row.outputTokens || 0;
  acc.inputNoCache += row.inputNoCache || 0;
  acc.inputCacheWrite += row.inputCacheWrite || 0;
  acc.cacheRead += row.cacheRead || 0;
  return acc;
}

function emptyCsvTotals() {
  return {
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    inputNoCache: 0,
    inputCacheWrite: 0,
    cacheRead: 0,
  };
}

function mergeBillingWithSessions(csvEvents, mongoSessions, options = {}) {
  const toleranceMs = parseDurationMs(options.tolerance, 30 * MS.second);
  const sessionBufferMs = parseDurationMs(options.sessionBuffer, 3 * MS.minute);

  const windows = buildSessionWindows(mongoSessions);
  const messages = buildMessageAnchors(windows);

  const windowAssigned = assignByWindow(
    csvEvents,
    windows,
    toleranceMs,
    sessionBufferMs,
    messages
  );
  const unmatched = windowAssigned.filter((row) => !row.sessionId);
  const matched = windowAssigned.filter((row) => row.sessionId);

  const fallbackAssigned = assignByNearestMessage(unmatched, messages, toleranceMs, sessionBufferMs);
  const detail = [...matched, ...fallbackAssigned].sort((a, b) => a.eventTime - b.eventTime);

  const sessionMap = new Map();
  for (const window of windows) {
    const session = window.mongoSession;
    sessionMap.set(window.sessionId, {
      conversationId: window.sessionId,
      id: String(session._id || session.id || window.sessionId),
      sessionTitle: session.sessionTitle || window.firstPrompt,
      firstPrompt: window.firstPrompt,
      userQueries: session.userQueries || [],
      userQueryEvents: getStoredQueryEvents(session).map((row) => ({
        text: row.text,
        at: new Date(row.at).toISOString(),
      })),
      skillSlug: session.skillSlug || "",
      turnCount: window.userTurns,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      sessionEnded: !!session.sessionEnded,
      billedTotalTokens: 0,
      billedInputTokens: 0,
      billedOutputTokens: 0,
      billedInputNoCache: 0,
      billedInputCacheWrite: 0,
      billedCacheRead: 0,
      billedCostAmount: 0,
      billedCostLabel: null,
      billingEvents: [],
      billingRequestCount: 0,
      matchedByWindow: 0,
      matchedByMessage: 0,
      models: new Set(),
    });
  }

  for (const row of detail) {
    if (!row.sessionId) continue;
    const target = sessionMap.get(row.sessionId);
    if (!target) continue;

    target.billedTotalTokens += row.totalTokens || 0;
    target.billedInputTokens += row.inputTokens || 0;
    target.billedOutputTokens += row.outputTokens || 0;
    target.billedInputNoCache += row.inputNoCache || 0;
    target.billedInputCacheWrite += row.inputCacheWrite || 0;
    target.billedCacheRead += row.cacheRead || 0;
    if (row.costAmount != null) {
      target.billedCostAmount += row.costAmount;
    } else if (/^included$/i.test(String(row.cost || "").trim())) {
      target.billedCostLabel = "Included";
    }
    target.billingEvents.push(mapBillingEvent(row));
    target.billingRequestCount += 1;
    if (row.model) target.models.add(row.model);
    if (row.matchMethod === "session_window") target.matchedByWindow += 1;
    if (row.matchMethod === "nearest_message") target.matchedByMessage += 1;
  }

  const sessions = Array.from(sessionMap.values())
    .map((row) => {
      const billingSummary = summarizeBillingEvents(row.billingEvents);
      return {
        ...row,
        billingEvents: row.billingEvents.sort((a, b) => a.eventTime - b.eventTime),
        billedCostAmount: billingSummary.costAmount ?? (row.billedCostAmount || null),
        billedCostLabel: billingSummary.costLabel ?? row.billedCostLabel,
        models: Array.from(row.models).sort(),
        hasBilling: row.billingRequestCount > 0,
      };
    })
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

  const billedTotals = detail.reduce((acc, row) => {
    if (!row.sessionId) return acc;
    return addCsvTotals(acc, row);
  }, emptyCsvTotals());

  const allTotals = csvEvents.reduce((acc, row) => addCsvTotals(acc, row), emptyCsvTotals());

  return {
    sessions,
    detail,
    unmatchedEvents: detail.filter((row) => !row.sessionId),
    stats: {
      csvEventCount: csvEvents.length,
      mongoSessionCount: mongoSessions.length,
      matchedSessionCount: sessions.filter((row) => row.hasBilling).length,
      unmatchedEventCount: detail.filter((row) => !row.sessionId).length,
      matchedByWindow: detail.filter((row) => row.matchMethod === "session_window").length,
      matchedByMessage: detail.filter((row) => row.matchMethod === "nearest_message").length,
    },
    totals: {
      billed: billedTotals,
      all: allTotals,
    },
  };
}

module.exports = {
  mergeBillingWithSessions,
  parseDurationMs,
  buildSessionWindows,
  getStoredQueryEvents,
};
