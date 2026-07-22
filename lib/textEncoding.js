function fixPartialMojibake(text) {
  return String(text || "")
    .replace(/Ä['\u2018\u0091]/g, "đ")
    .replace(/vá»›/g, "vẻ")
    .replace(/có vớ/gi, "có vẻ")
    .replace(/gì[\s\S]{0,4}óy\s*$/i, "gì đấy")
    .replace(/Ãº/g, "ú")
    .replace(/Ã´/g, "ô")
    .replace(/Ã¢/g, "â")
    .replace(/Ã£/g, "ã")
    .replace(/Ã¡/g, "á")
    .replace(/Ã /g, "à")
    .replace(/Ã¨/g, "è")
    .replace(/Ã©/g, "é")
    .replace(/Ãª/g, "ê")
    .replace(/Ã¬/g, "ì")
    .replace(/Ã­/g, "í")
    .replace(/Ã²/g, "ò")
    .replace(/Ã³/g, "ó")
    .replace(/Ã¹/g, "ù")
    .replace(/Ã½/g, "ý")
    .replace(/Ã¯/g, "ï")
    .replace(/Ã¶/g, "ö")
    .replace(/Ã¼/g, "ü")
    .replace(/Ã§/g, "ç");
}

function looksCorruptedText(text) {
  const value = String(text || "");
  if (!value) return false;
  // UTF-8 đọc nhầm Latin-1 hoặc ký tự thay thế — không dùng /i vì sẽ match nhầm "ã" trong tiếng Việt.
  if (/Ã.|Ä.|â€|ï¿½|\uFFFD/.test(value)) return true;
  if (/[\u0000-\u001f\u0090-\u009f]/.test(value)) return true;
  // Không dùng /i và không match các cặp phụ âm + "A" trần (vA, bA, sA...) — chữ
  // tiếng Việt bình thường như "sao", "vậy", "bạn" chứa rất nhiều cặp ký tự như vậy,
  // dùng /i sẽ báo nhầm hàng loạt câu hoàn toàn đúng thành "bị lỗi mã hoá".
  if (/áº|á»|Æ°|lÆ°|giA|trA/.test(value)) return true;
  if (/có vớ/i.test(value)) return true;
  if (/gì[\s\S]{0,4}óy\s*$/i.test(value)) return true;
  // Decode mất dấu: ký tự ? thay cho chữ có dấu.
  if (/[a-zA-Z]\?[a-zA-ZÀ-ỹ]/i.test(value) || /[À-ỹ]\?[a-zA-Z]/i.test(value)) return true;
  if (/\b(?:b|t|d|n|m|h|r|l|g|v|p|c|s|u|o|a|e|i)\?[a-z]{1,4}\b/i.test(value)) return true;
  return false;
}

// Windows-1252 dùng vùng byte 0x80-0x9F cho các ký tự "thông minh" (dấu ngoặc kép cong,
// gạch ngang dài, dấu ba chấm...) khác với Latin-1. Khi bytes UTF-8 gốc bị đọc nhầm bằng
// Windows-1252 (lỗi phổ biến khi ghi/đọc file sai charset), các ký tự này xuất hiện thay
// cho byte gốc và cần ánh xạ ngược đầy đủ, không chỉ riêng dấu nháy đơn.
const CP1252_EXTRA_CODEPOINT_TO_BYTE = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

function toMisdecodedUtf8Bytes(text) {
  return Buffer.from(
    [...String(text || "")].map((ch) => {
      const code = ch.codePointAt(0);
      if (code <= 0xff) return code;
      if (CP1252_EXTRA_CODEPOINT_TO_BYTE[code] != null) return CP1252_EXTRA_CODEPOINT_TO_BYTE[code];
      return code & 0xff;
    })
  );
}

function tryFixMojibake(text) {
  const value = String(text || "");
  if (!value) return value;

  try {
    const decoded = toMisdecodedUtf8Bytes(value).toString("utf8");
    const partial = fixPartialMojibake(decoded);
    if (!looksCorruptedText(partial)) return partial;
    if (!looksCorruptedText(decoded)) return decoded;
  } catch {
    // ignore
  }

  const partial = fixPartialMojibake(value);
  return looksCorruptedText(partial) ? value : partial;
}

function normalizeQueryText(text) {
  let value = String(text || "").trim();
  if (!value) return "";

  const match = value.match(/<user_query>([\s\S]*?)<\/user_query>/i);
  if (match) value = match[1].trim();

  const firstLine = value.split("\n").find((line) => line.trim());
  value = (firstLine || value).trim();

  value = tryFixMojibake(value);
  if (looksCorruptedText(value)) {
    const partial = fixPartialMojibake(value);
    if (!looksCorruptedText(partial)) value = partial;
  }
  return value.slice(0, 300);
}

function textQualityScore(text) {
  const value = normalizeQueryText(text);
  if (!value) return -1;
  if (looksCorruptedText(value)) return 0;
  let score = 10;
  const vnChars = (
    value.match(/[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/gi) || []
  ).length;
  score += vnChars * 3;
  score += Math.min(value.length, 200) / 20;
  return score;
}

function pickBetterText(a, b) {
  const scoreA = textQualityScore(a);
  const scoreB = textQualityScore(b);
  if (scoreA !== scoreB) return scoreA > scoreB ? normalizeQueryText(a) : normalizeQueryText(b);
  const normA = normalizeQueryText(a);
  const normB = normalizeQueryText(b);
  return normA.length >= normB.length ? normA : normB;
}

module.exports = {
  looksCorruptedText,
  tryFixMojibake,
  fixPartialMojibake,
  normalizeQueryText,
  textQualityScore,
  pickBetterText,
};
