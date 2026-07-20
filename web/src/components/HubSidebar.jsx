import { useCallback, useEffect, useState } from "react";
import { fetchRecentLogs, fetchTodayUsage } from "../api.js";

function formatNumber(n) {
  return new Intl.NumberFormat("vi-VN").format(n || 0);
}

export default function HubSidebar({ activePage, onNavigate, refreshKey }) {
  const [usage, setUsage] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [today, logs] = await Promise.all([fetchTodayUsage(), fetchRecentLogs(5)]);
      setUsage(today);
      setRecent(logs);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-icon">▲</span>
        <div>
          <strong>Quoc Hub</strong>
          <p>Token từ skill runs</p>
        </div>
      </div>

      <nav className="sidebar-nav">
        <button
          type="button"
          className={activePage === "hub" ? "nav-btn active" : "nav-btn"}
          onClick={() => onNavigate("hub")}
        >
          🏠 Hub
        </button>
        <button
          type="button"
          className={activePage === "create" ? "nav-btn active" : "nav-btn"}
          onClick={() => onNavigate("create")}
        >
          🚀 Tạo Web
        </button>
      </nav>

      <div className="token-panel">
        <div className="token-panel-header">
          <h2>Token hôm nay</h2>
          <button type="button" className="icon-btn" onClick={load} title="Refresh">
            ↻
          </button>
        </div>

        {loading && <p className="muted">Đang tải...</p>}
        {error && <p className="error-text">{error}</p>}

        {usage && !loading && (
          <>
            <div className="token-hero">
              <span className="token-big">{formatNumber(usage.totalTokens)}</span>
              <span className="token-label">total tokens</span>
            </div>
            <div className="token-grid">
              <div>
                <span className="stat-value">{formatNumber(usage.inputTokens)}</span>
                <span className="stat-label">input</span>
              </div>
              <div>
                <span className="stat-value">{formatNumber(usage.outputTokens)}</span>
                <span className="stat-label">output</span>
              </div>
              <div>
                <span className="stat-value">{usage.runCount}</span>
                <span className="stat-label">lần chạy</span>
              </div>
            </div>

            {usage.bySkill?.length > 0 && (
              <div className="by-skill">
                <h3>Theo skill</h3>
                <ul>
                  {usage.bySkill.map((row) => (
                    <li key={row.skillSlug}>
                      <span>{row.skillSlug}</span>
                      <span>{formatNumber(row.totalTokens)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {recent.length > 0 && (
        <div className="recent-runs">
          <h3>Gần đây</h3>
          <ul>
            {recent.map((log) => (
              <li key={log.id}>
                <strong>{log.skillSlug}</strong>
                <span>{formatNumber(log.totalTokens)} tok</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="sidebar-links">
        <a href="http://localhost:5173" target="_blank" rel="noreferrer">
          Skill Manager ↗
        </a>
        <a href="http://localhost:4321" target="_blank" rel="noreferrer">
          Skills Site ↗
        </a>
      </div>
    </aside>
  );
}
