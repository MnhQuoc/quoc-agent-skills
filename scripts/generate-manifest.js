#!/usr/bin/env node
// Đọc skill từ MongoDB và ghi ra site/skills.json, để trang static site/ có thể
// hiển thị danh sách skill mà không cần build step hay gọi API riêng.

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const { connectDB } = require("../lib/db");
const Skill = require("../lib/models/Skill");

const ROOT = path.join(__dirname, "..");
const OUT_FILE = path.join(ROOT, "site", "skills.json");

async function generateManifest() {
  const alreadyConnected = mongoose.connection.readyState === 1;
  if (!alreadyConnected) await connectDB();

  const docs = await Skill.find().sort({ slug: 1 }).lean();
  const skills = docs.map((d) => ({
    slug: d.slug,
    name: d.name,
    description: d.description,
    internal: !!d.internal,
  }));

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify({ skills }, null, 2) + "\n");
  return skills;
}

async function main() {
  const skills = await generateManifest();
  console.log(`Đã sinh ${OUT_FILE} với ${skills.length} skill.`);
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { generateManifest };
