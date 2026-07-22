const CURSOR_CSV_URL = "https://cursor.com/api/dashboard/export-usage-events-csv";
const { resolveCursorSessionCookie } = require("./cursorSessionAuth");

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}

function toInt(value) {
  const n = parseInt(String(value || "0").replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function parseUsageRow(record) {
  const dateStr = record.Date || "";
  const eventTime = Date.parse(dateStr);
  if (!dateStr || Number.isNaN(eventTime)) return null;

  const inputNoCache = toInt(record["Input (w/o Cache Write)"]);
  const inputCache = toInt(record["Input (w/ Cache Write)"]);
  const cacheRead = toInt(record["Cache Read"]);
  const outputTokens = toInt(record["Output Tokens"]);
  const totalTokens = toInt(record["Total Tokens"]);

  return {
    date: dateStr,
    eventTime,
    model: String(record.Model || "").trim(),
    inputTokens: inputNoCache + inputCache + cacheRead,
    outputTokens,
    totalTokens: totalTokens || inputNoCache + inputCache + cacheRead + outputTokens,
    kind: record.Kind || "",
    cost: record.Cost || record["Cost to you"] || "",
  };
}

function parseCursorUsageCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];

  return rows
    .map(parseUsageRow)
    .filter(Boolean)
    .sort((a, b) => a.eventTime - b.eventTime);
}

function getCursorSessionCookie() {
  return resolveCursorSessionCookie();
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function resolveDateRange({ days, startDate, endDate }) {
  if (startDate && endDate) {
    return {
      start: startOfDay(new Date(startDate)),
      end: endOfDay(new Date(endDate)),
    };
  }

  const safeDays = Math.min(Math.max(parseInt(days, 10) || 7, 1), 90);
  const end = endOfDay(new Date());
  const start = startOfDay(new Date(end.getTime() - (safeDays - 1) * 86400000));
  return { start, end };
}

async function fetchCursorUsageCsv({ startDate, endDate, days = 7 } = {}) {
  const cookie = getCursorSessionCookie();
  if (!cookie) {
    const err = new Error(
      "Không lấy được session Cursor. Hãy đăng nhập Cursor IDE, hoặc set CURSOR_SESSION_TOKEN / CURSOR_SESSION_COOKIE trong .env."
    );
    err.status = 503;
    throw err;
  }

  const range = resolveDateRange({ days, startDate, endDate });
  const url = new URL(CURSOR_CSV_URL);
  url.searchParams.set("startDate", String(range.start.getTime()));
  url.searchParams.set("endDate", String(range.end.getTime()));
  url.searchParams.set("strategy", "tokens");

  const res = await fetch(url, {
    headers: {
      Cookie: cookie,
      Accept: "text/csv, text/plain, */*",
      "User-Agent": "quoc-agent-skills/1.0",
    },
  });

  if (!res.ok) {
    const err = new Error(
      `Cursor CSV export trả về HTTP ${res.status}. Kiểm tra lại CURSOR_SESSION_TOKEN (cookie WorkosCursorSessionToken).`
    );
    err.status = res.status === 401 || res.status === 403 ? 503 : 502;
    throw err;
  }

  const text = await res.text();
  if (!text.trim()) {
    return { events: [], dateRange: range };
  }

  return {
    events: parseCursorUsageCsv(text),
    dateRange: range,
  };
}

module.exports = {
  parseCursorUsageCsv,
  fetchCursorUsageCsv,
  resolveDateRange,
  getCursorSessionCookie,
};
