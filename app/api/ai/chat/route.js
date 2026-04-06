/**
 * app/api/ai/chat/route.js
 *
 * POST /api/ai/chat
 * Body: { messages, context: { instId, bar, candles, indicators, signal } }
 * Returns: { reply, model }
 */

export const runtime = "nodejs";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

function buildSystemPrompt(context) {
  if (!context) {
    return `You are Zyeeque AI Trading Assistant — a professional crypto scalping analyst.
Answer concisely in the same language the user uses.`;
  }

  const { instId, bar, candles = [], indicators = {}, signal } = context;
  const last = candles[candles.length - 1];

  const getLast = (arr) => {
    if (!Array.isArray(arr)) return null;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i] != null) return Number(arr[i]).toFixed(4);
    }
    return null;
  };

  const marketSnap = last
    ? `Current price: ${last.c} | O: ${last.o} H: ${last.h} L: ${last.l} V: ${last.v}`
    : "No live price data";

  const indSnap = [
    `RSI(14): ${getLast(indicators.rsi) ?? "N/A"}`,
    `EMA7: ${getLast(indicators.ema7) ?? "N/A"}`,
    `EMA25: ${getLast(indicators.ema25) ?? "N/A"}`,
    `MACD: ${getLast(indicators.macdLine) ?? "N/A"} | Signal: ${getLast(indicators.signalLine) ?? "N/A"}`,
    `BB Upper: ${getLast(indicators.bbUpper) ?? "N/A"} | Lower: ${getLast(indicators.bbLower) ?? "N/A"}`,
    `SuperTrend dir: ${indicators.stDir === -1 ? "BULLISH 🟢" : indicators.stDir === 1 ? "BEARISH 🔴" : "N/A"}`,
  ].join("\n");

  const signalSnap = signal
    ? `Latest AI Signal: ${signal.signal} | Confidence: ${(signal.confidence * 100).toFixed(0)}% | Reason: ${signal.reason} | SL: ${signal.sl_pct}% | TP: ${signal.tp_pct}%`
    : "No signal yet";

  return `You are Zyeeque AI Trading Assistant — a professional crypto scalping analyst.

=== LIVE MARKET DATA ===
Pair: ${instId} | Timeframe: ${bar} | Candles loaded: ${candles.length}
${marketSnap}

=== INDICATORS (latest values) ===
${indSnap}

=== AI SIGNAL ===
${signalSnap}

Rules:
- Answer concisely (max 3-4 sentences unless user asks for detail)
- Base all analysis on the data above, NOT assumptions
- Use the same language as the user (Indonesian or English)
- If asked about current price/indicators, use the data above`;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { messages = [], context } = body;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "OPENROUTER_API_KEY belum diset" }, { status: 500 });
    }

    if (!messages.length) {
      return Response.json({ error: "messages kosong" }, { status: 400 });
    }

    const systemPrompt = buildSystemPrompt(context);

    const res = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
        "X-Title": "Zyeeque AI Chat",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL ?? "anthropic/claude-3.5-haiku",
        max_tokens: 512,
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.slice(-10), // kirim max 10 pesan terakhir
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      return Response.json({ error: `OpenRouter ${res.status}: ${err}` }, { status: 502 });
    }

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content ?? "Tidak ada respons dari AI.";

    return Response.json({ reply, model: data?.model });
  } catch (err) {
    console.error("[/api/ai/chat]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
