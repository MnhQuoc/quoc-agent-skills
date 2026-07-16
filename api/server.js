#!/usr/bin/env node
// Express API cho skills, dữ liệu lưu trong MongoDB (xem lib/db.js, lib/models/Skill.js).
// Powers the React app in app/. Sau mỗi thay đổi sẽ refresh site/skills.json để
// trang static (port 4321) luôn đồng bộ với dữ liệu trong DB.

require("dotenv").config();

const express = require("express");
const cors = require("cors");

const { connectDB } = require("../lib/db");
const { listSkills, getSkill, searchSkills, createSkill, SkillError } = require("../lib/skills");
const { watchSkillsDir, syncDeletedSkills } = require("../lib/watchSkills");
const { generateManifest } = require("../scripts/generate-manifest");

const app = express();
app.use(cors());
app.use(express.json());

async function refreshManifest() {
  try {
    await generateManifest();
  } catch (err) {
    console.error("Không refresh được site/skills.json:", err.message);
  }
}

app.get("/api/skills", async (req, res) => {
  try {
    res.json(await listSkills());
  } catch (err) {
    handleError(res, err);
  }
});

// Search must be registered before /api/skills/:slug so "search" isn't captured as a slug.
app.get("/api/skills/search/:query", async (req, res) => {
  const query = req.params.query.trim();
  if (query.length > 100) {
    return res.status(400).json({ error: "Search query too long" });
  }
  try {
    res.json(await searchSkills(query));
  } catch (err) {
    handleError(res, err);
  }
});

app.get("/api/skills/:slug", async (req, res) => {
  try {
    res.json(await getSkill(req.params.slug));
  } catch (err) {
    handleError(res, err);
  }
});

app.post("/api/skills", async (req, res) => {
  try {
    const skill = await createSkill(req.body || {});
    await refreshManifest();
    res.status(201).json(skill);
  } catch (err) {
    handleError(res, err);
  }
});

function handleError(res, err) {
  if (err instanceof SkillError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error", message: err.message });
}

const PORT = process.env.API_PORT || 4322;

connectDB()
  .then(async () => {
    // Bắt các skill đã bị xóa trên đĩa từ trước khi server này chạy.
    await syncDeletedSkills();
    watchSkillsDir(refreshManifest);

    app.listen(PORT, () => {
      console.log(`Skills API đang chạy tại http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Không kết nối được MongoDB:", err.message);
    process.exit(1);
  });
