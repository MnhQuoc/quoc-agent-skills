const BASE = "/api/skills";
const FETCH_TIMEOUT_MS = 60_000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(
        "Request quá thời gian chờ (60s). Kiểm tra API server: cd quoc-agent-skills && npm run api"
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function handleResponse(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function fetchSkills() {
  return fetchWithTimeout(BASE).then(handleResponse);
}

export function searchSkills(query) {
  return fetchWithTimeout(`${BASE}/search/${encodeURIComponent(query)}`).then(handleResponse);
}

export function createSkill({ name, description, content }) {
  return fetchWithTimeout(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description, content }),
  }).then(handleResponse);
}

export function fetchTodayUsage() {
  return fetchWithTimeout("/api/token-usage/today").then(handleResponse);
}

export function fetchUsageByDate(date) {
  const params = new URLSearchParams({ date });
  return fetchWithTimeout(`/api/token-usage/today?${params}`).then(handleResponse);
}

export function fetchRecentLogs(limit = 10) {
  return fetchWithTimeout(`/api/token-usage/recent?limit=${limit}`).then(handleResponse);
}

export function fetchRecentSessions(limit = 15) {
  return fetchWithTimeout(`/api/token-usage/sessions?limit=${limit}`).then(handleResponse);
}

export function fetchBillingSessions({ days = 1, startDate, endDate, useLocalCsv = false } = {}) {
  const params = new URLSearchParams({ days: String(days) });
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  if (useLocalCsv) params.set("useLocalCsv", "1");
  return fetchWithTimeout(`/api/token-usage/billing/sessions?${params}`).then(handleResponse);
}

export function downloadBillingCsv({ startDate, endDate, days, useBillingCycle = true } = {}) {
  const body = { useBillingCycle };
  if (startDate != null) body.startDate = startDate;
  if (endDate != null) body.endDate = endDate;
  if (days != null) body.days = days;
  return fetchWithTimeout("/api/token-usage/billing/download-csv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(handleResponse);
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsvTextAsFile(text, filename = "usage-events.csv") {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  triggerBlobDownload(blob, filename);
}

export async function triggerBrowserCsvDownload(filename = "usage-events.csv") {
  const res = await fetchWithTimeout(`/api/token-usage/billing/csv-file?ts=${Date.now()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Không tải được file CSV (HTTP ${res.status})`);
  }
  triggerBlobDownload(await res.blob(), filename);
}
