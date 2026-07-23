import { useCallback, useEffect, useState } from "react";
import {
  downloadBillingCsv,
  downloadCsvTextAsFile,
  fetchBillingSessions,
  fetchUsageByDate,
  triggerBrowserCsvDownload,
} from "../api";
import { computeEventsCost, hasTokenPricing } from "../tokenPricing";

function formatNumber(n) {
  return new Intl.NumberFormat("vi-VN").format(n || 0);
}

function formatDateTime(value, { withSeconds = false } = {}) {
  if (!value) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
  }).format(new Date(value));
}

function dedupeQueryEventsForDisplay(events) {
  const deduped = [];
  for (const row of events) {
    if (!row?.text) continue;
    const prev = deduped[deduped.length - 1];
    if (prev && prev.text === row.text) {
      if (row.at && (!prev.at || new Date(row.at) < new Date(prev.at))) prev.at = row.at;
      continue;
    }
    deduped.push({ text: row.text, at: row.at || null });
  }
  return deduped;
}

function getSessionQueryItems(session) {
  const events = dedupeQueryEventsForDisplay(
    (session.userQueryEvents || []).filter((row) => row?.text)
  );
  const queries = (session.userQueries || []).filter(Boolean);

  if (events.length) return events;

  if (queries.length) {
    return queries.map((text) => ({ text, at: null }));
  }

  const fallback = session.sessionTitle || session.promptPreview;
  return fallback ? [{ text: fallback, at: null }] : [];
}

const SKILL_LABELS = {
  "skill-requirement": "Requirement",
  "skill-plan": "Plan",
  "skill-implement": "Implement",
  "code-review": "Review",
  frontend: "Frontend",
  backend: "Backend",
  test: "Test",
};

const SKILL_SLASH_RE = /(?:^|\s)\/([a-z][a-z0-9-]*)\b/gi;

function detectSkillSlugsFromText(text) {
  if (!text) return [];
  const slugs = [];
  const re = new RegExp(SKILL_SLASH_RE.source, SKILL_SLASH_RE.flags);
  let match;
  while ((match = re.exec(String(text))) !== null) {
    slugs.push(match[1].toLowerCase());
  }
  return slugs;
}

function resolveSessionSkillSlugs(session) {
  const seen = new Set();
  const slugs = [];

  const addSlug = (slug) => {
    if (!slug || slug === "cursor-chat" || seen.has(slug)) return;
    seen.add(slug);
    slugs.push(slug);
  };

  if (session?.skillSlug && session.skillSlug !== "cursor-chat") {
    addSlug(session.skillSlug);
  }

  for (const query of getSessionQueryItems(session)) {
    for (const slug of detectSkillSlugsFromText(query.text)) {
      addSlug(slug);
    }
  }

  for (const text of [session?.sessionTitle, session?.promptPreview]) {
    for (const slug of detectSkillSlugsFromText(text)) {
      addSlug(slug);
    }
  }

  if (!slugs.length) {
    return [session?.skillSlug || "cursor-chat"];
  }

  return slugs;
}

function formatSessionLabel(slug) {
  if (!slug || slug === "cursor-chat") return "Chat thường";
  if (SKILL_LABELS[slug]) return SKILL_LABELS[slug];
  if (slug.startsWith("skill-")) {
    return slug.slice("skill-".length).replace(/-/g, " ");
  }
  return slug.replace(/-/g, " ");
}

function truncateTitle(text, max = 120) {
  if (!text) return "Phiên chat không có tiêu đề";
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

function getLocalDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function isSelectedToday(dateStr) {
  return dateStr === getLocalDateString();
}

function formatCostAmount(amount) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}

function isIncludedCostLabel(label) {
  if (!label) return false;
  const normalized = String(label).trim().toLowerCase();
  return normalized === "included" || normalized === "free";
}

function resolveCostAmount(eventOrEvents) {
  const events = Array.isArray(eventOrEvents) ? eventOrEvents : [eventOrEvents];
  const numericTotal = events.reduce((sum, row) => {
    if (row?.costAmount != null && row.costAmount > 0) return sum + row.costAmount;
    return sum;
  }, 0);
  if (numericTotal > 0) return numericTotal;

  return computeEventsCost(events);
}

function formatResolvedCost(events, { includedLabel } = {}) {
  const list = Array.isArray(events) ? events : [events];
  const amount = resolveCostAmount(list);
  if (amount == null) return null;

  const formatted = formatCostAmount(amount);
  const included =
    isIncludedCostLabel(includedLabel) || list.some((row) => isIncludedCostLabel(row?.cost));
  return included ? `${formatted} (Included)` : formatted;
}

function getSessionCostDisplay(session) {
  const events = session.billingEvents || [];
  const resolved = formatResolvedCost(events, { includedLabel: session.billedCostLabel });
  if (resolved) return resolved;

  if (session.billedCostAmount != null) return formatCostAmount(session.billedCostAmount);
  if (session.billedCostLabel && !isIncludedCostLabel(session.billedCostLabel)) {
    return session.billedCostLabel;
  }

  const labels = [...new Set(events.map((row) => row.cost).filter(Boolean))];
  if (labels.length === 1 && !isIncludedCostLabel(labels[0])) return labels[0];
  if (labels.length > 1) return labels.join(", ");

  return hasTokenPricing() ? "—" : "Chưa có bảng giá";
}

function getSessionTokenBreakdown(session) {
  const events = session.billingEvents || [];
  if (events.length) {
    return events.reduce(
      (acc, row) => ({
        inputNoCache: acc.inputNoCache + (row.inputNoCache || 0),
        inputCacheWrite: acc.inputCacheWrite + (row.inputCacheWrite || 0),
        cacheRead: acc.cacheRead + (row.cacheRead || 0),
        outputTokens: acc.outputTokens + (row.outputTokens || 0),
        totalTokens: acc.totalTokens + (row.totalTokens || 0),
      }),
      {
        inputNoCache: 0,
        inputCacheWrite: 0,
        cacheRead: 0,
        outputTokens: 0,
        totalTokens: 0,
      }
    );
  }

  const hasDetailedBreakdown =
    (session.billedInputNoCache || 0) +
      (session.billedInputCacheWrite || 0) +
      (session.billedCacheRead || 0) >
    0;

  if (hasDetailedBreakdown) {
    return {
      inputNoCache: session.billedInputNoCache || 0,
      inputCacheWrite: session.billedInputCacheWrite || 0,
      cacheRead: session.billedCacheRead || 0,
      outputTokens: session.billedOutputTokens || 0,
      totalTokens: session.billedTotalTokens || 0,
    };
  }

  return {
    inputNoCache: session.billedInputTokens || 0,
    inputCacheWrite: 0,
    cacheRead: 0,
    outputTokens: session.billedOutputTokens || 0,
    totalTokens: session.billedTotalTokens || 0,
    inputCombinedOnly: !!(session.billedInputTokens && !hasDetailedBreakdown),
  };
}

function formatEventCost(event) {
  const resolved = formatResolvedCost([event]);
  if (resolved) return resolved;
  if (event.cost && !isIncludedCostLabel(event.cost)) return event.cost;
  return "—";
}

function groupBillingEventsByTurn(session) {
  const turns = getSessionQueryItems(session).filter((row) => row.at);
  const events = [...(session.billingEvents || [])].sort(
    (a, b) => new Date(a.eventTime || a.date) - new Date(b.eventTime || b.date)
  );

  if (!turns.length) {
    if (!events.length) return [];
    return [{ turnIndex: 0, turn: null, events }];
  }

  const groups = turns.map((turn, index) => ({
    turnIndex: index + 1,
    turn,
    events: [],
  }));

  for (const event of events) {
    const eventMs = new Date(event.eventTime || event.date).getTime();
    let assignedIdx = 0;
    let bestTurnTs = -Infinity;

    for (let i = 0; i < turns.length; i++) {
      const turnMs = new Date(turns[i].at).getTime();
      if (turnMs <= eventMs && turnMs >= bestTurnTs) {
        bestTurnTs = turnMs;
        assignedIdx = i;
      }
    }

    if (bestTurnTs === -Infinity) {
      let bestDiff = Infinity;
      for (let i = 0; i < turns.length; i++) {
        const turnMs = new Date(turns[i].at).getTime();
        const diff = Math.abs(eventMs - turnMs);
        if (diff < bestDiff) {
          bestDiff = diff;
          assignedIdx = i;
        }
      }
    }

    groups[assignedIdx].events.push(event);
  }

  return groups;
}

function SessionBillingModal({ session, onClose }) {
  if (!session) return null;

  const breakdown = getSessionTokenBreakdown(session);
  const events = session.billingEvents || [];
  const turnGroups = groupBillingEventsByTurn(session);
  const turnCount = getSessionQueryItems(session).length;
  const requestDetailLabel =
    turnCount && events.length !== turnCount
      ? `${events.length} API request · ${turnCount} lượt chat`
      : `${events.length} request`;
  const rows = breakdown.inputCombinedOnly
    ? [
        { label: "Input (tổng từ CSV)", value: breakdown.inputNoCache },
        { label: "Output Tokens", value: breakdown.outputTokens },
        { label: "Total Tokens", value: breakdown.totalTokens, strong: true },
      ]
    : [
        { label: "Input (w/o Cache Write)", value: breakdown.inputNoCache },
        { label: "Input (w/ Cache Write)", value: breakdown.inputCacheWrite },
        { label: "Cache Read", value: breakdown.cacheRead },
        { label: "Output Tokens", value: breakdown.outputTokens },
        { label: "Total Tokens", value: breakdown.totalTokens, strong: true },
      ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content token-billing-modal" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Đóng">
          ✕
        </button>
        <h3 className="modal-title">Chi tiết token</h3>
        <p className="modal-description">
          {truncateTitle(getSessionQueryItems(session)[0]?.text || session.sessionTitle, 180)}
        </p>

        <h4 className="modal-subtitle">Tổng hợp theo loại token</h4>
        <div className="token-breakdown-grid">
          {rows.map((row) => (
            <div key={row.label} className={`token-breakdown-row${row.strong ? " token-breakdown-total" : ""}`}>
              <span>{row.label}</span>
              <strong>{formatNumber(row.value)}</strong>
            </div>
          ))}
          <div className="token-breakdown-row token-breakdown-cost">
            <span>Cost</span>
            <strong>{getSessionCostDisplay(session)}</strong>
          </div>
        </div>

        {events.length ? (
          <>
            <h4 className="modal-subtitle">Chi tiết billing ({requestDetailLabel})</h4>
            <p className="session-list-hint billing-turn-hint">
              Mỗi lượt chat có thể tạo nhiều API request (Cursor ghi từng lần gọi model trong CSV).
            </p>
            {turnGroups.map((group) => (
              <div key={`turn-${group.turnIndex}-${group.turn?.at || "fallback"}`} className="billing-turn-group">
                {group.turn ? (
                  <div className="billing-turn-header">
                    <strong>Lượt {group.turnIndex}</strong>
                    <span className="session-query-time">
                      {formatDateTime(group.turn.at, { withSeconds: true })}
                    </span>
                    <span className="billing-turn-prompt">{truncateTitle(group.turn.text, 100)}</span>
                    {group.events.length > 1 ? (
                      <span className="billing-turn-count">{group.events.length} API request</span>
                    ) : null}
                  </div>
                ) : null}
                <div className="token-events-table-wrap">
                  {group.events.length ? (
                  <table className="token-events-table">
                    <thead>
                      <tr>
                        <th>Thời gian</th>
                        <th>Model</th>
                        <th>In w/o cache</th>
                        <th>In w/ cache</th>
                        <th>Cache read</th>
                        <th>Output</th>
                        <th>Total</th>
                        <th>Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.events.map((event, index) => (
                        <tr key={`${group.turnIndex}-${event.eventTime}-${index}`}>
                          <td>{formatDateTime(event.date || event.eventTime, { withSeconds: true })}</td>
                          <td>{event.model || "—"}</td>
                          <td>{formatNumber(event.inputNoCache)}</td>
                          <td>{formatNumber(event.inputCacheWrite)}</td>
                          <td>{formatNumber(event.cacheRead)}</td>
                          <td>{formatNumber(event.outputTokens)}</td>
                          <td>{formatNumber(event.totalTokens)}</td>
                          <td>{formatEventCost(event)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  ) : (
                    <p className="session-list-hint billing-turn-empty">
                      Chưa khớp được API request billing cho lượt này. Thử Tải CSV rồi Refresh.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </>
        ) : (
          <p className="session-list-hint">Chưa có chi tiết từng request. Thử bấm Tải CSV rồi Refresh.</p>
        )}

        {!hasTokenPricing() ? (
          <p className="session-list-hint">
            Bảng giá tùy chỉnh chưa cấu hình — đang hiển thị Cost từ CSV Cursor. Bạn có thể cập nhật sau trong{" "}
            <code>app/src/tokenPricing.js</code>.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function getBillingTotals(billing) {
  return billing?.totals?.all || billing?.totals?.billed || {};
}

function mergeSessionWithBilling(recentSessions, billingSessions) {
  const billingMap = new Map(
    (billingSessions || []).map((row) => [row.conversationId || row.id, row])
  );

  return recentSessions.map((session) => {
    const billing =
      billingMap.get(session.conversationId) ||
      billingMap.get(session.runId) ||
      billingMap.get(session.id);
    if (!billing) return session;

    const sessionItems = getSessionQueryItems(session);
    const sessionTurns = sessionItems.filter((row) => row.at);

    return {
      ...session,
      userQueryEvents: sessionTurns.length ? sessionTurns : session.userQueryEvents,
      billedTotalTokens: billing.billedTotalTokens,
      billedInputTokens: billing.billedInputTokens,
      billedOutputTokens: billing.billedOutputTokens,
      billedInputNoCache: billing.billedInputNoCache,
      billedInputCacheWrite: billing.billedInputCacheWrite,
      billedCacheRead: billing.billedCacheRead,
      billedCostAmount: billing.billedCostAmount,
      billedCostLabel: billing.billedCostLabel,
      billingEvents: billing.billingEvents,
      hasBilling: billing.hasBilling,
    };
  });
}

export default function TokenUsage() {
  const [selectedDate, setSelectedDate] = useState(getLocalDateString);
  const [usage, setUsage] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [billingSession, setBillingSession] = useState(null);
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [billingLoading, setBillingLoading] = useState(false);
  const [csvDownloading, setCsvDownloading] = useState(false);
  const [error, setError] = useState(null);
  const [billingError, setBillingError] = useState(null);
  const [billingWarning, setBillingWarning] = useState(null);

  const loadBilling = useCallback((date, { useLocalCsv = false } = {}) => {
    setBillingLoading(true);
    setBillingError(null);
    setBillingWarning(null);
    return fetchBillingSessions({ startDate: date, endDate: date, useLocalCsv })
      .then((data) => {
        setBilling(data);
        setSessions((prev) => mergeSessionWithBilling(prev, data.sessions));
      })
      .catch((err) => setBillingError(err.message))
      .finally(() => setBillingLoading(false));
  }, []);

  const handleDownloadCsv = useCallback(() => {
    setCsvDownloading(true);
    setBillingError(null);
    setBillingWarning(null);
    return downloadBillingCsv()
      .then(async (data) => {
        const filename = data.csvFilename || "usage-events.csv";
        const hasCsvText = Boolean(data.csvText?.trim());

        if (hasCsvText) {
          downloadCsvTextAsFile(data.csvText, filename);
        } else {
          await triggerBrowserCsvDownload(filename);
        }

        if (data.saved && data.filePath) {
          const rangeHint = data.dateRange
            ? ` (${data.dateRange.start?.slice(0, 10)} → ${data.dateRange.end?.slice(0, 10)})`
            : "";
          setBillingWarning(
            `Đã lưu ${data.eventCount || 0} dòng vào ${data.csvRelativePath || data.filePath}${rangeHint}. File cũng đã tải về trình duyệt.`
          );
          return loadBilling(selectedDate, { useLocalCsv: true });
        }
        if (data.saveWarning) {
          setBillingWarning(
            hasCsvText
              ? `${data.saveWarning} File vẫn được tải về trình duyệt.`
              : data.saveWarning
          );
          return hasCsvText ? loadBilling(selectedDate) : null;
        }
        if (hasCsvText) {
          setBillingWarning(`Đã tải ${data.eventCount || 0} dòng về trình duyệt.`);
          return loadBilling(selectedDate);
        }
        setBillingError(
          "Không lưu được file CSV. Hãy chạy API server: mở terminal tại quoc-agent-skills và chạy npm run api."
        );
        return null;
      })
      .catch((err) => {
        const message = err.message || "";
        setBillingError(
          message.includes("fetch") ||
            message.includes("Failed") ||
            message.includes("AbortError") ||
            message.includes("API server")
            ? "Không kết nối được API (port 4322). Chạy: cd quoc-agent-skills && npm run api"
            : message
        );
      })
      .finally(() => setCsvDownloading(false));
  }, [loadBilling, selectedDate]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    setBilling(null);
    fetchUsageByDate(selectedDate)
      .then((usageData) => {
        setUsage(usageData);
        setSessions(usageData.sessions || []);
        return loadBilling(selectedDate);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [loadBilling, selectedDate]);

  useEffect(() => {
    load();
  }, [load]);

  const dateLabel = formatDateLabel(selectedDate);
  const viewingToday = isSelectedToday(selectedDate);
  const pageTitle = viewingToday ? "Token hôm nay" : `Token ngày ${dateLabel}`;
  const sessionsTitle = viewingToday ? "Phiên chat hôm nay" : `Phiên chat ngày ${dateLabel}`;
  const sessionCount = billing?.sessions?.length ?? usage?.sessionCount ?? sessions.length;

  return (
    <div className="card">
      <h2>📊 {pageTitle}</h2>
      <div className="controls">
        <label className="date-picker-label">
          Chọn ngày
          <input
            type="date"
            value={selectedDate}
            max={getLocalDateString()}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
        </label>
        {!viewingToday ? (
          <button className="btn-secondary" onClick={() => setSelectedDate(getLocalDateString())}>
            Hôm nay
          </button>
        ) : null}
        <button className="btn-primary" onClick={load}>
          🔄 Refresh
        </button>
        <button className="btn-secondary" onClick={handleDownloadCsv} disabled={csvDownloading}>
          {csvDownloading ? "Đang tải CSV..." : "💳 Tải CSV"}
        </button>
      </div>

      {loading && (
        <div className="loading">
          <div className="spinner" />
          Đang tải token...
        </div>
      )}
      {error && <div className="error">❌ Lỗi: {error}</div>}
      {billingError ? (
        <div className="billing-hint billing-hint-error">
          ⚠️ Billing CSV: {billingError}
          <span className="billing-hint-sub">
            Đảm bảo bạn đã đăng nhập Cursor IDE. API sẽ tự đọc session từ state.vscdb.
          </span>
        </div>
      ) : billingWarning ? (
        <div className="billing-hint">
          ⚠️ {billingWarning}
        </div>
      ) : null}

      {usage && !loading && (
        <>
          {billing ? (
            <>
              <div className="token-summary">
                <div className="token-summary-item">
                  <span className="token-summary-value">
                    {formatNumber(getBillingTotals(billing).totalTokens)}
                  </span>
                  <span className="token-summary-label">Tổng token</span>
                </div>
                <div className="token-summary-item">
                  <span className="token-summary-value">
                    {formatNumber(getBillingTotals(billing).inputNoCache)}
                  </span>
                  <span className="token-summary-label">In w/o cache</span>
                </div>
                <div className="token-summary-item">
                  <span className="token-summary-value">
                    {formatNumber(getBillingTotals(billing).inputCacheWrite)}
                  </span>
                  <span className="token-summary-label">In w/ cache</span>
                </div>
                <div className="token-summary-item">
                  <span className="token-summary-value">
                    {formatNumber(getBillingTotals(billing).cacheRead)}
                  </span>
                  <span className="token-summary-label">Cache read</span>
                </div>
                <div className="token-summary-item">
                  <span className="token-summary-value">
                    {formatNumber(getBillingTotals(billing).outputTokens)}
                  </span>
                  <span className="token-summary-label">Output</span>
                </div>
                <div className="token-summary-item">
                  <span className="token-summary-value">{sessionCount}</span>
                  <span className="token-summary-label">Session</span>
                </div>
              </div>

            </>
          ) : billingLoading ? (
            <p className="billing-hint">Đang tải token billing...</p>
          ) : null}
        </>
      )}

      {sessions.length > 0 && !loading && (
        <>
          <h3 className="section-title">{sessionsTitle}</h3>
          <p className="session-list-hint">
            Mỗi dòng là một Session hoàn chỉnh trong Cursor — gồm nhiều câu hỏi/trả lời liên tiếp.
            Thời gian bên cạnh mỗi câu hỏi là lúc bạn gửi, dùng để khớp với dashboard usage.
          </p>
          <div className="token-recent-list">
            {sessions.map((session) => (
              <div key={session.id} className="token-recent-row session-row">
                <div className="session-main">
                  <div className="session-header">
                    <strong className="session-title">
                      Session
                    </strong>
                    {session.hasBilling ? (
                      <div className="session-token-badges">
                        <button
                          type="button"
                          className="slug-badge billing-badge billing-badge-clickable"
                          title="Xem chi tiết loại token và cost"
                          onClick={() => setBillingSession(session)}
                        >
                          💳 {formatNumber(session.billedTotalTokens)} tok
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div className="session-meta">
                    <span className="log-time">
                      {formatDateTime(session.updatedAt || session.createdAt)}
                    </span>
                    <span className="session-turn-badge">
                      {session.turnCount || 0} lượt hỏi đáp
                    </span>
                    {resolveSessionSkillSlugs(session).map((slug) => (
                      <span key={slug} className="internal-badge">
                        {formatSessionLabel(slug)}
                      </span>
                    ))}
                    {session.sessionEnded ? (
                      <span className="internal-badge session-status-closed">Đã đóng</span>
                    ) : (
                      <span className="internal-badge session-status-active">Đang chat</span>
                    )}
                  </div>
                  {getSessionQueryItems(session).map((query, index) => (
                      <p key={`${session.id}-${index}`} className="session-query-item">
                        <span className="session-query-index">{index + 1}.</span>
                        {query.at ? (
                          <span className="session-query-time" title="Thời gian gửi câu hỏi">
                            {formatDateTime(query.at, { withSeconds: true })}
                          </span>
                        ) : null}
                        {truncateTitle(query.text, 160)}
                      </p>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && sessions.length === 0 && !error && (
        <p className="empty">
          {viewingToday
            ? "Chưa có phiên chat nào hôm nay. Hãy chat trong Cursor IDE để thấy dữ liệu ở đây."
            : `Chưa có phiên chat nào ngày ${dateLabel}.`}
        </p>
      )}

      {billingSession ? (
        <SessionBillingModal session={billingSession} onClose={() => setBillingSession(null)} />
      ) : null}
    </div>
  );
}
