// Shared YAML-frontmatter parser used by both scripts/generate-manifest.js
// and the api/ server, so the two never drift apart.

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const fields = {};
  const lines = match[1].split(/\r?\n/);
  let currentKey = null;

  for (const line of lines) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) {
      currentKey = kv[1];
      fields[currentKey] = kv[2].trim().replace(/^["']|["']$/g, "");
    } else if (currentKey && /^\s+/.test(line)) {
      // Continuation of a nested/multi-line value (e.g. metadata: block) - ignore for manifest purposes.
      continue;
    }
  }
  return fields;
}

function bodyAfterFrontmatter(raw) {
  const match = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  return match ? match[1].trim() : raw.trim();
}

module.exports = { parseFrontmatter, bodyAfterFrontmatter };
