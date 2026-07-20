/** Normalize agent markdown before parsing. */
function normalizeMarkdown(markdown) {
  return markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function stripMarkdown(text) {
  return text.replace(/\*\*/g, "").replace(/^#+\s*/, "").trim();
}

/** Match a single A/B/C option line in various agent formats. */
function matchOptionLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const m =
    trimmed.match(/^\*\*([A-C])\)\*\*\s*(.+)$/i) ||
    trimmed.match(/^\*\*([A-C])\.\*\*\s*(.+)$/i) ||
    trimmed.match(/^[-*]\s*\*\*([A-C])\)\*\*\s*(.+)$/i) ||
    trimmed.match(/^[-*]\s*\*\*([A-C])\.\*\*\s*(.+)$/i) ||
    trimmed.match(/^[-*]\s*\(([A-C])\)\s*(.+)$/i) ||
    trimmed.match(/^[-*]\s*([A-C])\)\s*(.+)$/i) ||
    trimmed.match(/^[-*]\s*([A-C])\.\s+(.+)$/i) ||
    trimmed.match(/^([A-C])\)\s+(.+)$/i) ||
    trimmed.match(/^([A-C])\.\s+(.+)$/i);

  if (!m) return null;

  return {
    letter: m[1].toUpperCase(),
    text: stripMarkdown(m[2].trim()),
  };
}

function parseOptions(body) {
  const options = [];

  for (const rawLine of body.split("\n")) {
    const opt = matchOptionLine(rawLine);
    if (opt) options.push(opt);
  }

  return options;
}

function extractTitleFromLine(line) {
  const trimmed = line.trim();
  if (!trimmed || matchOptionLine(trimmed)) return null;

  const patterns = [
    /\*\*Câu\s*(?:hỏi\s*)?(\d+)\s*[-–—:.]\s*(.+?)\*\*/i,
    /\*\*Question\s+(\d+)\s*[-–—:.]\s*(.+?)\*\*/i,
    /\*\*(.+?\?)\*\*/,
    /^#{1,3}\s*(.+?\?)\s*$/,
    /^(\d+)\.\s*\*\*(.+?\?)\*\*/,
    /^(\d+)\.\s+(.+\?)\s*$/,
    /^(\d+)\)\s+(.+\?)\s*$/,
  ];

  for (const pattern of patterns) {
    const m = trimmed.match(pattern);
    if (m) {
      const title = m[m.length - 1];
      return stripMarkdown(title);
    }
  }

  if (trimmed.includes("?")) {
    return stripMarkdown(trimmed);
  }

  return null;
}

function findQuestionTitle(lines, optionStartIndex, fallbackId) {
  for (let k = optionStartIndex - 1; k >= Math.max(0, optionStartIndex - 10); k--) {
    const title = extractTitleFromLine(lines[k]);
    if (title) return title;
  }

  return `Câu hỏi ${fallbackId}`;
}

/** Scan for consecutive **A)** / **B)** / **C)** blocks (common agent output). */
function parseOptionGroups(text) {
  const lines = text.split("\n");
  const questions = [];
  let i = 0;

  while (i < lines.length) {
    const first = matchOptionLine(lines[i]);
    if (!first || first.letter !== "A") {
      i++;
      continue;
    }

    const options = [first];
    let j = i + 1;

    while (j < lines.length) {
      const next = matchOptionLine(lines[j]);
      if (!next) break;
      if (next.letter === "A" && options.length >= 2) break;
      if (!options.some((o) => o.letter === next.letter)) {
        options.push(next);
      }
      j++;
    }

    if (options.length >= 2) {
      questions.push({
        id: String(questions.length + 1),
        title: findQuestionTitle(lines, i, questions.length + 1),
        options,
      });
      i = j;
    } else {
      i++;
    }
  }

  return questions;
}

function parseQuestionBlocks(text) {
  const questions = [];
  const regex =
    /(?:^|\n)\s*(?:#{1,3}\s*)?\*\*Câu\s*(?:hỏi\s*)?(\d+)\s*[-–—:.]\s*(.+?)\*\*([\s\S]*?)(?=(?:^|\n)\s*(?:#{1,3}\s*)?\*\*Câu\s*(?:hỏi\s*)?\d+|\n##\s+\S|$)/gi;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const [, id, title, body] = match;
    const options = parseOptions(body);
    if (options.length > 0) {
      questions.push({ id, title: stripMarkdown(title), options });
    }
  }

  return questions;
}

/** Parse open questions from skill-requirement output. */
export function parseOpenQuestions(markdown) {
  if (!markdown) return [];

  const normalized = normalizeMarkdown(markdown);

  const sectionMatch = normalized.match(
    /##\s*(?:Open questions|Câu hỏi)[\s\S]*/i,
  );
  const searchText = sectionMatch ? sectionMatch[0] : normalized;

  const structured = parseQuestionBlocks(searchText);
  if (structured.length > 0) return structured;

  const grouped = parseOptionGroups(searchText);
  if (grouped.length > 0) return grouped;

  return parseOptionGroups(normalized);
}

/** Build text block appended to user prompt when answers are selected. */
export function buildAnswersText(questions, answers) {
  const lines = [];

  for (const q of questions) {
    const a = answers[q.id];
    if (!a?.choice) continue;

    if (a.choice === "D") {
      const custom = a.customText?.trim();
      if (!custom) continue;
      lines.push(`- Câu ${q.id}: D — ${custom}`);
      continue;
    }

    const opt = q.options.find((o) => o.letter === a.choice);
    lines.push(`- Câu ${q.id}: ${a.choice} — ${opt?.text || a.choice}`);
  }

  if (lines.length === 0) return "";
  return `\n\nTrả lời câu hỏi requirement:\n${lines.join("\n")}`;
}

export function buildEffectivePrompt(basePrompt, questions, answers) {
  const appendix = buildAnswersText(questions, answers);
  if (!appendix) return basePrompt.trim();
  return `${basePrompt.trim()}${appendix}`;
}

export function allQuestionsAnswered(questions, answers) {
  return questions.every((q) => {
    const a = answers[q.id];
    if (!a?.choice) return false;
    if (a.choice === "D") return Boolean(a.customText?.trim());
    return true;
  });
}
