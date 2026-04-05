import { NextResponse } from "next/server";

import { fetchOkxCandles, isSupportedBar, isSupportedPair } from "@/lib/okx";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const instId = searchParams.get("instId") ?? "";
  const bar = searchParams.get("bar") ?? "";
  const range = searchParams.get("range") ?? "recent";

  if (!isSupportedPair(instId) || !isSupportedBar(bar)) {
    return NextResponse.json(
      { error: "Instrument atau interval tidak didukung." },
      { status: 400 }
    );
  }

  try {
    const candles = await fetchOkxCandles({ instId, bar, range });

    return NextResponse.json({
      candles,
      meta: {
        count: candles.length,
        range
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal memuat history candle." },
      { status: 500 }
    );
  }
}
