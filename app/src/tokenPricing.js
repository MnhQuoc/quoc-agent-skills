/**
 * Bảng giá token Cursor (USD / 1 triệu token).
 * Nguồn: https://cursor.com/docs/models-and-pricing (cập nhật 2026-07-23)
 *
 * UI ưu tiên cột Cost từ CSV Cursor; nếu thiếu (vd. "Included") sẽ ước tính từ bảng này.
 */

/** @typedef {{ inputNoCache: number, inputCacheWrite?: number, cacheRead?: number, outputTokens: number }} TokenRates */

const MODELS = {};
const ALIASES = {};

function rate(inputNoCache, outputTokens, cacheRead = 0, inputCacheWrite) {
  const row = { inputNoCache, outputTokens };
  if (cacheRead) row.cacheRead = cacheRead;
  if (inputCacheWrite != null) row.inputCacheWrite = inputCacheWrite;
  return row;
}

function registerModel(slug, rates, ...aliases) {
  MODELS[slug] = rates;
  for (const alias of aliases) {
    ALIASES[alias] = slug;
  }
}

// —— Auto ——
registerModel("auto-cost", rate(1.25, 6, 0.25, 1.25), "auto", "auto-cost-mode");

// —— Cursor ——
registerModel("composer-2.5", rate(0.5, 2.5, 0.2), "composer-2", "composer2.5", "composer-2.5-fast");
registerModel("composer-1", rate(1.25, 10, 0.125), "composer-1.0");
registerModel("grok-4.5", rate(2, 6, 0.5), "cursor-grok-4.5", "cursor-grok-4.5-high", "cursor-grok-4.5-high-fast");

// —— Anthropic ——
registerModel("claude-4-sonnet", rate(3, 15, 0.3, 3.75), "claude-sonnet-4", "claude-4-sonnet-20250514");
registerModel("claude-4-sonnet-1m", rate(6, 22.5, 0.6, 7.5), "claude-sonnet-4-1m");
registerModel("claude-4.5-haiku", rate(1, 5, 0.1, 1.25), "claude-haiku-4.5");
registerModel("claude-4.5-opus", rate(5, 25, 0.5, 6.25));
registerModel("claude-4.5-sonnet", rate(3, 15, 0.3, 3.75));
registerModel("claude-4.6-opus", rate(5, 25, 0.5, 6.25));
registerModel("claude-4.6-sonnet", rate(3, 15, 0.3, 3.75));
registerModel("claude-4.7-opus", rate(5, 25, 0.5, 6.25));
registerModel("claude-fable-5", rate(10, 50, 1, 12.5), "claude-fable-5-thinking", "claude-fable-5-thinking-high");
registerModel("claude-opus-4.7-fast", rate(30, 150, 3, 37.5), "claude-opus-4-7-fast");
registerModel("claude-opus-4.8", rate(5, 25, 0.5, 6.25), "claude-opus-4-8", "claude-opus-4-8-thinking", "claude-opus-4-8-thinking-high");
registerModel("claude-opus-4.8-fast", rate(10, 50, 1, 12.5), "claude-opus-4-8-fast");
// Khuyến mãi đến 31/08/2026: $2 input, $10 output
registerModel("claude-sonnet-5", rate(2, 10, 0.3, 3.75), "claude-sonnet-5-thinking", "claude-sonnet-5-thinking-high");

// —— Google ——
registerModel("gemini-2.5-flash", rate(0.3, 2.5, 0.03));
registerModel("gemini-3-flash", rate(0.5, 3, 0.05));
registerModel("gemini-3-pro", rate(2, 12, 0.2), "gemini-3-pro-image-preview");
registerModel("gemini-3.1-pro", rate(2, 12, 0.2));
registerModel("gemini-3.5-flash", rate(1.5, 9, 0.15));
registerModel("gemini-3.6-flash", rate(1.5, 7.5, 0.15));

// —— Z.ai ——
registerModel("glm-5.2", rate(1.4, 4.4, 0.26));

// —— OpenAI GPT-5 ——
registerModel("gpt-5", rate(1.25, 10, 0.125), "gpt-5-high");
registerModel("gpt-5-fast", rate(2.5, 20, 0.25), "gpt-5-high-fast", "gpt-5-low-fast");
registerModel("gpt-5-mini", rate(0.25, 2, 0.025));
registerModel("gpt-5-codex", rate(1.25, 10, 0.125), "gpt-5-codex");
registerModel("gpt-5.1-codex", rate(1.25, 10, 0.125));
registerModel("gpt-5.1-codex-max", rate(1.25, 10, 0.125));
registerModel("gpt-5.1-codex-mini", rate(0.25, 2, 0.025));
registerModel("gpt-5.2", rate(1.75, 14, 0.175), "gpt-5.2-high");
registerModel("gpt-5.2-codex", rate(1.75, 14, 0.175));
registerModel("gpt-5.3-codex", rate(1.75, 14, 0.175), "gpt-5.3-codex-high");
registerModel("gpt-5.4", rate(2.5, 15, 0.25), "gpt-5.4-high");
registerModel("gpt-5.4-fast", rate(5, 30, 0.5));
registerModel("gpt-5.4-mini", rate(0.75, 4.5, 0.075));
registerModel("gpt-5.4-nano", rate(0.2, 1.25, 0.02));
registerModel("gpt-5.5", rate(5, 30, 0.5), "gpt-5.5-high");
registerModel("gpt-5.6-luna", rate(1, 6, 0.1, 1.25), "gpt-5.6-luna-medium");
registerModel("gpt-5.6-luna-fast", rate(2, 12, 0.2, 2.5));
registerModel("gpt-5.6-sol", rate(5, 30, 0.5, 6.25), "gpt-5.6-sol-medium");
registerModel("gpt-5.6-sol-fast", rate(10, 60, 1, 12.5));
registerModel("gpt-5.6-terra", rate(2.5, 15, 0.25, 3.125), "gpt-5.6-terra-medium");
registerModel("gpt-5.6-terra-fast", rate(5, 30, 0.5, 6.25));

// —— Moonshot ——
registerModel("kimi-k2.7-code", rate(0.95, 4, 0.19), "kimi-k2-7-code");

export const TOKEN_PRICING = {
  default: null,
  models: MODELS,
};

const SUFFIX_STRIP_RE =
  /-(thinking-high|thinking|high-fast|high|fast|medium|low-fast|low|codex-high|codex)$/;

function normalizeModelId(model) {
  return String(model || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/^default\s*$/i, "");
}

function lookupRates(key) {
  if (!key) return null;
  if (MODELS[key]) return MODELS[key];
  const alias = ALIASES[key];
  if (alias && MODELS[alias]) return MODELS[alias];
  return null;
}

function getRatesForModel(model) {
  const key = normalizeModelId(model);
  if (!key) return TOKEN_PRICING.default;

  let rates = lookupRates(key);
  if (rates) return rates;

  const stripped = key.replace(SUFFIX_STRIP_RE, "");
  if (stripped !== key) {
    rates = lookupRates(stripped);
    if (rates) return rates;
  }

  // gpt-5-6-terra → gpt-5.6-terra (một số nguồn dùng dấu gạch thay dấu chấm)
  const dotted = stripped.replace(/gpt-5-(\d)-/, "gpt-5.$1-");
  if (dotted !== stripped) {
    rates = lookupRates(dotted);
    if (rates) return rates;
  }

  // Khớp prefix dài nhất: composer-2.5-fast → composer-2.5
  const slugs = Object.keys(MODELS).sort((a, b) => b.length - a.length);
  for (const slug of slugs) {
    if (key === slug || key.startsWith(`${slug}-`) || key.startsWith(`${slug}.`)) {
      return MODELS[slug];
    }
  }

  return TOKEN_PRICING.default;
}

export function hasTokenPricing() {
  if (TOKEN_PRICING.default) return true;
  return Object.keys(TOKEN_PRICING.models).length > 0;
}

export function computeTokenCost(breakdown, model) {
  const rates = getRatesForModel(model);
  if (!rates) return null;

  const parts = [
    (breakdown.inputNoCache || 0) * (rates.inputNoCache || 0),
    (breakdown.inputCacheWrite || 0) * (rates.inputCacheWrite || 0),
    (breakdown.cacheRead || 0) * (rates.cacheRead || 0),
    (breakdown.outputTokens || 0) * (rates.outputTokens || 0),
  ];

  const total = parts.reduce((sum, value) => sum + value, 0) / 1_000_000;
  return Number.isFinite(total) ? total : null;
}

export function computeEventsCost(events) {
  if (!hasTokenPricing()) return null;
  let total = 0;
  let matched = 0;
  for (const event of events || []) {
    const cost = computeTokenCost(event, event.model);
    if (cost != null) {
      total += cost;
      matched += 1;
    }
  }
  return matched > 0 ? total : null;
}
