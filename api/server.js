#!/usr/bin/env node
// Express API cho skills, dữ liệu lưu trong MongoDB (xem lib/db.js, lib/models/Skill.js).
// Powers the React app in app/. Sau mỗi thay đổi sẽ refresh site/skills.json để
// trang static (port 4321) luôn đồng bộ với dữ liệu trong DB.

require("dotenv").config();

const express = require("express");
const cors = require("cors");

const { connectDB } = require("../lib/db");
const { listSkills, getSkill, searchSkills, createSkill, SkillError } = require("../lib/skills");
const { runSkill, WORKFLOW_SKILLS } = require("../lib/skillRunner");
const {
  getTodayUsage,
  getRecentLogs,
  getRecentSessions,
  getBillingSessions,
  downloadBillingCsv,
  upsertCursorIdeSession,
  recordUserQueryEvent,
  getSessionLog,
} = require("../lib/tokenUsage");
const { watchSkillsDir, syncDeletedSkills } = require("../lib/watchSkills");
const { generateManifest } = require("../scripts/generate-manifest");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

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

app.get("/api/workflow/skills", (_req, res) => {
  res.json(WORKFLOW_SKILLS);
});

app.post("/api/workflow/run", async (req, res) => {
  const { skillSlug, userPrompt, context, cwd } = req.body || {};
  if (!skillSlug) {
    return res.status(400).json({ error: "skillSlug là bắt buộc" });
  }
  try {
    const result = await runSkill({ skillSlug, userPrompt, context, cwd });
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

app.get("/api/token-usage/today", async (_req, res) => {
  try {
    res.json(await getTodayUsage());
  } catch (err) {
    handleError(res, err);
  }
});

// Nhận báo cáo session từ hook Cursor IDE (.cursor/hooks/token-report.js).
// mode=session: upsert 1 bản ghi / conversation (metadata phiên chat, không lưu token).
app.post("/api/token-usage/log", async (req, res) => {
  const {
    mode,
    skillSlug,
    promptText,
    responseText,
    firstPrompt,
    userQueries,
    userQueryEvents,
    queryAt,
    turnCount,
    sessionEnded,
    durationMs,
    status,
    model,
    conversationId,
  } = req.body || {};

  const hasSessionPayload =
    mode === "session" &&
    (turnCount || sessionEnded || userQueries?.length || userQueryEvents?.length);
  if (!promptText && !responseText && !hasSessionPayload) {
    return res.status(400).json({ error: "promptText hoặc responseText là bắt buộc" });
  }
  if (!conversationId) {
    return res.status(400).json({ error: "conversationId là bắt buộc" });
  }

  try {
    const log =
      mode === "session"
        ? await upsertCursorIdeSession({
            conversationId,
            skillSlug,
            promptText,
            responseText,
            firstPrompt,
            userQueries,
            userQueryEvents,
            queryAt,
            turnCount,
            sessionEnded,
            durationMs,
            status,
            model,
          })
        : await upsertCursorIdeSession({
            conversationId,
            skillSlug,
            promptText,
            responseText,
            firstPrompt: firstPrompt || promptText,
            userQueries,
            userQueryEvents,
            queryAt,
            turnCount: turnCount || 1,
            sessionEnded: !!sessionEnded,
            durationMs,
            status,
            model,
          });

    res.status(200).json({
      id: String(log._id),
      conversationId: log.runId,
      turnCount: log.turnCount,
      sessionEnded: log.sessionEnded,
      skillSlug: log.skillSlug,
    });
  } catch (err) {
    handleError(res, err);
  }
});

// Ghi timestamp thật khi user gửi prompt (hook beforeSubmitPrompt).
app.post("/api/token-usage/query-event", async (req, res) => {
  const { conversationId, promptText, at, skillSlug, model } = req.body || {};

  if (!conversationId) {
    return res.status(400).json({ error: "conversationId là bắt buộc" });
  }
  if (!promptText?.trim()) {
    return res.status(400).json({ error: "promptText là bắt buộc" });
  }

  try {
    const log = await recordUserQueryEvent({
      conversationId,
      promptText,
      at,
      skillSlug,
      model,
    });

    res.status(200).json({
      id: String(log._id),
      conversationId: log.runId,
      turnCount: log.turnCount,
      userQueryEvents: log.userQueryEvents || [],
    });
  } catch (err) {
    handleError(res, err);
  }
});

app.get("/api/token-usage/session/:conversationId", async (req, res) => {
  try {
    const log = await getSessionLog(req.params.conversationId);
    if (!log) {
      return res.status(404).json({ error: "Không tìm thấy session" });
    }
    res.json(log);
  } catch (err) {
    handleError(res, err);
  }
});

app.get("/api/token-usage/recent", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  try {
    res.json(await getRecentLogs(limit));
  } catch (err) {
    handleError(res, err);
  }
});

app.get("/api/token-usage/sessions", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  try {
    res.json(await getRecentSessions(limit));
  } catch (err) {
    handleError(res, err);
  }
});

// Tải CSV billing từ Cursor Dashboard, lưu vào thư mục CSV/ (xóa file cũ trước).
app.post("/api/token-usage/billing/download-csv", async (_req, res) => {
  try {
    res.json(await downloadBillingCsv());
  } catch (err) {
    handleError(res, err);
  }
});

// Khớp billing theo thời gian với session MongoDB (đọc trực tiếp từ Cursor API).
app.get("/api/token-usage/billing/sessions", async (req, res) => {
  const days = Math.min(parseInt(req.query.days, 10) || 7, 90);
  const { startDate, endDate, tolerance, sessionBuffer } = req.query;

  try {
    res.json(
      await getBillingSessions({
        days,
        startDate,
        endDate,
        tolerance,
        sessionBuffer,
      })
    );
  } catch (err) {
    handleError(res, err);
  }
});

function handleError(res, err) {
  if (err instanceof SkillError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err?.status && err.status >= 400 && err.status < 600) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({
    error: err.message || "Internal server error",
    message: err.message || "Internal server error",
  });
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
