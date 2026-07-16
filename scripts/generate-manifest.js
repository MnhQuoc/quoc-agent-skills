#!/usr/bin/env node
// Scans skills/*/SKILL.md, parses the YAML frontmatter (name, description)
// and writes site/skills.json so the local site can render the skill list
// without any build step or external dependency.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SKILLS_DIR = path.join(ROOT, "skills");
const OUT_FILE = path.join(ROOT, "site", "skills.json");

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

function main() {
  if (!fs.existsSync(SKILLS_DIR)) {
    console.error(`Không tìm thấy thư mục: ${SKILLS_DIR}`);
    process.exit(1);
  }

  const skillDirs = fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const skills = [];
  for (const name of skillDirs) {
    const skillMdPath = path.join(SKILLS_DIR, name, "SKILL.md");
    if (!fs.existsSync(skillMdPath)) continue;

    const raw = fs.readFileSync(skillMdPath, "utf8");
    const meta = parseFrontmatter(raw);

    skills.push({
      slug: name,
      name: meta.name || name,
      description: meta.description || "",
      internal: meta.internal === "true" || false,
    });
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify({ skills }, null, 2) + "\n");
  console.log(`Đã sinh ${OUT_FILE} với ${skills.length} skill.`);
}

main();
