import { useCallback, useEffect, useState } from "react";
import { fetchRecentLogs, fetchTodayUsage } from "../api";

function formatNumber(n) {
  return new Intl.NumberFormat("vi-VN").format(n || 0);
}

function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

// Chỉ đọc & hiển thị token - không có nút chạy skill hay tạo gì ở đây.
export default function TokenUsage() {
  const [usage, setUsage] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchTodayUsage(), fetchRecentLogs(15)])
      .then(([today, logs]) => {
        setUsage(today);
        setRecent(logs);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

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
      </div>

      {loading && (
        <div className="loading">
          <div className="spinner" />
          Đang tải token...
        </div>
      )}
      {error && <div className="error">❌ Lỗi: {error}</div>}

      {usage && !loading && (
        <>
          <div className="token-summary">
            <div className="token-summary-item">
              <span className="token-summary-value">{formatNumber(usage.totalTokens)}</span>
              <span className="token-summary-label">Tổng token</span>
            </div>
            <div className="token-summary-item">
              <span className="token-summary-value">{formatNumber(usage.inputTokens)}</span>
              <span className="token-summary-label">Input</span>
            </div>
            <div className="token-summary-item">
              <span className="token-summary-value">{formatNumber(usage.outputTokens)}</span>
              <span className="token-summary-label">Output</span>
            </div>
            <div className="token-summary-item">
              <span className="token-summary-value">{usage.runCount}</span>
              <span className="token-summary-label">Lần chạy</span>
            </div>
          </div>

          {usage.bySkill?.length > 0 && (
            <>
              <h3 className="section-title">Theo skill</h3>
              <div className="skill-list">
                {usage.bySkill.map((row) => (
                  <div key={row.skillSlug} className="skill-item">
                    <h3>{row.skillSlug}</h3>
                    <div className="skill-footer">
                      <span className="slug-badge">{formatNumber(row.totalTokens)} tok</span>
                      <span className="internal-badge">{row.runCount} lần</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {recent.length > 0 && !loading && (
        <>
          <h3 className="section-title">Gần đây</h3>
          <div className="token-recent-list">
            {recent.map((log) => (
              <div key={log.id} className="token-recent-row">
                <div>
                  <strong>{log.skillSlug}</strong>
                  {log.estimated && (
                    <span
                      className="estimate-tag"
                      title="Chạy trong Cursor IDE — token ước lượng, không phải số billing thật"
                    >
                      ~ước lượng
                    </span>
                  )}
                  <p className="skill-desc">
                    <span className="log-time">{formatDateTime(log.createdAt)}</span> — {log.promptPreview}
                  </p>
                </div>
                <span className="slug-badge">{formatNumber(log.totalTokens)} tok</span>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && !usage && !error && <p className="empty">Chưa có dữ liệu token nào.</p>}
    </div>
  );
}
