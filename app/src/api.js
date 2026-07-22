const BASE = "/api/skills";

async function handleResponse(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function fetchSkills() {
  return fetch(BASE).then(handleResponse);
}

export function searchSkills(query) {
  return fetch(`${BASE}/search/${encodeURIComponent(query)}`).then(handleResponse);
}

export function createSkill({ name, description, content }) {
  return fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description, content }),
  }).then(handleResponse);
}

export function fetchTodayUsage() {
  return fetch("/api/token-usage/today").then(handleResponse);
}

export function fetchRecentLogs(limit = 10) {
  return fetch(`/api/token-usage/recent?limit=${limit}`).then(handleResponse);
}

export function fetchRecentSessions(limit = 15) {
  return fetch(`/api/token-usage/sessions?limit=${limit}`).then(handleResponse);
}

export function fetchBillingSessions({ days = 7, startDate, endDate } = {}) {
  const params = new URLSearchParams({ days: String(days) });
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  return fetch(`/api/token-usage/billing/sessions?${params}`).then(handleResponse);
}

export function downloadBillingCsv() {
  return fetch("/api/token-usage/billing/download-csv", { method: "POST" }).then(handleResponse);
}
