import { useCallback, useEffect, useState } from "react";
import { downloadBillingCsv, fetchBillingSessions, fetchRecentSessions, fetchTodayUsage } from "../api";

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

function formatSessionLabel(slug) {
  if (slug === "cursor-chat") return "Chat thường";
  return slug;
}

function truncateTitle(text, max = 120) {
  if (!text) return "Phiên chat không có tiêu đề";
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
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
    const billingEvents = (billing.userQueryEvents || []).filter((row) => row?.text && row?.at);
    const userQueryEvents =
      sessionItems.length >= billingEvents.length
        ? sessionItems.filter((row) => row.at)
        : billingEvents.length
          ? billingEvents
          : sessionItems.filter((row) => row.at);

    return {
      ...session,
      userQueryEvents: userQueryEvents.length ? userQueryEvents : session.userQueryEvents,
      billedTotalTokens: billing.billedTotalTokens,
      billedInputTokens: billing.billedInputTokens,
      billedOutputTokens: billing.billedOutputTokens,
      hasBilling: billing.hasBilling,
    };
  });
}

export default function TokenUsage() {
  const [usage, setUsage] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [billingLoading, setBillingLoading] = useState(false);
  const [error, setError] = useState(null);
  const [billingError, setBillingError] = useState(null);
  const [billingWarning, setBillingWarning] = useState(null);

  const loadBilling = useCallback(() => {
    setBillingLoading(true);
    setBillingError(null);
    setBillingWarning(null);
    return fetchBillingSessions({ days: 7 })
      .then((data) => {
        setBilling(data);
        setSessions((prev) => mergeSessionWithBilling(prev, data.sessions));
      })
      .catch((err) => setBillingError(err.message))
      .finally(() => setBillingLoading(false));
  }, []);

  const handleDownloadCsv = useCallback(() => {
    setBillingLoading(true);
    setBillingError(null);
    setBillingWarning(null);
    return downloadBillingCsv()
      .then((data) => {
        setBilling(data);
        if (data.saveWarning) {
          setBillingWarning(data.saveWarning);
        } else if (data.filePath) {
          setBillingWarning(`Đã lưu CSV: ${data.filePath}`);
        } else {
          setBillingWarning(null);
        }
        setSessions((prev) => mergeSessionWithBilling(prev, data.sessions));
      })
      .catch((err) => setBillingError(err.message))
      .finally(() => setBillingLoading(false));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchTodayUsage(), fetchRecentSessions(20)])
      .then(([today, logs]) => {
        setUsage(today);
        setSessions(logs);
        return loadBilling();
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [loadBilling]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="card">
      <h2>📊 Token hôm nay</h2>
      <div className="controls">
        <button className="btn-primary" onClick={load}>
          🔄 Refresh
        </button>
        <button className="btn-secondary" onClick={handleDownloadCsv} disabled={billingLoading}>
          {billingLoading ? "Đang tải CSV..." : "💳 Tải CSV"}
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
                    {formatNumber(billing.totals?.billed?.totalTokens)}
                  </span>
                  <span className="token-summary-label">Tổng token</span>
                </div>
                <div className="token-summary-item">
                  <span className="token-summary-value">
                    {formatNumber(billing.totals?.billed?.inputTokens)}
                  </span>
                  <span className="token-summary-label">Input</span>
                </div>
                <div className="token-summary-item">
                  <span className="token-summary-value">
                    {formatNumber(billing.totals?.billed?.outputTokens)}
                  </span>
                  <span className="token-summary-label">Output</span>
                </div>
                <div className="token-summary-item">
                  <span className="token-summary-value">{usage.sessionCount ?? usage.runCount}</span>
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
          <h3 className="section-title">Phiên chat gần đây</h3>
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
                        <span className="slug-badge billing-badge" title="Token từ CSV billing">
                          💳 {formatNumber(session.billedTotalTokens)} tok
                        </span>
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
                    <span className="internal-badge">{formatSessionLabel(session.skillSlug)}</span>
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
        <p className="empty">Chưa có phiên chat nào. Hãy chat trong Cursor IDE để thấy dữ liệu ở đây.</p>
      )}
    </div>
  );
}
