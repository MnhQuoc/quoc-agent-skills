#!/usr/bin/env node
// One-time migration: đọc các skills/*/SKILL.md hiện có trên đĩa và nhập vào MongoDB.
// An toàn để chạy nhiều lần - skill đã tồn tại trong DB (theo slug) sẽ được bỏ qua.

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const { connectDB } = require("../lib/db");
const Skill = require("../lib/models/Skill");
const { parseFrontmatter, bodyAfterFrontmatter } = require("../lib/frontmatter");

const ROOT = path.join(__dirname, "..");
const SKILLS_DIR = path.join(ROOT, "skills");

async function migrate() {
  await connectDB();

  if (!fs.existsSync(SKILLS_DIR)) {
    console.log(`Không tìm thấy thư mục: ${SKILLS_DIR}`);
    return;
  }

  const skillDirs = fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  let created = 0;
  let skipped = 0;

  for (const slug of skillDirs) {
    const skillMdPath = path.join(SKILLS_DIR, slug, "SKILL.md");
    if (!fs.existsSync(skillMdPath)) continue;

    const existing = await Skill.findOne({ slug }).lean();
    if (existing) {
      skipped++;
      console.log(`- Bỏ qua "${slug}" (đã tồn tại trong MongoDB)`);
      continue;
    }

    const raw = fs.readFileSync(skillMdPath, "utf8");
    const meta = parseFrontmatter(raw);

    await Skill.create({
      slug,
      name: meta.name || slug,
      description: meta.description || "",
      internal: meta.internal === "true",
      content: bodyAfterFrontmatter(raw),
    });
    created++;
    console.log(`+ Đã nhập "${slug}"`);
  }

  console.log(`\nHoàn tất: ${created} skill mới, ${skipped} skill bỏ qua.`);
}

migrate()
  .then(() => mongoose.disconnect())
  .catch((err) => {
    console.error("Lỗi migrate:", err);
    process.exit(1);
  });
