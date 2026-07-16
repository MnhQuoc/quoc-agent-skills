const REPO = "MnhQuoc/quoc-agent-skills";

async function loadSkills() {
  const listEl = document.getElementById("skills-list");
  const badgeRow = document.getElementById("badge-row");

  try {
    const res = await fetch("skills.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const skills = (data.skills || []).filter((s) => !s.internal);

    badgeRow.innerHTML = `
      <span class="badge-pill">▲ <strong>${skills.length}</strong> skills</span>
      <span class="badge-pill">Agent Skills Spec</span>
    `;

    if (skills.length === 0) {
      listEl.innerHTML = '<p class="loading">Chưa có skill nào trong skills/.</p>';
      return;
    }

    listEl.innerHTML = skills.map(renderSkillCard).join("");
    attachCopyHandlers();
  } catch (err) {
    listEl.innerHTML = `<p class="error">Không tải được skills.json: ${err.message}. Hãy chạy "npm run generate" trước.</p>`;
  }
}

function renderSkillCard(skill) {
  const installCmd = `npx skills add ${REPO} --skill ${skill.slug}`;
  return `
    <article class="skill-card">
      <div class="skill-card-header">
        <span class="skill-name">${escapeHtml(skill.name)}</span>
      </div>
      <p class="skill-desc">${escapeHtml(skill.description)}</p>
      <div class="skill-cmd">
        <code>${escapeHtml(installCmd)}</code>
        <button class="copy-btn" data-copy="${escapeHtml(installCmd)}">Copy</button>
      </div>
    </article>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function attachCopyHandlers() {
  document.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.getAttribute("data-copy");
      try {
        await navigator.clipboard.writeText(text);
        const original = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(() => (btn.textContent = original), 1200);
      } catch {
        // Clipboard API unavailable (e.g. non-HTTPS context) - ignore silently.
      }
    });
  });
}

attachCopyHandlers();
loadSkills();
