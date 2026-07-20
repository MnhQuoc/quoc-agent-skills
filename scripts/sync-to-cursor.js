#!/usr/bin/env node
// Đồng bộ skills/*/SKILL.md → .agents/skills/*/SKILL.md (project-local cho Cursor).
// An toàn chạy nhiều lần: ghi đè bản cũ, xóa skill orphan trong .agents/skills/.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SKILLS_DIR = path.join(ROOT, "skills");
const CURSOR_PROJECT_SKILLS_DIR = path.join(ROOT, ".agents", "skills");

function getSkillSlugs(dir) {
  if (!fs.existsSync(dir)) return new Set();

  return new Set(
    fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .filter((d) => fs.existsSync(path.join(dir, d.name, "SKILL.md")))
      .map((d) => d.name)
  );
}

function syncToCursor() {
  if (!fs.existsSync(SKILLS_DIR)) {
    console.log(`Không tìm thấy thư mục: ${SKILLS_DIR}`);
    return;
  }

  fs.mkdirSync(CURSOR_PROJECT_SKILLS_DIR, { recursive: true });

  const sourceSlugs = getSkillSlugs(SKILLS_DIR);
  const targetSlugs = getSkillSlugs(CURSOR_PROJECT_SKILLS_DIR);

  let synced = 0;
  for (const slug of [...sourceSlugs].sort()) {
    const src = path.join(SKILLS_DIR, slug, "SKILL.md");
    const destDir = path.join(CURSOR_PROJECT_SKILLS_DIR, slug);
    const dest = path.join(destDir, "SKILL.md");

    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, dest);
    synced++;
    console.log(`✅ ${slug} → .agents/skills/${slug}/SKILL.md`);
  }

  let removed = 0;
  for (const slug of targetSlugs) {
    if (sourceSlugs.has(slug)) continue;

    fs.rmSync(path.join(CURSOR_PROJECT_SKILLS_DIR, slug), { recursive: true, force: true });
    removed++;
    console.log(`🗑️  Đã xóa .agents/skills/${slug} (không còn trong skills/)`);
  }

  console.log(`\nHoàn tất: ${synced} skill đồng bộ, ${removed} skill orphan đã xóa.`);
}

syncToCursor();
