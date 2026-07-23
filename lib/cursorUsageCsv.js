const path = require("path");
const fs = require("fs/promises");

const CURSOR_CSV_URL = "https://cursor.com/api/dashboard/export-usage-events-csv";

function resolveCsvDir() {
  if (process.env.CSV_DIR?.trim()) return path.resolve(process.env.CSV_DIR.trim());
  return path.resolve(__dirname, "..", "CSV");
}
const CSV_DIR = resolveCsvDir();
const DEFAULT_CSV_FILENAME = "usage-events.csv";
// Khoảng billing mặc định: 7 ngày UTC (khớp export trên cursor.com/dashboard).
const DEFAULT_BILLING_START_MS = 1784246400000;
const DEFAULT_BILLING_END_MS = 1784851199999;

function getDefaultBillingRangeUtc() {
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end };
}
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

function toFloat(value) {
  const raw = String(value || "").trim().replace(/[$,]/g, "");
  if (!raw || /^included$/i.test(raw)) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function parseUsageRow(record) {
  const dateStr = record.Date || "";
  const eventTime = Date.parse(dateStr);
  if (!dateStr || Number.isNaN(eventTime)) return null;

  const inputNoCache = toInt(record["Input (w/o Cache Write)"]);
  const inputCacheWrite = toInt(record["Input (w/ Cache Write)"]);
  const cacheRead = toInt(record["Cache Read"]);
  const outputTokens = toInt(record["Output Tokens"]);
  const totalTokens = toInt(record["Total Tokens"]);
  const costRaw = String(record.Cost || record["Cost to you"] || "").trim();

  return {
    date: dateStr,
    eventTime,
    model: String(record.Model || "").trim(),
    inputNoCache,
    inputCacheWrite,
    cacheRead,
    outputTokens,
    inputTokens: inputNoCache + inputCacheWrite + cacheRead,
    totalTokens: totalTokens || inputNoCache + inputCacheWrite + cacheRead + outputTokens,
    kind: record.Kind || "",
    cost: costRaw,
    costAmount: toFloat(costRaw),
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

function resolveDateRange({ days, startDate, endDate, exact = false }) {
  if (startDate != null && endDate != null) {
    if (exact) {
      return { start: new Date(startDate), end: new Date(endDate) };
    }
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

async function fetchCursorUsageCsvText({ startDate, endDate, days = 7, exact = false } = {}) {
  const cookie = getCursorSessionCookie();
  if (!cookie) {
    const err = new Error(
      "Không lấy được session Cursor. Hãy đăng nhập Cursor IDE, hoặc set CURSOR_SESSION_TOKEN / CURSOR_SESSION_COOKIE trong .env."
    );
    err.status = 503;
    throw err;
  }

  const range = resolveDateRange({ days, startDate, endDate, exact });
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

  return { text: await res.text(), dateRange: range };
}

async function fetchCursorUsageCsv({ startDate, endDate, days = 7 } = {}) {
  const { text, dateRange } = await fetchCursorUsageCsvText({ startDate, endDate, days });
  if (!text.trim()) {
    return { events: [], dateRange };
  }

  return {
    events: parseCursorUsageCsv(text),
    dateRange,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn, { attempts = 5, delayMs = 150 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (err.code !== "EBUSY" && err.code !== "EPERM") throw err;
      if (i < attempts - 1) await sleep(delayMs * (i + 1));
    }
  }
  throw lastErr;
}

async function writeCsvFile(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, text, "utf8");
  try {
    await withRetry(() => fs.rename(tmpPath, filePath));
  } catch {
    await withRetry(async () => {
      await fs.writeFile(filePath, text, "utf8");
    });
    await fs.unlink(tmpPath).catch(() => {});
  }
}

async function clearCsvDir({ keepFilename = DEFAULT_CSV_FILENAME } = {}) {
  await fs.mkdir(CSV_DIR, { recursive: true });
  const entries = await fs.readdir(CSV_DIR, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name !== keepFilename)
      .map(async (entry) => {
        try {
          await withRetry(() => fs.unlink(path.join(CSV_DIR, entry.name)), { attempts: 3 });
        } catch {
          // OneDrive/Excel có thể khóa file — bỏ qua file cũ, không chặn tải CSV mới.
        }
      })
  );
}

async function downloadAndSaveUsageCsv({ startDate, endDate, days, useBillingCycle = true } = {}) {
  let rangeStart = startDate;
  let rangeEnd = endDate;
  let useExactRange = startDate != null && endDate != null;

  if (!useExactRange && useBillingCycle && days == null) {
    const billing = getDefaultBillingRangeUtc();
    rangeStart = billing.start.getTime();
    rangeEnd = billing.end.getTime();
    useExactRange = true;
  }

  const { text, dateRange } = await fetchCursorUsageCsvText({
    startDate: rangeStart,
    endDate: rangeEnd,
    days,
    exact: useExactRange,
  });
  const filePath = path.join(CSV_DIR, DEFAULT_CSV_FILENAME);
  let saveWarning = null;

  try {
    await writeCsvFile(filePath, text);
    await clearCsvDir();
  } catch (err) {
    saveWarning =
      `Không ghi được file CSV vào ${CSV_DIR} (${err.code || err.message}). ` +
      "Đóng Excel/OneDrive nếu đang mở usage-events.csv rồi thử lại.";
    console.warn("[csv]", saveWarning);
  }

  const saved = !saveWarning && Boolean(text.trim());
  if (!text.trim() && !saveWarning) {
    saveWarning = "Cursor trả về CSV rỗng — không có dữ liệu billing trong khoảng ngày đã chọn.";
  }

  return {
    saved,
    filePath: saved ? filePath : null,
    csvDir: CSV_DIR,
    dateRange,
    text,
    saveWarning,
  };
}

module.exports = {
  CSV_DIR,
  DEFAULT_CSV_FILENAME,
  DEFAULT_BILLING_START_MS,
  DEFAULT_BILLING_END_MS,
  CURSOR_CSV_URL,
  getDefaultBillingRangeUtc,
  parseCursorUsageCsv,
  fetchCursorUsageCsv,
  fetchCursorUsageCsvText,
  downloadAndSaveUsageCsv,
  clearCsvDir,
  resolveDateRange,
  getCursorSessionCookie,
};
