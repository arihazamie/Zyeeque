import { NextResponse } from "next/server";

import { fetchOkxCandles, isSupportedBar, isSupportedPair } from "@/lib/okx";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const instId = searchParams.get("instId") ?? "";
  const bar    = searchParams.get("bar")    ?? "";
  const range  = searchParams.get("range")  ?? "recent";

  if (!isSupportedPair(instId) || !isSupportedBar(bar)) {
    return NextResponse.json(
      { error: "Instrument atau interval tidak didukung." },
      { status: 400 }
    );
  }

  try {
    let candles  = await fetchOkxCandles({ instId, bar, range });
    let usedRange = range;

    // ── Fallback: jika since2026 dapat 0 candle, coba recent ──────────────
    if (candles.length === 0 && range !== "recent") {
      console.warn(`[history] ${instId}/${bar} range=${range} returned 0, fallback to recent`);
      candles   = await fetchOkxCandles({ instId, bar, range: "recent" });
      usedRange = "recent";
    }

    return NextResponse.json({
      candles,
      meta: {
        count:    candles.length,
        range:    usedRange,
        original: range,
        fallback: usedRange !== range,
      },
    });
  } catch (error) {
    // ── Last-resort fallback ke recent ────────────────────────────────────
    try {
      const candles = await fetchOkxCandles({ instId, bar, range: "recent" });
      if (candles.length > 0) {
        return NextResponse.json({
          candles,
          meta: { count: candles.length, range: "recent", original: range, fallback: true },
        });
      }
    } catch {}

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal memuat history candle." },
      { status: 500 }
    );
  }
}

