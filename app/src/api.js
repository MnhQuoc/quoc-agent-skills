const BASE = "/api/skills";

async function handleResponse(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
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
