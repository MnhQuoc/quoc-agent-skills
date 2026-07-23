const CHAT_SESSION_SLUG = "cursor-chat";

// Cursor skill commands: /skill-implement, /code-review, ...
const SKILL_SLASH_RE = /(?:^|\s)\/([a-z][a-z0-9-]*)\b/i;

function detectSkillSlugFromText(text) {
  if (!text) return null;
  const match = String(text).match(SKILL_SLASH_RE);
  if (!match) return null;
  return match[1].toLowerCase();
}

function resolveSessionSkillSlug({ skillSlug, existingSkillSlug, texts = [] } = {}) {
  const candidates = [];

  if (skillSlug && skillSlug !== CHAT_SESSION_SLUG) candidates.push(skillSlug);
  if (existingSkillSlug && existingSkillSlug !== CHAT_SESSION_SLUG) {
    candidates.push(existingSkillSlug);
  }

  for (const text of texts) {
    const detected = detectSkillSlugFromText(text);
    if (detected) candidates.push(detected);
  }

  if (candidates.length) return candidates[0];
  return skillSlug || existingSkillSlug || CHAT_SESSION_SLUG;
}

module.exports = {
  CHAT_SESSION_SLUG,
  detectSkillSlugFromText,
  resolveSessionSkillSlug,
};
