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
  { value: "LINK-USDT", label: "LINK/USDT", base: "LINK" }
];

export const OKX_BARS = [
  { value: "15m", label: "15M" },
  { value: "1H", label: "1H" },
  { value: "4H", label: "4H" }
];

export const OKX_PUBLIC_WS_ENDPOINTS = [
  "wss://ws.okx.com:8443/ws/v5/public",
  "wss://wsaws.okx.com:8443/ws/v5/public",
  "wss://wsus.okx.com:8443/ws/v5/public"
];

export const OKX_BUSINESS_WS_ENDPOINTS = [
  "wss://ws.okx.com:8443/ws/v5/business",
  "wss://wsaws.okx.com:8443/ws/v5/business",
  "wss://wsus.okx.com:8443/ws/v5/business"
];

const OKX_REST_BASES = [
  "https://www.okx.com/api/v5/market",
  "https://my.okx.com/api/v5/market",
  "https://eea.okx.com/api/v5/market"
];
const OKX_RECENT_LIMIT = 300;
const OKX_HISTORY_LIMIT = 100;
const BAR_MS = {
  "1m": 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1H": 60 * 60 * 1000,
  "4H": 4 * 60 * 60 * 1000,
  "1D": 24 * 60 * 60 * 1000
};

const supportedPairs = new Set(OKX_PAIRS.map((p) => p.value));
const supportedBars = new Set(OKX_BARS.map((b) => b.value));

export function isSupportedPair(instId) { return supportedPairs.has(instId); }
export function isSupportedBar(bar) { return supportedBars.has(bar); }
export function getPairLabel(instId) { return OKX_PAIRS.find((p) => p.value === instId)?.label ?? instId; }
export function getPairBase(instId) { return OKX_PAIRS.find((p) => p.value === instId)?.base ?? instId; }

function normalizeCandle(row) {
  return { t: Number(row[0]), o: Number(row[1]), h: Number(row[2]), l: Number(row[3]), c: Number(row[4]), v: Number(row[5]), live: row[8] === "0" };
}

async function fetchOkxJson(pathname) {
  const directUrls = OKX_REST_BASES.map((base) => `${base}${pathname}`);
  const requestUrls = [...directUrls, ...directUrls.map((url) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`)];
  const failures = [];
  for (const url of requestUrls) {
    try {
      const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) { failures.push(`${url} -> HTTP ${response.status}`); continue; }
      const payload = JSON.parse(await response.text());
      if (payload?.code !== "0" || !Array.isArray(payload?.data)) { failures.push(`${url} -> invalid`); continue; }
      return payload.data;
    } catch (error) {
      failures.push(`${url} -> ${error instanceof Error ? error.message : "fetch gagal"}`);
    }
  }
  throw new Error(`Semua fetch OKX gagal. ${failures[0] ?? ""}`);
}

async function fetchRecentCandles({ instId, bar, limit = OKX_RECENT_LIMIT }) {
  const data = await fetchOkxJson(`/candles?instId=${encodeURIComponent(instId)}&bar=${encodeURIComponent(bar)}&limit=${Math.min(limit, OKX_RECENT_LIMIT)}`);
  return data.map(normalizeCandle).reverse();
}

// Fetch semua candle mulai dari 1 Januari 2026 00:00:00 UTC
const START_TS = new Date("2026-01-01T00:00:00Z").getTime();

async function fetchSince2026({ instId, bar }) {
  const candleMs = BAR_MS[bar];
  if (!candleMs) throw new Error("Interval tidak didukung.");

  const allRows = [];
  let afterCursor = null;

  while (true) {
    const params = new URLSearchParams({ instId, bar, limit: String(OKX_HISTORY_LIMIT) });
    if (afterCursor) params.set("after", afterCursor);

    const batch = await fetchOkxJson(`/history-candles?${params.toString()}`);
    if (!batch.length) break;

    const normalized = batch.map(normalizeCandle);

    // Hanya ambil candle yang >= 1 Jan 2026
    const filtered = normalized.filter(c => c.t >= START_TS);
    allRows.push(...filtered);

    // Jika ada candle yang terpotong di bawah START_TS, berhenti
    if (filtered.length < normalized.length) break;

    // Tidak ada data lagi dari server
    if (normalized.length < OKX_HISTORY_LIMIT) break;

    const oldest = normalized[normalized.length - 1];
    if (!oldest || oldest.t <= START_TS) break;

    afterCursor = String(oldest.t - 1);
  }

  // Urutkan ascending: candle terlama → terbaru
  return allRows.sort((a, b) => a.t - b.t);
}

export async function fetchOkxCandles({ instId, bar, range = "since2026" }) {
  if (range === "recent") return fetchRecentCandles({ instId, bar });
  return fetchSince2026({ instId, bar });
}

export function formatCurrency(value) {
  if (value == null || Number.isNaN(value)) return "-";
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 2 : abs >= 100 ? 2 : abs >= 1 ? 4 : 6;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function formatNumber(value) {
  if (value == null || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

export function formatTimestamp(timestamp, bar) {
  if (!timestamp) return "-";
  const date = new Date(timestamp);
  const withDate = ["4H", "1D"].includes(bar);
  return new Intl.DateTimeFormat("id-ID", { day: withDate ? "2-digit" : undefined, month: withDate ? "short" : undefined, hour: "2-digit", minute: "2-digit" }).format(date);
}
