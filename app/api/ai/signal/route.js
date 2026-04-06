/**
 * app/api/ai/signal/route.js
 *
 * POST /api/ai/signal
 * Body: { instId, bar, candles, indicators, model? }
 * Returns: { signal, confidence, reason, sl_pct, tp_pct, model, timestamp }
 *
 * GET /api/ai/signal/models
 * Returns: list available OpenRouter models
 */

import { getAiSignal, getOpenRouterModels } from "@/lib/aiEngine";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const body = await req.json();
    const { instId, bar, candles, indicators, model } = body;

    if (!instId || !bar || !Array.isArray(candles) || candles.length < 2) {
      return Response.json(
        { error: "instId, bar, dan candles (min 2) wajib diisi" },
        { status: 400 }
      );
    }

    const result = await getAiSignal({ instId, bar, candles, indicators, model });

    return Response.json({
      ...result,
      instId,
      bar,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error("[/api/ai/signal]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const models = await getOpenRouterModels();
    // Filter ke model yang relevan untuk chat/reasoning
    const filtered = models
      .filter((m) => m.id && !m.id.includes("vision") && !m.id.includes("embed"))
      .map((m) => ({ id: m.id, name: m.name, context: m.context_length }))
      .slice(0, 50);
    return Response.json({ models: filtered });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
