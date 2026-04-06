export const OKX_DEFAULT_PAIR = "BTC-USDT";
export const OKX_DEFAULT_BAR = "1H";

export const OKX_PAIRS = [
  { value: "BTC-USDT", label: "BTC/USDT", base: "BTC" },
  { value: "ETH-USDT", label: "ETH/USDT", base: "ETH" },
  { value: "SOL-USDT", label: "SOL/USDT", base: "SOL" },
  { value: "BNB-USDT", label: "BNB/USDT", base: "BNB" },
  { value: "XRP-USDT", label: "XRP/USDT", base: "XRP" },
  { value: "DOGE-USDT", label: "DOGE/USDT", base: "DOGE" },
  { value: "ADA-USDT", label: "ADA/USDT", base: "ADA" },
  { value: "AVAX-USDT", label: "AVAX/USDT", base: "AVAX" },
  { value: "MATIC-USDT", label: "MATIC/USDT", base: "MATIC" },
  { value: "LINK-USDT", label: "LINK/USDT", base: "LINK" },
];

export const OKX_BARS = [
  { value: "15m", label: "15M" },
  { value: "1H", label: "1H" },
  { value: "4H", label: "4H" },
];

export const OKX_PUBLIC_WS_ENDPOINTS = [
  "wss://ws.okx.com:8443/ws/v5/public",
  "wss://wsaws.okx.com:8443/ws/v5/public",
  "wss://wsus.okx.com:8443/ws/v5/public",
];

export const OKX_BUSINESS_WS_ENDPOINTS = [
  "wss://ws.okx.com:8443/ws/v5/business",
  "wss://wsaws.okx.com:8443/ws/v5/business",
  "wss://wsus.okx.com:8443/ws/v5/business",
];

// ─── Direct OKX Endpoints ─────────────────────────────────────────────────────
const OKX_DIRECT_BASES = [
  "https://www.okx.com/api/v5/market",
  "https://my.okx.com/api/v5/market",
  "https://eea.okx.com/api/v5/market",
];

const OKX_RECENT_LIMIT = 300;
const OKX_HISTORY_LIMIT = 100;
const BAR_MS = {
  "15m": 15 * 60 * 1000,
  "1H": 60 * 60 * 1000,
  "4H": 4 * 60 * 60 * 1000,
};

const supportedPairs = new Set(OKX_PAIRS.map((p) => p.value));
const supportedBars = new Set(OKX_BARS.map((b) => b.value));

export function isSupportedPair(instId) { return supportedPairs.has(instId); }
export function isSupportedBar(bar) { return supportedBars.has(bar); }
export function getPairLabel(instId) { return OKX_PAIRS.find((p) => p.value === instId)?.label ?? instId; }
export function getPairBase(instId) { return OKX_PAIRS.find((p) => p.value === instId)?.base ?? instId; }

function normalizeCandle(row) {
  return {
    t: Number(row[0]), o: Number(row[1]), h: Number(row[2]),
    l: Number(row[3]), c: Number(row[4]), v: Number(row[5]),
    live: row[8] === "0",
  };
}

// ─── In-memory cache ──────────────────────────────────────────────────────────
const _cache = new Map();
const CACHE_TTL = 60_000;

function cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) { _cache.delete(key); return null; }
  return hit.data;
}
function cacheSet(key, data) {
  _cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
}

// ─── Fetch satu URL ───────────────────────────────────────────────────────────
async function tryUrl(url) {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const payload = JSON.parse(await res.text());
  if (payload?.code !== "0" || !Array.isArray(payload?.data))
    throw new Error("invalid payload");
  return payload.data;
}

// ─── fetchOkxJson: direct OKX ────────────────────────────────────────────────
async function fetchOkxJson(pathname) {
  // Race semua direct OKX endpoints bersamaan
  const directUrls = OKX_DIRECT_BASES.map((b) => `${b}${pathname}`);
  try {
    return await Promise.any(directUrls.map(tryUrl));
  } catch {
    throw new Error("Semua endpoint OKX tidak dapat dijangkau.");
  }
}

// ─── Recent candles ───────────────────────────────────────────────────────────
async function fetchRecentCandles({ instId, bar, limit = OKX_RECENT_LIMIT }) {
  const key = `recent:${instId}:${bar}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const data = await fetchOkxJson(
    `/candles?instId=${encodeURIComponent(instId)}&bar=${encodeURIComponent(bar)}&limit=${Math.min(limit, OKX_RECENT_LIMIT)}`
  );
  const result = data.map(normalizeCandle).reverse();
  cacheSet(key, result);
  return result;
}

// ─── fetchSince2026: parallel pagination ─────────────────────────────────────
const START_TS = new Date("2026-01-01T00:00:00Z").getTime();

async function fetchSince2026({ instId, bar }) {
  const key = `since2026:${instId}:${bar}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const candleMs = BAR_MS[bar];
  if (!candleMs) throw new Error("Interval tidak didukung.");

  const now = Date.now();
  const pageCount = Math.ceil((now - START_TS) / candleMs / OKX_HISTORY_LIMIT);

  const pagePromises = Array.from({ length: pageCount }, (_, i) => {
    const params = new URLSearchParams({ instId, bar, limit: String(OKX_HISTORY_LIMIT) });
    if (i > 0) {
      const afterTs = now - i * OKX_HISTORY_LIMIT * candleMs;
      if (afterTs < START_TS) return null;
      params.set("after", String(afterTs));
    }
    return fetchOkxJson(`/history-candles?${params.toString()}`)
      .then((batch) => batch.map(normalizeCandle).filter((c) => c.t >= START_TS))
      .catch(() => []);
  }).filter(Boolean);

  const CONCURRENCY = 5;
  const allRows = [];
  for (let i = 0; i < pagePromises.length; i += CONCURRENCY) {
    const results = await Promise.all(pagePromises.slice(i, i + CONCURRENCY));
    results.forEach((rows) => allRows.push(...rows));
  }

  const seen = new Set();
  const result = allRows
    .filter((c) => { if (seen.has(c.t)) return false; seen.add(c.t); return true; })
    .sort((a, b) => a.t - b.t);

  cacheSet(key, result);
  return result;
}

// ─── Public export ────────────────────────────────────────────────────────────
export async function fetchOkxCandles({ instId, bar, range = "since2026" }) {
  if (range === "recent") return fetchRecentCandles({ instId, bar });
  return fetchSince2026({ instId, bar });
}

// ─── Formatters ───────────────────────────────────────────────────────────────
export function formatCurrency(value) {
  if (value == null || Number.isNaN(value)) return "-";
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 2 : abs >= 100 ? 2 : abs >= 1 ? 4 : 6;
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(value);
}

export function formatNumber(value) {
  if (value == null || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

export function formatTimestamp(timestamp, bar) {
  if (!timestamp) return "-";
  const date = new Date(timestamp);
  const withDate = ["4H", "1D"].includes(bar);
  return new Intl.DateTimeFormat("id-ID", {
    day: withDate ? "2-digit" : undefined,
    month: withDate ? "short" : undefined,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
