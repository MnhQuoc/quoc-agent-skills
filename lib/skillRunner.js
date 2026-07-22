const path = require("path");
const { Agent, CursorAgentError } = require("@cursor/sdk");
const { getSkill, SkillError } = require("./skills");
const { logTokenUsage } = require("./tokenUsage");
const { saveCodeReviewReport } = require("./codeReviewReport");

const ROOT = path.join(__dirname, "..");

const WORKFLOW_SKILLS = [
  { slug: "skill-requirement", label: "Requirement", emoji: "📋" },
  { slug: "skill-plan", label: "Plan", emoji: "🗺️" },
  { slug: "skill-implement", label: "Implement", emoji: "⚡" },
  { slug: "code-review", label: "Review", emoji: "🔍" },
];

function buildPrompt(skill, userPrompt, context) {
  const parts = [
    "Bạn phải tuân thủ skill sau (ưu tiên cao nhất):",
    "",
    `# Skill: ${skill.name}`,
    skill.description,
    "",
    skill.content || "(skill chưa có nội dung chi tiết)",
    "",
    "---",
  ];

  if (context && context.trim()) {
    parts.push("", "Context từ bước trước:", context.trim(), "", "---");
  }

  parts.push("", "Yêu cầu user:", userPrompt.trim());
  return parts.join("\n");
}

async function runSkill({ skillSlug, userPrompt, context = "", cwd }) {
  if (!userPrompt || !String(userPrompt).trim()) {
    throw new SkillError("userPrompt là bắt buộc", 400);
  }

  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new SkillError("Thiếu CURSOR_API_KEY trong file .env", 500);
  }

  const skill = await getSkill(skillSlug);
  const prompt = buildPrompt(skill, userPrompt, context);
  const workDir = cwd || ROOT;

  try {
    const result = await Agent.prompt(prompt, {
      apiKey: apiKey.trim(),
      model: { id: process.env.CURSOR_MODEL || "composer-2.5" },
      local: {
        cwd: workDir,
        settingSources: ["project"],
      },
    });

    await logTokenUsage({
      skillSlug,
      runId: result.id,
      status: result.status,
      promptPreview: userPrompt,
    });

    const output = result.result || "";
    let reportFile = null;

    if (skillSlug === "code-review" && output.trim()) {
      reportFile = saveCodeReviewReport({
        cwd: workDir,
        output,
        userPrompt,
        runId: result.id,
      });
      if (reportFile?.reportPath) {
        console.log(`📝 Code review saved: ${reportFile.reportPath}`);
      }
    }

    return {
      skillSlug,
      runId: result.id,
      status: result.status,
      output,
      usage: result.usage || null,
      durationMs: result.durationMs,
      error: result.error || null,
      reportPath: reportFile?.reportPath || null,
      reportStampedPath: reportFile?.stampedPath || null,
    };
  } catch (err) {
    if (err instanceof CursorAgentError) {
      throw new SkillError(`Agent không khởi chạy được: ${err.message}`, 502);
    }
    throw err;
  }
}

module.exports = { runSkill, buildPrompt, WORKFLOW_SKILLS };
