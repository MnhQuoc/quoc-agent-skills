const fs = require("fs");
const path = require("path");

/** Find project root: folder that has `backend/` as direct child (e.g. currency-converter/). */
function resolveProjectRoot(cwd) {
  let dir = path.resolve(cwd);

  if (fs.existsSync(path.join(dir, "backend"))) {
    return dir;
  }

  if (["backend", "frontend", "code-review"].includes(path.basename(dir))) {
    const parent = path.dirname(dir);
    if (fs.existsSync(path.join(parent, "backend"))) {
      return parent;
    }
  }

  let current = dir;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(current, "backend"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(dir, entry.name);
      if (fs.existsSync(path.join(candidate, "backend"))) {
        return candidate;
      }
    }
  } catch {
    // ignore readdir errors
  }

  return dir;
}

function formatTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function buildReportContent({ output, userPrompt, runId, projectRoot }) {
  const lines = [
    `# Code Review Report`,
    ``,
    `- **Project:** ${path.basename(projectRoot)}`,
    `- **Generated:** ${new Date().toISOString()}`,
    `- **Run ID:** ${runId || "—"}`,
    `- **Yêu cầu:** ${userPrompt?.trim() || "—"}`,
    ``,
    `---`,
    ``,
    output.trim(),
    ``,
  ];
  return lines.join("\n");
}

/**
 * Save code-review output next to backend/ (e.g. currency-converter/code-review/).
 * Returns absolute path of the latest report file.
 */
function saveCodeReviewReport({ cwd, output, userPrompt, runId }) {
  if (!output || !String(output).trim()) {
    return null;
  }

  const projectRoot = resolveProjectRoot(cwd);
  const reportDir = path.join(projectRoot, "code-review");
  fs.mkdirSync(reportDir, { recursive: true });

  const content = buildReportContent({ output, userPrompt, runId, projectRoot });
  const stamp = formatTimestamp();
  const stampedPath = path.join(reportDir, `review-${stamp}.md`);
  const latestPath = path.join(reportDir, "LATEST.md");

  fs.writeFileSync(stampedPath, content, "utf8");
  fs.writeFileSync(latestPath, content, "utf8");

  return {
    reportPath: latestPath,
    stampedPath,
    projectRoot,
  };
}

module.exports = { resolveProjectRoot, saveCodeReviewReport };
