/**
 * aiEngine.js
 * OpenRouter AI integration untuk scalping decision.
 * Kirim snapshot candle + indikator → dapat sinyal BUY / SELL / HOLD
 */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Model default — bisa diganti lewat env atau parameter
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL ?? "nvidia/nemotron-3-super-120b-a12b:free";

// ─── Helper: ambil N candle terakhir ────────────────────────────────────────
function lastN(arr, n) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(-n);
}

// ─── Build prompt snapshot ───────────────────────────────────────────────────
function buildPrompt({ instId, bar, candles, indicators }) {
  const recent = lastN(candles, 10);
  const fmt = (v) => (v == null ? "null" : Number(v).toFixed(4));

  const candleRows = recent
    .map(
      (c) =>
        `  [${new Date(c.t).toISOString()}] O:${fmt(c.o)} H:${fmt(c.h)} L:${fmt(c.l)} C:${fmt(c.c)} V:${fmt(c.v)}`
    )
    .join("\n");

  const { rsi, macd, bb, superTrend, stochRsi, ema7, ema25 } = indicators ?? {};

  const last = (arr) => {
    if (!Array.isArray(arr)) return null;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i] != null) return arr[i];
    }
    return null;
  };

  const indLines = [
    `RSI(14): ${fmt(last(rsi))}`,
    `EMA7: ${fmt(last(ema7))}`,
    `EMA25: ${fmt(last(ema25))}`,
    `MACD line: ${fmt(last(macd?.macdLine))}  Signal: ${fmt(last(macd?.signalLine))}  Hist: ${fmt(last(macd?.histogram))}`,
    `BB Upper: ${fmt(last(bb?.upper))}  Mid: ${fmt(last(bb?.mid))}  Lower: ${fmt(last(bb?.lower))}`,
    `SuperTrend: ${fmt(last(superTrend?.line))}  Dir: ${last(superTrend?.direction) === 1 ? "BULLISH" : "BEARISH"}`,
    `StochRSI K: ${fmt(last(stochRsi?.k))}  D: ${fmt(last(stochRsi?.d))}`,
  ].join("\n");

  return `You are a professional crypto scalping assistant.

Pair: ${instId}
Timeframe: ${bar}

=== Last 10 Candles ===
${candleRows}

=== Current Indicators ===
${indLines}

=== Task ===
Based ONLY on the data above, output a JSON object with:
- signal: "BUY" | "SELL" | "HOLD"
- confidence: 0.0–1.0
- reason: one concise sentence (max 15 words)
- sl_pct: suggested stop-loss % from entry (e.g. 0.5)
- tp_pct: suggested take-profit % from entry (e.g. 1.0)

Respond ONLY with valid JSON, no markdown, no extra text.`;
}

// ─── Main: getAiSignal ───────────────────────────────────────────────────────
/**
 * @param {object} params
 * @param {string} params.instId       - e.g. "BTC-USDT"
 * @param {string} params.bar          - e.g. "15m"
 * @param {Array}  params.candles      - array candle {t,o,h,l,c,v}
 * @param {object} params.indicators   - hasil calcRSI, calcMACD, dsb dari indicators.js
 * @param {string} [params.model]      - override model OpenRouter
 * @returns {Promise<{signal, confidence, reason, sl_pct, tp_pct, raw}>}
 */
export async function getAiSignal({ instId, bar, candles, indicators, model }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY belum diset di .env.local");

  const prompt = buildPrompt({ instId, bar, candles, indicators });

  const res = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
      "X-Title": "Zyeeque Scalping Bot",
    },
    body: JSON.stringify({
      model: model ?? DEFAULT_MODEL,
      max_tokens: 256,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? "";

  let parsed;
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(clean);
  } catch {
    throw new Error(`AI response bukan JSON valid: ${raw}`);
  }

  // Validasi field wajib
  const signal = String(parsed.signal ?? "HOLD").toUpperCase();
  if (!["BUY", "SELL", "HOLD"].includes(signal)) {
    throw new Error(`Signal tidak valid: ${signal}`);
  }

  return {
    signal,
    confidence: Number(parsed.confidence ?? 0),
    reason: String(parsed.reason ?? ""),
    sl_pct: Number(parsed.sl_pct ?? 0.5),
    tp_pct: Number(parsed.tp_pct ?? 1.0),
    model: data?.model ?? (model ?? DEFAULT_MODEL),
    raw,
  };
}

// ─── List available models dari OpenRouter ───────────────────────────────────
export async function getOpenRouterModels() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY belum diset");

  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Gagal fetch models: ${res.status}`);
  const data = await res.json();
  return data?.data ?? [];
}
