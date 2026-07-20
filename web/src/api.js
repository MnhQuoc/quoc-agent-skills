async function handleResponse(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function fetchTodayUsage() {
  return fetch("/api/token-usage/today").then(handleResponse);
}

export function fetchRecentLogs(limit = 10) {
  return fetch(`/api/token-usage/recent?limit=${limit}`).then(handleResponse);
}

export function fetchWorkflowSkills() {
  return fetch("/api/workflow/skills").then(handleResponse);
}

export function runWorkflowStep({ skillSlug, userPrompt, context, cwd }) {
  return fetch("/api/workflow/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skillSlug, userPrompt, context, cwd }),
  }).then(handleResponse);
}
