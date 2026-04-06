"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  OKX_BARS, OKX_BUSINESS_WS_ENDPOINTS, OKX_DEFAULT_BAR,
  OKX_DEFAULT_PAIR, OKX_PAIRS,
  formatCurrency, formatNumber, getPairBase,
} from "@/lib/okx";
import {
  calcSMA, calcEMA, calcRSI, calcMACD, calcBB,
  calcSuperTrend, calcStochRSI, calcWilliamsR, calcCCI,
  calcEMARibbon, calcVWAP,
} from "@/lib/indicators";

export const dynamic = "force-dynamic";

// ─── colour palette ────────────────────────────────────────────────────────
const C = {
  ma7:    "#1d4ed8",
  ma25:   "#9333ea",
  ma99:   "#c2410c",
  bbUpper:"#6366f1",
  bbLower:"#6366f1",
  bbMid:  "#818cf8",
  macd:   "#2563eb",
  signal: "#dc2626",
  rsiLine:"#7c3aed",
  rsi70:  "#dc2626",
  rsi30:  "#059669",
  stBull: "#059669",   // SuperTrend bullish
  stBear: "#dc2626",   // SuperTrend bearish
  stochK: "#2563eb",
  stochD: "#64748b",
  wr:     "#0891b2",
  cci:    "#0f766e",
  ribbon: ["#1e40af","#3b82f6","#818cf8","#a78bfa","#c4b5fd"],
  vwap:   "#d97706",
  vol:    { up: "rgba(5,150,105,0.3)", dn: "rgba(220,38,38,0.3)" },
};

// ─── helpers ───────────────────────────────────────────────────────────────
function toSeries(times, values, filterNull = true) {
  return times
    .map((t, i) => ({ time: t, value: values[i] }))
    .filter(p => !filterNull || p.value !== null);
}

// ─── sub-components ────────────────────────────────────────────────────────
function Dot({ status }) {
  const color = { connected:"#059669", reconnecting:"#f59e0b", error:"#dc2626", polling:"#6366f1" }[status] ?? "#94a3b8";
  return <span className="pulse-dot" style={{ display:"inline-block", width:7, height:7, borderRadius:"50%", background:color, flexShrink:0 }} />;
}

function Kbd({ active, onClick, children, color }) {
  return (
    <button onClick={onClick} style={{
      padding:"3px 9px", borderRadius:4, fontSize:11, fontWeight:600,
      cursor:"pointer", transition:"all .15s",
      color: active ? "#ffffff" : "var(--text-secondary)",
      background: active ? (color ?? "#2563eb") : "rgba(0,0,0,0.04)",
      border: `1px solid ${active ? "transparent" : "var(--border-subtle)"}`,
    }}>{children}</button>
  );
}

function IndBtn({ label, active, color, onClick }) {
  return (
    <button onClick={onClick} style={{
      display:"flex", alignItems:"center", gap:5,
      padding:"3px 9px", borderRadius:4, fontSize:11, fontWeight:500,
      cursor:"pointer", transition:"all .15s",
      background: active ? `${color}22` : "transparent",
      border: `1px solid ${active ? color : "var(--border-subtle)"}`,
      color: active ? color : "var(--text-muted)",
    }}>
      <span style={{ width:8, height:8, borderRadius:2, background: active ? color : "var(--text-muted)", flexShrink:0 }} />
      {label}
    </button>
  );
}

function StatCell({ label, value, color }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
      <span style={{ fontSize:10, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.08em" }}>{label}</span>
      <span style={{ fontSize:12, fontFamily:"'JetBrains Mono', monospace", color: color ?? "var(--text-secondary)", fontWeight:500 }}>{value}</span>
    </div>
  );
}

// ─── main ──────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [instId, setInstId]   = useState(OKX_DEFAULT_PAIR);
  const [bar, setBar]         = useState(OKX_DEFAULT_BAR);
  const [candles, setCandles] = useState([]);
  const [historyHash, setHistoryHash] = useState(0);
  const [error, setError]     = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [wsStatus, setWsStatus]   = useState("connecting");
  const [liveCandle, setLiveCandle] = useState(null);
  const [flashClass, setFlashClass] = useState("");
  const [chartType, setChartType]   = useState("candle");
  const [showIndPanel, setShowIndPanel] = useState(false);
  const indPanelRef = useRef(null);

  // indicators
  const [indMA7,     setIndMA7]     = useState(false);
  const [indMA25,    setIndMA25]    = useState(false);
  const [indMA99,    setIndMA99]    = useState(false);
  const [indBB,      setIndBB]      = useState(false);
  const [indVol,     setIndVol]     = useState(false);
  const [indRSI,     setIndRSI]     = useState(false);
  const [indMACD,    setIndMACD]    = useState(false);
  const [indST,      setIndST]      = useState(false);   // SuperTrend
  const [indStoch,   setIndStoch]   = useState(false);  // Stoch RSI
  const [indWR,      setIndWR]      = useState(false);  // Williams %R
  const [indCCI,     setIndCCI]     = useState(false);  // CCI
  const [indRibbon,  setIndRibbon]  = useState(false);  // EMA Ribbon
  const [indVWAP,    setIndVWAP]    = useState(false);  // VWAP

  // indicator settings — nilai parameter yang bisa diubah user
  const [indSettings, setIndSettings] = useState({
    ma7:   { period: 7 },
    ma25:  { period: 25 },
    ma99:  { period: 99 },
    bb:    { period: 20, stdDev: 2 },
    rsi:   { period: 14, ob: 70, os: 30 },
    macd:  { fast: 12, slow: 26, signal: 9 },
    st:    { period: 10, multiplier: 3 },
    stoch: { rsiPeriod: 14, stochPeriod: 14, kPeriod: 3, dPeriod: 3 },
    wr:    { period: 14 },
    cci:   { period: 20 },
  });

  // helper: update satu field dalam indSettings
  const setSetting = useCallback((key, field, raw) => {
    const val = field === "multiplier" ? parseFloat(raw) : parseInt(raw, 10);
    if (isNaN(val) || val <= 0) return;
    setIndSettings(prev => ({ ...prev, [key]: { ...prev[key], [field]: val } }));
  }, []);

  // indikator mana yang sedang expand settings-nya
  const [expandedSetting, setExpandedSetting] = useState(null);

  // chart refs
  const containerRef = useRef(null);
  const chartRef     = useRef(null);
  const seriesMap    = useRef({});

  // ws / polling refs
  const wsRef         = useRef(null);
  const pingRef       = useRef(null);
  const retryRef      = useRef(null);
  const connTimerRef  = useRef(null); // connection timeout
  const retryCountRef = useRef(0);
  const prevPriceRef  = useRef(null);
  const goneRef       = useRef(false);
  const pollRef       = useRef(null); // REST polling fallback

  // ── history ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let gone = false;
    const ctrl = new AbortController();
    setIsLoading(true); setError(""); setLiveCandle(null);

    fetch(`/api/okx/history?instId=${encodeURIComponent(instId)}&bar=${encodeURIComponent(bar)}&range=since2026`,
      { cache:"no-store", signal:ctrl.signal })
      .then(r => r.json())
      .then(p => { if (!gone) { setCandles(p.candles ?? []); setHistoryHash(Date.now()); } })
      .catch(e => { if (!gone && !ctrl.signal.aborted) { setCandles([]); setError(e.message ?? "Error"); } })
      .finally(() => { if (!gone) setIsLoading(false); });

    return () => { gone = true; ctrl.abort(); };
  }, [instId, bar]);

  // ── build / rebuild chart ─────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;
    let ro;

    (async () => {
      const { createChart, CrosshairMode, LineStyle } = await import("lightweight-charts");
      const el = containerRef.current;

      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; seriesMap.current = {}; }

      const chart = createChart(el, {
        width: el.clientWidth,
        height: el.clientHeight,
        layout:    { background:{ color:"transparent" }, textColor:"#64748b", fontSize:11, fontFamily:"'JetBrains Mono', monospace" },
        grid:      { vertLines:{ color:"rgba(0,0,0,0.05)" }, horzLines:{ color:"rgba(0,0,0,0.05)" } },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color:"rgba(0,0,0,0.35)", width:1, style:LineStyle.Dashed, labelBackgroundColor:"#e2e8f0" },
          horzLine: { color:"rgba(0,0,0,0.35)", width:1, style:LineStyle.Dashed, labelBackgroundColor:"#e2e8f0" },
        },
        rightPriceScale: { borderColor:"rgba(0,0,0,0.08)", scaleMargins:{ top:0.08, bottom: indVol ? 0.28 : 0.05 } },
        timeScale: {
          borderColor:"rgba(0,0,0,0.08)", timeVisible:true, secondsVisible:false,
          tickMarkFormatter: t => {
            const d = new Date(t * 1000);
            return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
          },
        },
        handleScale:  { mouseWheel:true, pinch:true, axisPressedMouseMove:true },
        handleScroll: { mouseWheel:true, pressedMouseMove:true, horzTouchDrag:true },
      });
      chartRef.current = chart;
      const sm = seriesMap.current;

      const times  = candles.map(c => Math.floor(c.t / 1000));
      const closes = candles.map(c => c.c);
      const highs  = candles.map(c => c.h);
      const lows   = candles.map(c => c.l);

      // ── main series ──
      if (chartType === "candle") {
        sm.main = chart.addCandlestickSeries({
          upColor:"#059669", downColor:"#dc2626",
          borderUpColor:"#059669", borderDownColor:"#dc2626",
          wickUpColor:"#059669", wickDownColor:"#dc2626",
          priceLineVisible:true, priceLineColor:"rgba(0,0,0,0.2)",
          priceLineWidth:1, priceLineStyle:LineStyle.Dashed,
          lastValueVisible:true,
        });
        sm.main.setData(candles.map(c => ({ time:Math.floor(c.t/1000), open:c.o, high:c.h, low:c.l, close:c.c })));
      } else if (chartType === "line") {
        sm.main = chart.addLineSeries({ color:"#2563eb", lineWidth:2, priceLineVisible:true, lastValueVisible:true });
        sm.main.setData(candles.map(c => ({ time:Math.floor(c.t/1000), value:c.c })));
      } else {
        sm.main = chart.addAreaSeries({
          topColor:"rgba(37,99,235,0.15)", bottomColor:"rgba(37,99,235,0.01)",
          lineColor:"#2563eb", lineWidth:2, priceLineVisible:true, lastValueVisible:true,
        });
        sm.main.setData(candles.map(c => ({ time:Math.floor(c.t/1000), value:c.c })));
      }

      // ── volume ──
      if (indVol) {
        sm.vol = chart.addHistogramSeries({
          color:"rgba(59,130,246,0.3)", priceFormat:{ type:"volume" },
          priceScaleId:"vol", scaleMargins:{ top:0.8, bottom:0 },
        });
        chart.priceScale("vol").applyOptions({ scaleMargins:{ top:0.82, bottom:0 } });
        sm.vol.setData(candles.map(c => ({ time:Math.floor(c.t/1000), value:c.v, color: c.c>=c.o ? C.vol.up : C.vol.dn })));
      }

      // ── MA 7 ──
      if (indMA7) {
        sm.ma7 = chart.addLineSeries({ color:C.ma7, lineWidth:1, priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
        sm.ma7.setData(toSeries(times, calcSMA(closes, indSettings.ma7.period)));
      }

      // ── MA 25 ──
      if (indMA25) {
        sm.ma25 = chart.addLineSeries({ color:C.ma25, lineWidth:1, priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
        sm.ma25.setData(toSeries(times, calcSMA(closes, indSettings.ma25.period)));
      }

      // ── MA 99 ──
      if (indMA99) {
        sm.ma99 = chart.addLineSeries({ color:C.ma99, lineWidth:1, priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
        sm.ma99.setData(toSeries(times, calcSMA(closes, indSettings.ma99.period)));
      }

      // ── Bollinger Bands ──
      if (indBB) {
        const bb = calcBB(closes, indSettings.bb.period, indSettings.bb.stdDev);
        sm.bbUpper = chart.addLineSeries({ color:C.bbUpper, lineWidth:1, lineStyle:LineStyle.Dashed, priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
        sm.bbMid   = chart.addLineSeries({ color:C.bbMid,   lineWidth:1, lineStyle:LineStyle.Dotted, priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
        sm.bbLower = chart.addLineSeries({ color:C.bbLower, lineWidth:1, lineStyle:LineStyle.Dashed, priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
        sm.bbUpper.setData(toSeries(times, bb.upper));
        sm.bbMid.setData(toSeries(times, bb.middle));
        sm.bbLower.setData(toSeries(times, bb.lower));
      }

      // ── VWAP ──
      if (indVWAP) {
        const vwapVals = calcVWAP(candles);
        sm.vwap = chart.addLineSeries({ color:C.vwap, lineWidth:1, lineStyle:LineStyle.Dashed, priceLineVisible:false, lastValueVisible:true, crosshairMarkerVisible:false, title:"VWAP" });
        sm.vwap.setData(toSeries(times, vwapVals));
      }

      // ── EMA Ribbon ──
      if (indRibbon) {
        const ribbon = calcEMARibbon(closes);
        const keys = ["ema8","ema13","ema21","ema34","ema55"];
        keys.forEach((k, i) => {
          sm[`ribbon_${k}`] = chart.addLineSeries({ color:C.ribbon[i], lineWidth:1, priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
          sm[`ribbon_${k}`].setData(toSeries(times, ribbon[k]));
        });
      }

      // ── SuperTrend ──────────────────────────────────────────────────────────
      // Implementasi 1:1 PineScript v6 ta.supertrend():
      //   direction = -1 → Uptrend   → garis HIJAU di bawah harga (lowerBand)
      //   direction =  1 → Downtrend → garis MERAH di atas harga  (upperBand)
      //
      // Fill shading (Pine: fill bodyMiddle ↔ upTrend/downTrend):
      //   - Uptrend fill  : area hijau transparan antara garis dan harga
      //   - Downtrend fill: area merah transparan antara garis dan harga
      // ─────────────────────────────────────────────────────────────────────────
      if (indST) {
        const { supertrend, direction, bodyMiddle } = calcSuperTrend(
          highs, lows, closes,
          indSettings.st.period, indSettings.st.multiplier
        );

        // Split ke dua line series (line breaks otomatis saat filter null)
        const bullLineData = []; // Uptrend   — direction === -1 — HIJAU
        const bearLineData = []; // Downtrend — direction ===  1 — MERAH

        // Fill shading: uptrend = area antara lowerBand dan bodyMiddle (atas)
        //               downtrend = area antara bodyMiddle (bawah) dan upperBand
        const bullFillData = []; // topValue = bodyMiddle, value = supertrend (green fill)
        const bearFillData = []; // topValue = supertrend, value = bodyMiddle (red fill)

        times.forEach((t, i) => {
          if (supertrend[i] === null) return;
          if (direction[i] === -1) {
            // Uptrend: garis hijau di bawah harga
            bullLineData.push({ time: t, value: supertrend[i] });
            // Fill: dari supertrend (bawah) ke bodyMiddle (atas) → hijau
            if (bodyMiddle[i] !== null) {
              bullFillData.push({ time: t, value: bodyMiddle[i] });
            }
          } else {
            // Downtrend: garis merah di atas harga
            bearLineData.push({ time: t, value: supertrend[i] });
            // Fill: dari bodyMiddle (bawah) ke supertrend (atas) → merah
            if (bodyMiddle[i] !== null) {
              bearFillData.push({ time: t, value: supertrend[i] });
            }
          }
        });

        // Garis utama — Uptrend (hijau)
        sm.stBull = chart.addLineSeries({
          color: C.stBull, lineWidth: 2,
          priceLineVisible: false, lastValueVisible: true,
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 4,
          crosshairMarkerBorderColor: C.stBull,
          crosshairMarkerBackgroundColor: "#ffffff",
          title: "▲ ST",
        });
        sm.stBull.setData(bullLineData);

        // Garis utama — Downtrend (merah)
        sm.stBear = chart.addLineSeries({
          color: C.stBear, lineWidth: 2,
          priceLineVisible: false, lastValueVisible: true,
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 4,
          crosshairMarkerBorderColor: C.stBear,
          crosshairMarkerBackgroundColor: "#ffffff",
          title: "▼ ST",
        });
        sm.stBear.setData(bearLineData);

        // Fill shading — Uptrend background (hijau transparan, seperti Pine fill)
        if (bullFillData.length > 0) {
          sm.stBullFill = chart.addAreaSeries({
            lineColor: "transparent",
            topColor:    "rgba(5,150,105,0.12)",
            bottomColor: "rgba(5,150,105,0.01)",
            lineWidth: 0,
            priceLineVisible: false, lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          sm.stBullFill.setData(bullFillData);
        }

        // Fill shading — Downtrend background (merah transparan, seperti Pine fill)
        if (bearFillData.length > 0) {
          sm.stBearFill = chart.addAreaSeries({
            lineColor: "transparent",
            topColor:    "rgba(220,38,38,0.12)",
            bottomColor: "rgba(220,38,38,0.01)",
            lineWidth: 0,
            priceLineVisible: false, lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          sm.stBearFill.setData(bearFillData);
        }
      }

      // ── RSI pane ──
      if (indRSI) {
        const rsiVals = calcRSI(closes, indSettings.rsi.period);
        sm.rsi = chart.addLineSeries({
          color:C.rsiLine, lineWidth:1, priceScaleId:"rsi",
          priceLineVisible:false, lastValueVisible:true, crosshairMarkerVisible:false,
        });
        chart.priceScale("rsi").applyOptions({ scaleMargins:{ top:0.75, bottom:0.02 }, autoScale:false, minimum:0, maximum:100 });
        sm.rsi.setData(toSeries(times, rsiVals));
        const rsiValid = toSeries(times, rsiVals);
        if (rsiValid.length) {
          const t0 = rsiValid[0].time, t1 = rsiValid[rsiValid.length-1].time;
          sm.rsi70 = chart.addLineSeries({ color:C.rsi70, lineWidth:1, lineStyle:LineStyle.Dashed, priceScaleId:"rsi", priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
          sm.rsi30 = chart.addLineSeries({ color:C.rsi30, lineWidth:1, lineStyle:LineStyle.Dashed, priceScaleId:"rsi", priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
          sm.rsi70.setData([{ time:t0, value:indSettings.rsi.ob },{ time:t1, value:indSettings.rsi.ob }]);
          sm.rsi30.setData([{ time:t0, value:indSettings.rsi.os },{ time:t1, value:indSettings.rsi.os }]);
        }
      }

      // ── Stoch RSI pane ──
      if (indStoch) {
        const { k, d } = calcStochRSI(closes, indSettings.stoch.rsiPeriod, indSettings.stoch.stochPeriod, indSettings.stoch.kPeriod, indSettings.stoch.dPeriod);
        sm.stochK = chart.addLineSeries({ color:C.stochK, lineWidth:1, priceScaleId:"stoch", priceLineVisible:false, lastValueVisible:true, crosshairMarkerVisible:false, title:"%K" });
        sm.stochD = chart.addLineSeries({ color:C.stochD, lineWidth:1, priceScaleId:"stoch", priceLineVisible:false, lastValueVisible:true, crosshairMarkerVisible:false, title:"%D" });
        chart.priceScale("stoch").applyOptions({ scaleMargins:{ top:0.78, bottom:0.02 }, autoScale:false, minimum:0, maximum:100 });
        sm.stochK.setData(toSeries(times, k));
        sm.stochD.setData(toSeries(times, d));
        const stochValid = toSeries(times, k);
        if (stochValid.length) {
          const t0 = stochValid[0].time, t1 = stochValid[stochValid.length-1].time;
          sm.stoch80 = chart.addLineSeries({ color:"rgba(220,38,38,0.4)", lineWidth:1, lineStyle:LineStyle.Dashed, priceScaleId:"stoch", priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
          sm.stoch20 = chart.addLineSeries({ color:"rgba(5,150,105,0.4)", lineWidth:1, lineStyle:LineStyle.Dashed, priceScaleId:"stoch", priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
          sm.stoch80.setData([{ time:t0, value:80 },{ time:t1, value:80 }]);
          sm.stoch20.setData([{ time:t0, value:20 },{ time:t1, value:20 }]);
        }
      }

      // ── Williams %R pane ──
      if (indWR) {
        const wrVals = calcWilliamsR(highs, lows, closes, indSettings.wr.period);
        sm.wr = chart.addLineSeries({ color:C.wr, lineWidth:1, priceScaleId:"wr", priceLineVisible:false, lastValueVisible:true, crosshairMarkerVisible:false, title:"%R" });
        chart.priceScale("wr").applyOptions({ scaleMargins:{ top:0.82, bottom:0.02 }, autoScale:false, minimum:-100, maximum:0 });
        sm.wr.setData(toSeries(times, wrVals));
        const wrValid = toSeries(times, wrVals);
        if (wrValid.length) {
          const t0 = wrValid[0].time, t1 = wrValid[wrValid.length-1].time;
          sm.wr80 = chart.addLineSeries({ color:"rgba(220,38,38,0.4)", lineWidth:1, lineStyle:LineStyle.Dashed, priceScaleId:"wr", priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
          sm.wr20 = chart.addLineSeries({ color:"rgba(5,150,105,0.4)", lineWidth:1, lineStyle:LineStyle.Dashed, priceScaleId:"wr", priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
          sm.wr80.setData([{ time:t0, value:-20 },{ time:t1, value:-20 }]);
          sm.wr20.setData([{ time:t0, value:-80 },{ time:t1, value:-80 }]);
        }
      }

      // ── CCI pane ──
      if (indCCI) {
        const cciVals = calcCCI(highs, lows, closes, indSettings.cci.period);
        sm.cci = chart.addLineSeries({ color:C.cci, lineWidth:1, priceScaleId:"cci", priceLineVisible:false, lastValueVisible:true, crosshairMarkerVisible:false, title:"CCI" });
        chart.priceScale("cci").applyOptions({ scaleMargins:{ top:0.85, bottom:0.02 } });
        sm.cci.setData(toSeries(times, cciVals));
        const cciValid = toSeries(times, cciVals);
        if (cciValid.length) {
          const t0 = cciValid[0].time, t1 = cciValid[cciValid.length-1].time;
          sm.cci100 = chart.addLineSeries({ color:"rgba(220,38,38,0.4)", lineWidth:1, lineStyle:LineStyle.Dashed, priceScaleId:"cci", priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
          sm.cciN100 = chart.addLineSeries({ color:"rgba(5,150,105,0.4)", lineWidth:1, lineStyle:LineStyle.Dashed, priceScaleId:"cci", priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
          sm.cci100.setData([{ time:t0, value:100 },{ time:t1, value:100 }]);
          sm.cciN100.setData([{ time:t0, value:-100 },{ time:t1, value:-100 }]);
        }
      }

      // ── MACD pane ──
      if (indMACD) {
        const { macdLine, signalLine, histogram } = calcMACD(closes, indSettings.macd.fast, indSettings.macd.slow, indSettings.macd.signal);
        sm.macd     = chart.addLineSeries({ color:C.macd, lineWidth:1, priceScaleId:"macd", priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
        sm.macdSig  = chart.addLineSeries({ color:C.signal, lineWidth:1, priceScaleId:"macd", priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
        sm.macdHist = chart.addHistogramSeries({ priceScaleId:"macd", priceLineVisible:false, lastValueVisible:false });
        chart.priceScale("macd").applyOptions({ scaleMargins:{ top:0.84, bottom:0.02 } });
        sm.macd.setData(toSeries(times, macdLine));
        sm.macdSig.setData(toSeries(times, signalLine));
        sm.macdHist.setData(
          times.map((t,i) => ({ time:t, value: histogram[i] ?? 0, color: histogram[i] >= 0 ? "rgba(5,150,105,0.6)" : "rgba(220,38,38,0.6)" }))
            .filter((_,i) => histogram[i] !== null)
        );
      }

      chart.timeScale().fitContent();

      ro = new ResizeObserver(() => {
        if (chartRef.current && el) chartRef.current.applyOptions({ width:el.clientWidth, height:el.clientHeight });
      });
      ro.observe(el);
    })();

    return () => { if (ro) ro.disconnect(); };
  }, [historyHash, chartType, indMA7, indMA25, indMA99, indBB, indVol, indRSI, indMACD,
      indST, indStoch, indWR, indCCI, indRibbon, indVWAP, indSettings]);

  // ── WebSocket (with connection timeout + REST fallback) ───────────────────
  useEffect(() => {
    goneRef.current = false;

    const clearAll = () => {
      if (pingRef.current)    { clearInterval(pingRef.current); pingRef.current = null; }
      if (retryRef.current)   { clearTimeout(retryRef.current); retryRef.current = null; }
      if (connTimerRef.current) { clearTimeout(connTimerRef.current); connTimerRef.current = null; }
      if (pollRef.current)    { clearInterval(pollRef.current); pollRef.current = null; }
    };

    // REST polling fallback — used when WS keeps failing
    const startPolling = () => {
      if (pollRef.current) return;
      setWsStatus("polling");
      const poll = async () => {
        if (goneRef.current) return;
        try {
          const r = await fetch(`/api/okx/history?instId=${encodeURIComponent(instId)}&bar=${encodeURIComponent(bar)}&range=since2026`, { cache:"no-store" });
          const p = await r.json();
          if (!goneRef.current && p.candles?.length) {
            setCandles(p.candles);
            const last = p.candles[p.candles.length - 1];
            setLiveCandle(last);
            const prev = prevPriceRef.current;
            if (prev !== null && prev !== last.c) {
              setFlashClass(last.c > prev ? "price-flash-up" : "price-flash-down");
              setTimeout(() => setFlashClass(""), 500);
            }
            prevPriceRef.current = last.c;
          }
        } catch {}
      };
      poll();
      pollRef.current = setInterval(poll, 5000);
    };

    const connect = (idx = 0) => {
      clearAll();
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }

      // After 6 WS failures, switch to REST polling fallback
      if (retryCountRef.current >= 6) {
        console.warn("[WS] Too many failures, switching to REST polling");
        startPolling();
        return;
      }

      const ep = OKX_BUSINESS_WS_ENDPOINTS[idx % OKX_BUSINESS_WS_ENDPOINTS.length];
      let ws;
      try { ws = new WebSocket(ep); } catch { startPolling(); return; }
      wsRef.current = ws;
      setWsStatus("connecting");

      // Connection timeout: if onopen doesn't fire in 8s, retry
      connTimerRef.current = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          console.warn("[WS] Connection timeout, retrying...");
          ws.onclose = null;
          ws.close();
          if (!goneRef.current) {
            retryCountRef.current++;
            retryRef.current = setTimeout(() => connect(retryCountRef.current), 1000);
          }
        }
      }, 8000);

      ws.onopen = () => {
        if (connTimerRef.current) { clearTimeout(connTimerRef.current); connTimerRef.current = null; }
        retryCountRef.current = 0;
        // Mark connected immediately on open — don't wait for subscribe ack
        setWsStatus("connected");
        ws.send(JSON.stringify({ op:"subscribe", args:[{ channel:`candle${bar}`, instId }] }));
        pingRef.current = setInterval(() => { if (ws.readyState === 1) ws.send("ping"); }, 20000);
      };

      ws.onmessage = (ev) => {
        if (ev.data === "pong") return;
        try {
          const msg = JSON.parse(ev.data);
          if (msg.event === "subscribe") { setWsStatus("connected"); return; }
          if (msg.event === "error") { setWsStatus("error"); ws.close(); return; }
          if (!msg.data?.length || !msg.arg?.channel?.startsWith("candle")) return;

          setWsStatus("connected");
          const row = msg.data[0];
          const inc = { t:+row[0], o:+row[1], h:+row[2], l:+row[3], c:+row[4], v:+row[5], live:row[8]==="0" };

          const sm = seriesMap.current;
          const lct = Math.floor(inc.t / 1000);
          if (sm.main?.update) {
            try {
              if (chartType === "candle") sm.main.update({ time:lct, open:inc.o, high:inc.h, low:inc.l, close:inc.c });
              else sm.main.update({ time:lct, value:inc.c });
            } catch {}
          }
          if (sm.vol?.update) {
            try { sm.vol.update({ time:lct, value:inc.v, color: inc.c>=inc.o ? C.vol.up : C.vol.dn }); } catch {}
          }

          const prev = prevPriceRef.current;
          if (prev !== null && prev !== inc.c) {
            setFlashClass(inc.c > prev ? "price-flash-up" : "price-flash-down");
            setTimeout(() => setFlashClass(""), 500);
          }
          prevPriceRef.current = inc.c;

          setLiveCandle(inc);
          setCandles(cur => {
            if (!cur.length) return [inc];
            const nx = [...cur];
            const last = nx[nx.length - 1];
            if (last.t === inc.t) { nx[nx.length-1] = inc; return nx; }
            if (inc.t > last.t)   { nx.push(inc); return nx.slice(-15000); }
            return cur;
          });
        } catch {}
      };

      ws.onerror = () => {
        if (connTimerRef.current) { clearTimeout(connTimerRef.current); connTimerRef.current = null; }
        setWsStatus("error");
        if (ws.readyState < 2) ws.close();
      };

      ws.onclose = () => {
        clearAll();
        if (!goneRef.current) {
          const delay = Math.min(1000 * 2 ** Math.min(retryCountRef.current, 4), 15000);
          retryCountRef.current++;
          setWsStatus("reconnecting");
          retryRef.current = setTimeout(() => connect(retryCountRef.current), delay);
        }
      };
    };

    retryCountRef.current = 0;
    connect(0);

    return () => {
      goneRef.current = true;
      clearAll();
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    };
  }, [instId, bar]);

  // ── derived ───────────────────────────────────────────────────────────────
  const active = liveCandle ?? candles[candles.length - 1];
  const changePct = active?.o ? ((active.c - active.o) / active.o) * 100 : 0;
  const isUp = changePct >= 0;
  const base = getPairBase(instId);
  const wsLabel = {
    connected:    "Live",
    reconnecting: "Reconnecting…",
    error:        "Error",
    polling:      "REST Polling",
  }[wsStatus] ?? "Connecting…";

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:"var(--bg-deep)", overflow:"hidden" }}>

      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <header style={{
        display:"flex", alignItems:"center",
        borderBottom:"1px solid var(--border-subtle)",
        background:"var(--bg-panel)", height:44, flexShrink:0,
      }}>
        {/* Logo */}
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"0 16px", borderRight:"1px solid var(--border-subtle)", height:"100%" }}>
          <div style={{ width:20, height:20, borderRadius:4, background:"linear-gradient(135deg,#3b82f6,#06b6d4)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 5h8M5 1v8" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
          </div>
          <span style={{ fontSize:13, fontWeight:700, color:"var(--text-primary)", letterSpacing:"-0.01em" }}>Zyeeque</span>
        </div>

        {/* Pairs */}
        <div style={{ display:"flex", alignItems:"center", height:"100%", overflow:"hidden", overflowX:"auto", flexShrink:1 }} className="scrollbar-thin">
          {OKX_PAIRS.map(p => (
            <button key={p.value} onClick={() => setInstId(p.value)} style={{
              height:"100%", padding:"0 13px", fontSize:12, fontWeight:500, whiteSpace:"nowrap",
              cursor:"pointer", transition:"all .15s",
              color: instId===p.value ? "var(--accent-cyan)" : "var(--text-secondary)",
              background: instId===p.value ? "rgba(6,182,212,0.08)" : "transparent",
              borderRight:"1px solid var(--border-subtle)",
              borderBottom: instId===p.value ? "2px solid var(--accent-cyan)" : "2px solid transparent",
            }}>{p.label}</button>
          ))}
        </div>

        <div style={{ flex:1 }} />

        {/* WS status */}
        <div style={{ display:"flex", alignItems:"center", gap:6, padding:"0 14px", borderLeft:"1px solid var(--border-subtle)", height:"100%", fontSize:11, color:"var(--text-muted)" }}>
          <Dot status={wsStatus} />
          <span>{wsLabel}</span>
        </div>
      </header>

      {/* ══ PRICE BAR ═══════════════════════════════════════════════════════ */}
      <div style={{
        display:"flex", alignItems:"center", gap:0,
        height:52, flexShrink:0,
        borderBottom:"1px solid var(--border-subtle)",
        background:"var(--bg-panel)",
      }}>
        {/* Price + change */}
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"0 20px", borderRight:"1px solid var(--border-subtle)", height:"100%" }}>
          <span className={flashClass} style={{ fontSize:20, fontWeight:700, fontFamily:"'JetBrains Mono',monospace", color:"var(--text-primary)", letterSpacing:"-0.02em" }}>
            {formatCurrency(active?.c)}
          </span>
          <span style={{
            fontSize:12, fontWeight:700, fontFamily:"'JetBrains Mono',monospace",
            color: isUp ? "var(--green)" : "var(--red)",
            padding:"2px 7px", borderRadius:4,
            background: isUp ? "var(--green-dim)" : "var(--red-dim)",
          }}>{isUp ? "+" : ""}{changePct.toFixed(2)}%</span>
        </div>

        {/* OHLCV */}
        <div style={{ display:"flex", gap:18, padding:"0 20px", borderRight:"1px solid var(--border-subtle)", height:"100%", alignItems:"center" }}>
          <StatCell label="O" value={formatCurrency(active?.o)} />
          <StatCell label="H" value={formatCurrency(active?.h)} color="var(--green)" />
          <StatCell label="L" value={formatCurrency(active?.l)} color="var(--red)" />
          <StatCell label="C" value={formatCurrency(active?.c)} />
          <StatCell label={`Vol(${base})`} value={formatNumber(active?.v)} />
        </div>

        {/* Timeframe */}
        <div style={{ display:"flex", gap:2, padding:"0 14px", borderRight:"1px solid var(--border-subtle)", height:"100%", alignItems:"center" }}>
          {OKX_BARS.map(b => <Kbd key={b.value} active={bar===b.value} onClick={() => setBar(b.value)}>{b.label}</Kbd>)}
        </div>

        {/* Chart type */}
        <div style={{ display:"flex", gap:2, padding:"0 14px", height:"100%", alignItems:"center", borderRight:"1px solid var(--border-subtle)" }}>
          {[["candle","Candle"],["line","Line"],["area","Area"]].map(([v,l]) => (
            <Kbd key={v} active={chartType===v} onClick={() => setChartType(v)} color="var(--accent-cyan)">{l}</Kbd>
          ))}
        </div>

        {/* Indicators button */}
        <div ref={indPanelRef} style={{ position:"relative", padding:"0 14px", height:"100%", display:"flex", alignItems:"center" }}>
          {(() => {
            const activeCount = [indMA7,indMA25,indMA99,indBB,indVol,indVWAP,indRibbon,indST,indRSI,indMACD,indStoch,indWR,indCCI].filter(Boolean).length;
            return (
              <button
                onClick={() => setShowIndPanel(v => !v)}
                style={{
                  display:"flex", alignItems:"center", gap:7,
                  padding:"5px 12px", borderRadius:5, fontSize:12, fontWeight:600,
                  cursor:"pointer", transition:"all .15s",
                  color: showIndPanel ? "#ffffff" : "var(--text-secondary)",
                  background: showIndPanel ? "var(--accent-cyan)" : "rgba(0,0,0,0.04)",
                  border: `1px solid ${showIndPanel ? "transparent" : "var(--border-subtle)"}`,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <rect x="1" y="2" width="12" height="1.5" rx=".75" fill="currentColor"/>
                  <rect x="1" y="6.25" width="12" height="1.5" rx=".75" fill="currentColor"/>
                  <rect x="1" y="10.5" width="12" height="1.5" rx=".75" fill="currentColor"/>
                  <circle cx="4" cy="2.75" r="1.5" fill={showIndPanel ? "#ffffff" : "var(--accent-cyan)"}/>
                  <circle cx="9" cy="7" r="1.5" fill={showIndPanel ? "#ffffff" : "var(--accent-cyan)"}/>
                  <circle cx="5.5" cy="11.25" r="1.5" fill={showIndPanel ? "#ffffff" : "var(--accent-cyan)"}/>
                </svg>
                Indicators
                {activeCount > 0 && (
                  <span style={{
                    minWidth:16, height:16, borderRadius:8, fontSize:10, fontWeight:700,
                    background: showIndPanel ? "rgba(255,255,255,0.25)" : "var(--accent-cyan)",
                    color: "#ffffff",
                    display:"flex", alignItems:"center", justifyContent:"center", padding:"0 4px",
                  }}>{activeCount}</span>
                )}
              </button>
            );
          })()}

          {/* Popup panel */}
          {showIndPanel && (
            <>
              {/* Backdrop */}
              <div onClick={() => setShowIndPanel(false)} style={{ position:"fixed", inset:0, zIndex:40 }} />
              <div style={{
                position:"absolute", top:"calc(100% + 6px)", right:0, zIndex:50,
                background:"#ffffff", border:"1px solid rgba(0,0,0,0.1)",
                borderRadius:10, padding:"16px", width:320,
                boxShadow:"0 16px 48px rgba(0,0,0,0.12)",
                maxHeight:"80vh", overflowY:"auto",
              }}>
                {/* Header */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:"var(--text-primary)", letterSpacing:"0.02em" }}>Indicators</span>
                  <button onClick={() => setShowIndPanel(false)} style={{ width:20, height:20, borderRadius:4, border:"1px solid var(--border-subtle)", background:"transparent", cursor:"pointer", color:"var(--text-muted)", fontSize:13, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>                </div>

                {/* ── helper sub-components (inline) ──────────────────────── */}
                {(() => {
                  // Number input field for settings
                  const NumInput = ({ label, value, onChange, step = 1, min = 1 }) => (
                    <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                      <span style={{ fontSize:9, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.08em" }}>{label}</span>
                      <input
                        type="number"
                        value={value}
                        min={min}
                        step={step}
                        onChange={e => onChange(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        style={{
                          width:54, padding:"3px 6px", borderRadius:4, fontSize:11,
                          fontFamily:"'JetBrains Mono', monospace", fontWeight:600,
                          background:"rgba(0,0,0,0.05)", border:"1px solid rgba(0,0,0,0.12)",
                          color:"var(--text-primary)", outline:"none",
                          WebkitAppearance:"none", MozAppearance:"textfield",
                        }}
                      />
                    </div>
                  );

                  // Row for each indicator with toggle + gear icon + optional settings panel
                  const IndRow = ({ id, label, color, active, onToggle, children }) => {
                    const isExpanded = expandedSetting === id;
                    return (
                      <div style={{ marginBottom:3 }}>
                        <button
                          onClick={onToggle}
                          style={{
                            display:"flex", alignItems:"center", justifyContent:"space-between",
                            width:"100%", padding:"8px 10px", borderRadius:isExpanded ? "6px 6px 0 0" : 6,
                            cursor:"pointer", transition:"all .12s",
                            background: active ? `${color}14` : "rgba(0,0,0,0.02)",
                            border: `1px solid ${active ? color + "55" : "rgba(0,0,0,0.08)"}`,
                            borderBottom: isExpanded ? "none" : undefined,
                          }}
                        >
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <span style={{ width:10, height:10, borderRadius:3, background:color, flexShrink:0, opacity: active ? 1 : 0.35 }} />
                            <span style={{ fontSize:12, color: active ? "var(--text-primary)" : "var(--text-muted)", fontWeight: active ? 500 : 400 }}>{label}</span>
                          </div>
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            {/* Gear icon — toggle settings */}
                            {children && (
                              <span
                                onClick={e => { e.stopPropagation(); setExpandedSetting(isExpanded ? null : id); }}
                                title="Settings"
                                style={{
                                  display:"flex", alignItems:"center", justifyContent:"center",
                                  width:20, height:20, borderRadius:4, cursor:"pointer",
                                  background: isExpanded ? "rgba(0,0,0,0.1)" : "transparent",
                                  color: isExpanded ? "var(--text-primary)" : "var(--text-muted)",
                                  transition:"all .12s",
                                }}
                              >
                                <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                                  <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
                                  <path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.93 2.93l1.41 1.41M9.66 9.66l1.41 1.41M2.93 11.07l1.41-1.41M9.66 4.34l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                </svg>
                              </span>
                            )}
                            {/* Toggle switch */}
                            <span style={{
                              width:32, height:18, borderRadius:9, position:"relative", flexShrink:0,
                              background: active ? color : "rgba(0,0,0,0.12)", transition:"background .15s",
                              display:"inline-block",
                            }}>
                              <span style={{
                                position:"absolute", top:3, left: active ? 17 : 3, width:12, height:12,
                                borderRadius:"50%", background:"#fff", transition:"left .15s",
                              }} />
                            </span>
                          </div>
                        </button>

                        {/* Settings panel — expands below row */}
                        {isExpanded && children && (
                          <div
                            onClick={e => e.stopPropagation()}
                            style={{
                              display:"flex", flexWrap:"wrap", gap:10, padding:"10px 12px",
                              background:"rgba(0,0,0,0.02)",
                              border:`1px solid ${color}55`,
                              borderTop:"none", borderRadius:"0 0 6px 6px",
                            }}
                          >
                            {children}
                          </div>
                        )}
                      </div>
                    );
                  };

                  return (
                    <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                      {/* ── Overlays ── */}
                      <p style={{ fontSize:10, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:4, marginTop:2 }}>Overlays (main chart)</p>

                      <IndRow id="ma7" label="MA 7" color={C.ma7} active={indMA7} onToggle={() => setIndMA7(v => !v)}>
                        <NumInput label="Period" value={indSettings.ma7.period} onChange={v => setSetting("ma7","period",v)} />
                      </IndRow>

                      <IndRow id="ma25" label="MA 25" color={C.ma25} active={indMA25} onToggle={() => setIndMA25(v => !v)}>
                        <NumInput label="Period" value={indSettings.ma25.period} onChange={v => setSetting("ma25","period",v)} />
                      </IndRow>

                      <IndRow id="ma99" label="MA 99" color={C.ma99} active={indMA99} onToggle={() => setIndMA99(v => !v)}>
                        <NumInput label="Period" value={indSettings.ma99.period} onChange={v => setSetting("ma99","period",v)} />
                      </IndRow>

                      <IndRow id="bb" label="Bollinger Bands" color={C.bbUpper} active={indBB} onToggle={() => setIndBB(v => !v)}>
                        <NumInput label="Period" value={indSettings.bb.period} onChange={v => setSetting("bb","period",v)} />
                        <NumInput label="Std Dev" value={indSettings.bb.stdDev} onChange={v => setSetting("bb","stdDev",v)} min={0.1} step={0.5} />
                      </IndRow>

                      <IndRow id="vol" label="Volume" color="#aaaaaa" active={indVol} onToggle={() => setIndVol(v => !v)} />

                      <IndRow id="vwap" label="VWAP" color={C.vwap} active={indVWAP} onToggle={() => setIndVWAP(v => !v)} />

                      <IndRow id="ribbon" label="EMA Ribbon (8/13/21/34/55)" color={C.ribbon[2]} active={indRibbon} onToggle={() => setIndRibbon(v => !v)} />

                      <IndRow id="st" label="SuperTrend" color={C.stBull} active={indST} onToggle={() => setIndST(v => !v)}>
                        <NumInput label="Period" value={indSettings.st.period} onChange={v => setSetting("st","period",v)} />
                        <NumInput label="Multiplier" value={indSettings.st.multiplier} onChange={v => setSetting("st","multiplier",v)} min={0.1} step={0.5} />
                      </IndRow>

                      {/* ── Oscillators ── */}
                      <p style={{ fontSize:10, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:4, marginTop:10 }}>Oscillators (sub-panel)</p>

                      <IndRow id="rsi" label="RSI" color={C.rsiLine} active={indRSI} onToggle={() => setIndRSI(v => !v)}>
                        <NumInput label="Period" value={indSettings.rsi.period} onChange={v => setSetting("rsi","period",v)} />
                        <NumInput label="Overbought" value={indSettings.rsi.ob} onChange={v => setSetting("rsi","ob",v)} />
                        <NumInput label="Oversold" value={indSettings.rsi.os} onChange={v => setSetting("rsi","os",v)} />
                      </IndRow>

                      <IndRow id="macd" label="MACD" color={C.macd} active={indMACD} onToggle={() => setIndMACD(v => !v)}>
                        <NumInput label="Fast" value={indSettings.macd.fast} onChange={v => setSetting("macd","fast",v)} />
                        <NumInput label="Slow" value={indSettings.macd.slow} onChange={v => setSetting("macd","slow",v)} />
                        <NumInput label="Signal" value={indSettings.macd.signal} onChange={v => setSetting("macd","signal",v)} />
                      </IndRow>

                      <IndRow id="stoch" label="Stochastic RSI" color={C.stochK} active={indStoch} onToggle={() => setIndStoch(v => !v)}>
                        <NumInput label="RSI" value={indSettings.stoch.rsiPeriod} onChange={v => setSetting("stoch","rsiPeriod",v)} />
                        <NumInput label="Stoch" value={indSettings.stoch.stochPeriod} onChange={v => setSetting("stoch","stochPeriod",v)} />
                        <NumInput label="%K" value={indSettings.stoch.kPeriod} onChange={v => setSetting("stoch","kPeriod",v)} />
                        <NumInput label="%D" value={indSettings.stoch.dPeriod} onChange={v => setSetting("stoch","dPeriod",v)} />
                      </IndRow>

                      <IndRow id="wr" label="Williams %R" color={C.wr} active={indWR} onToggle={() => setIndWR(v => !v)}>
                        <NumInput label="Period" value={indSettings.wr.period} onChange={v => setSetting("wr","period",v)} />
                      </IndRow>

                      <IndRow id="cci" label="CCI" color={C.cci} active={indCCI} onToggle={() => setIndCCI(v => !v)}>
                        <NumInput label="Period" value={indSettings.cci.period} onChange={v => setSetting("cci","period",v)} />
                      </IndRow>

                      {/* Reset all to default */}
                      <button
                        onClick={() => {
                          setIndSettings({
                            ma7:   { period: 7 },
                            ma25:  { period: 25 },
                            ma99:  { period: 99 },
                            bb:    { period: 20, stdDev: 2 },
                            rsi:   { period: 14, ob: 70, os: 30 },
                            macd:  { fast: 12, slow: 26, signal: 9 },
                            st:    { period: 10, multiplier: 3 },
                            stoch: { rsiPeriod: 14, stochPeriod: 14, kPeriod: 3, dPeriod: 3 },
                            wr:    { period: 14 },
                            cci:   { period: 20 },
                          });
                          setExpandedSetting(null);
                        }}
                        style={{
                          marginTop:10, width:"100%", padding:"7px 0", borderRadius:6, fontSize:11,
                          fontWeight:600, cursor:"pointer", transition:"all .12s",
                          background:"transparent", border:"1px solid rgba(0,0,0,0.1)",
                          color:"var(--text-muted)",
                        }}
                      >
                        ↺ Reset all to default
                      </button>
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ══ MAIN CONTENT ════════════════════════════════════════════════════ */}
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

        {/* ── CHART (kiri, 60%) ─────────────────────────────────────────── */}
        <div style={{ flex:"0 0 60%", position:"relative", borderRight:"1px solid var(--border-subtle)", display:"flex", flexDirection:"column" }}>
          {error && (
            <div style={{ position:"absolute", top:10, left:10, right:10, zIndex:20, padding:"9px 13px", borderRadius:6, fontSize:12, background:"rgba(220,38,38,0.08)", border:"1px solid rgba(220,38,38,0.25)", color:"#dc2626" }}>
              ⚠ {error}
            </div>
          )}
          {isLoading && (
            <div style={{ position:"absolute", inset:0, zIndex:10, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"rgba(240,244,248,0.92)", gap:12 }}>
              <div className="spin" style={{ width:28, height:28, border:"2px solid var(--border-subtle)", borderTopColor:"var(--accent-cyan)", borderRadius:"50%" }} />
              <span style={{ fontSize:11, color:"var(--text-muted)" }}>Loading candles…</span>
            </div>
          )}
          {!isLoading && candles.length === 0 && !error && (
            <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <span style={{ fontSize:12, color:"var(--text-muted)" }}>No data available</span>
            </div>
          )}
          <div ref={containerRef} style={{ width:"100%", flex:1 }} />
          <button
            onClick={() => { if (chartRef.current) chartRef.current.timeScale().scrollToRealTime(); }}
            style={{ position:"absolute", bottom:20, right:52, zIndex:30, background:"rgba(6,182,212,0.1)", color:"var(--accent-cyan)", border:"1px solid rgba(6,182,212,0.3)", padding:"4px 10px", borderRadius:5, fontSize:10, fontWeight:600, cursor:"pointer" }}
          >Live ▶</button>

          {/* Status bar bawah chart */}
          <div style={{ height:22, flexShrink:0, borderTop:"1px solid var(--border-subtle)", background:"var(--bg-panel)", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 12px", fontSize:10, color:"var(--text-muted)" }}>
            <div style={{ display:"flex", gap:12 }}>
              <span>OKX · {wsStatus==="polling" ? "REST Polling" : "WebSocket v5"}</span>
              <span>|</span>
              <span>{candles.length} candles</span>
              {liveCandle && <span style={{ color:"var(--green)", display:"flex", alignItems:"center", gap:4 }}><span className="pulse-dot" style={{ width:5,height:5,borderRadius:"50%",background:"var(--green)",display:"inline-block" }} />Live</span>}
            </div>
            <span>{instId} · {bar}</span>
          </div>
        </div>

        {/* ── PANEL KANAN (40%) ─────────────────────────────────────────── */}
        <RightPanel />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DUMMY DATA
// ════════════════════════════════════════════════════════════════════════════
const DUMMY_POSITIONS = [
  { id:1, symbol:"BTC-USDT", side:"Long",  size:0.25,  entry:61420.0, current:63850.0, pnl:607.50,  pnlPct:2.48,  leverage:10, time:"2h 14m" },
  { id:2, symbol:"ETH-USDT", side:"Short", size:1.80,  entry:3185.0,  current:3102.5,  pnl:148.50,  pnlPct:2.59,  leverage:5,  time:"47m" },
  { id:3, symbol:"SOL-USDT", side:"Long",  size:12.0,  entry:142.30,  current:139.80,  pnl:-30.0,   pnlPct:-1.76, leverage:3,  time:"3h 02m" },
];

const DUMMY_CLOSED = [
  { id:1,  date:"06 Apr 12:30", symbol:"BTC-USDT", side:"Long",  entry:60100, exit:62400, pnl:574.80,  pnlPct:3.82,  result:"win",  duration:"5h 12m" },
  { id:2,  date:"06 Apr 08:15", symbol:"ETH-USDT", side:"Short", entry:3220,  exit:3095,  pnl:225.00,  pnlPct:3.88,  result:"win",  duration:"2h 47m" },
  { id:3,  date:"05 Apr 21:00", symbol:"SOL-USDT", side:"Long",  entry:148.5, exit:141.2, pnl:-87.60,  pnlPct:-4.92, result:"loss", duration:"8h 33m" },
  { id:4,  date:"05 Apr 16:45", symbol:"BTC-USDT", side:"Short", entry:63800, exit:62100, pnl:425.00,  pnlPct:2.66,  result:"win",  duration:"1h 20m" },
  { id:5,  date:"05 Apr 11:10", symbol:"XRP-USDT", side:"Long",  entry:0.512, exit:0.498, pnl:-27.34,  pnlPct:-2.73, result:"loss", duration:"3h 05m" },
  { id:6,  date:"04 Apr 19:30", symbol:"ETH-USDT", side:"Long",  entry:3050,  exit:3190,  pnl:252.00,  pnlPct:4.59,  result:"win",  duration:"6h 55m" },
];

const DUMMY_LOGS = [
  { id:1,  time:"13:42:07", type:"signal",  msg:"BUY signal detected — RSI(14) oversold + BB bounce on BTC-USDT 1H",      color:"#059669" },
  { id:2,  time:"13:42:09", type:"order",   msg:"LONG order placed — BTC-USDT 0.25 lots @ 61,420 USDT (10x leverage)",    color:"#2563eb" },
  { id:3,  time:"13:42:10", type:"fill",    msg:"Order filled @ 61,422.5 — slippage 2.5 USDT",                             color:"#7c3aed" },
  { id:4,  time:"11:18:33", type:"signal",  msg:"SHORT signal detected — MACD crossover bearish on ETH-USDT 15m",          color:"#dc2626" },
  { id:5,  time:"11:18:35", type:"order",   msg:"SHORT order placed — ETH-USDT 1.80 lots @ 3,185 USDT (5x leverage)",     color:"#2563eb" },
  { id:6,  time:"11:18:36", type:"fill",    msg:"Order filled @ 3,185.0 — no slippage",                                    color:"#7c3aed" },
  { id:7,  time:"10:05:12", type:"ai",      msg:"AI self-review: Win rate dropped 4.2% on SOL scalp — adjusting TP/SL",   color:"#d97706" },
  { id:8,  time:"09:30:00", type:"info",    msg:"Market session opened — volatility index HIGH (VIX equiv: 28.4)",         color:"#64748b" },
  { id:9,  time:"08:15:44", type:"close",   msg:"Closed ETH-USDT SHORT @ 3,095 — PnL +225.00 USDT (+3.88%)",              color:"#059669" },
  { id:10, time:"06:00:01", type:"ai",      msg:"AI model retrained on last 72h data — 847 new candles ingested",          color:"#d97706" },
];

const DUMMY_STATS = {
  totalTrades: 142,
  winRate: 67.6,
  avgProfit: 312.40,
  avgLoss: -148.20,
  profitFactor: 2.11,
  maxDrawdown: -8.34,
  totalPnL: 18420.80,
  sharpeRatio: 1.84,
  avgDuration: "3h 28m",
  bestTrade: 1840.50,
  worstTrade: -620.00,
  consecutiveWins: 7,
  consecutiveLoss: 3,
  aiAccuracy: 71.2,
  aiImprovements: 24,
  lastRetrain: "2h ago",
};

const DUMMY_CHAT = [
  { role:"ai",   text:"Halo! Saya AI Trading Assistant Zyeeque. Saya menganalisis market secara real-time dan belajar dari setiap trade. Ada yang bisa saya bantu?" },
  { role:"user", text:"Bagaimana kondisi BTC sekarang?" },
  { role:"ai",   text:"BTC-USDT sedang dalam tren bullish jangka pendek. RSI(14) berada di 58 — belum overbought. MACD menunjukkan momentum positif. Saya merekomendasikan hold posisi long yang ada. TP level berikutnya: $64,500." },
  { role:"user", text:"Berapa win rate AI saat ini?" },
  { role:"ai",   text:"Win rate saya saat ini 67.6% dari 142 trade terakhir. Profit factor 2.11 — artinya setiap $1 risiko menghasilkan $2.11 return. Saya sudah melakukan 24 self-improvement cycle sejak deploy. Model terakhir diretrain 2 jam lalu dengan 847 candle baru." },
];

// ════════════════════════════════════════════════════════════════════════════
// RIGHT PANEL COMPONENT
// ════════════════════════════════════════════════════════════════════════════
function RightPanel() {
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages]   = useState(DUMMY_CHAT);
  const [activeTab, setActiveTab] = useState("positions");
  const chatEndRef = useRef(null);

  const sendMsg = () => {
    const txt = chatInput.trim();
    if (!txt) return;
    setMessages(m => [...m, { role:"user", text:txt }, { role:"ai", text:"Sedang menganalisis... (ini adalah demo frontend — integrasi AI belum aktif)." }]);
    setChatInput("");
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior:"smooth" }), 50);
  };

  const tabs = [
    { id:"positions", label:"Open Pos.", count: DUMMY_POSITIONS.length },
    { id:"closed",    label:"Closed",    count: DUMMY_CLOSED.length },
    { id:"logs",      label:"Logs",      count: DUMMY_LOGS.length },
    { id:"stats",     label:"Stats / AI" },
  ];

  return (
    <div style={{ flex:"0 0 40%", display:"flex", flexDirection:"column", background:"var(--bg-surface)", minWidth:0 }}>

      {/* ── CHATBOT ──────────────────────────────────────────────────────── */}
      <div style={{ flex:"0 0 44%", display:"flex", flexDirection:"column", borderBottom:"1px solid var(--border-subtle)", minHeight:0 }}>
        {/* Chat header */}
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 14px", borderBottom:"1px solid var(--border-subtle)", background:"var(--bg-panel)", flexShrink:0 }}>
          <div style={{ width:28, height:28, borderRadius:8, background:"linear-gradient(135deg,#06b6d4,#7c3aed)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2C4.69 2 2 4.46 2 7.5c0 1.74.82 3.3 2.1 4.35V14l2.6-1.3A7.2 7.2 0 008 13c3.31 0 6-2.46 6-5.5S11.31 2 8 2z" fill="white"/></svg>
          </div>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:"var(--text-primary)" }}>AI Trading Assistant</div>
            <div style={{ fontSize:10, color:"var(--text-muted)", display:"flex", alignItems:"center", gap:4 }}>
              <span style={{ width:5, height:5, borderRadius:"50%", background:"#059669", display:"inline-block" }} />
              Online · Model v3.2 · Acc {DUMMY_STATS.aiAccuracy}%
            </div>
          </div>
          <div style={{ marginLeft:"auto", fontSize:10, color:"var(--text-muted)", background:"rgba(6,182,212,0.08)", border:"1px solid rgba(6,182,212,0.2)", borderRadius:4, padding:"2px 7px" }}>
            Retrained {DUMMY_STATS.lastRetrain}
          </div>
        </div>

        {/* Messages */}
        <div className="scrollbar-thin" style={{ flex:1, overflowY:"auto", padding:"10px 14px", display:"flex", flexDirection:"column", gap:8, minHeight:0 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display:"flex", justifyContent: m.role==="user" ? "flex-end" : "flex-start" }}>
              {m.role==="ai" && (
                <div style={{ width:20, height:20, borderRadius:6, background:"linear-gradient(135deg,#06b6d4,#7c3aed)", flexShrink:0, marginRight:7, marginTop:2 }} />
              )}
              <div style={{
                maxWidth:"78%", padding:"7px 11px", borderRadius: m.role==="user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                fontSize:11, lineHeight:1.5,
                background: m.role==="user" ? "var(--accent-cyan)" : "var(--bg-panel)",
                color: m.role==="user" ? "#fff" : "var(--text-primary)",
                border: m.role==="user" ? "none" : "1px solid var(--border-subtle)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              }}>{m.text}</div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div style={{ display:"flex", gap:8, padding:"8px 10px", borderTop:"1px solid var(--border-subtle)", background:"var(--bg-panel)", flexShrink:0 }}>
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key==="Enter" && sendMsg()}
            placeholder="Tanya AI tentang market, strategi, posisi..."
            style={{ flex:1, padding:"7px 10px", borderRadius:7, border:"1px solid var(--border-subtle)", fontSize:11, background:"var(--bg-surface)", color:"var(--text-primary)", outline:"none" }}
          />
          <button
            onClick={sendMsg}
            style={{ padding:"7px 14px", borderRadius:7, background:"var(--accent-cyan)", color:"#fff", border:"none", fontSize:11, fontWeight:700, cursor:"pointer" }}
          >
            ➤
          </button>
        </div>
      </div>

      {/* ── TRADING INFO ──────────────────────────────────────────────────── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0 }}>
        {/* Tabs */}
        <div style={{ display:"flex", borderBottom:"1px solid var(--border-subtle)", background:"var(--bg-panel)", flexShrink:0 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              flex:1, padding:"8px 4px", fontSize:11, fontWeight:600, cursor:"pointer", transition:"all .15s",
              color: activeTab===t.id ? "var(--accent-cyan)" : "var(--text-muted)",
              background:"transparent", borderBottom: activeTab===t.id ? "2px solid var(--accent-cyan)" : "2px solid transparent",
              display:"flex", alignItems:"center", justifyContent:"center", gap:4,
            }}>
              {t.label}
              {t.count !== undefined && (
                <span style={{ minWidth:14, height:14, borderRadius:7, fontSize:9, fontWeight:700, background: activeTab===t.id ? "var(--accent-cyan)" : "rgba(0,0,0,0.1)", color: activeTab===t.id ? "#fff" : "var(--text-muted)", display:"inline-flex", alignItems:"center", justifyContent:"center", padding:"0 3px" }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="scrollbar-thin" style={{ flex:1, overflowY:"auto", minHeight:0 }}>

          {/* ── Open Positions ── */}
          {activeTab==="positions" && (
            <div style={{ padding:"8px 10px", display:"flex", flexDirection:"column", gap:6 }}>
              {DUMMY_POSITIONS.map(p => (
                <div key={p.id} style={{ background:"var(--bg-panel)", border:"1px solid var(--border-subtle)", borderRadius:8, padding:"10px 12px", display:"flex", flexDirection:"column", gap:6 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontSize:12, fontWeight:700, color:"var(--text-primary)" }}>{p.symbol}</span>
                      <span style={{ fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:3, background: p.side==="Long" ? "rgba(5,150,105,0.12)" : "rgba(220,38,38,0.12)", color: p.side==="Long" ? "#059669" : "#dc2626" }}>{p.side}</span>
                      <span style={{ fontSize:10, color:"var(--text-muted)" }}>{p.leverage}x</span>
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, fontFamily:"'JetBrains Mono',monospace", color: p.pnl>=0 ? "#059669" : "#dc2626" }}>
                      {p.pnl>=0?"+":""}{p.pnl.toFixed(2)} <span style={{ fontSize:10 }}>({p.pnlPct>=0?"+":""}{p.pnlPct.toFixed(2)}%)</span>
                    </span>
                  </div>
                  <div style={{ display:"flex", gap:14 }}>
                    {[["Size", p.size],["Entry", p.entry.toLocaleString()],["Current", p.current.toLocaleString()],["Time", p.time]].map(([l,v]) => (
                      <div key={l} style={{ display:"flex", flexDirection:"column", gap:1 }}>
                        <span style={{ fontSize:9, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.06em" }}>{l}</span>
                        <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:"var(--text-secondary)", fontWeight:500 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  {/* PnL bar */}
                  <div style={{ height:3, background:"rgba(0,0,0,0.06)", borderRadius:2, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${Math.min(Math.abs(p.pnlPct)*8,100)}%`, background: p.pnl>=0?"#059669":"#dc2626", borderRadius:2 }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Closed Trades ── */}
          {activeTab==="closed" && (
            <div style={{ padding:"8px 10px", display:"flex", flexDirection:"column", gap:4 }}>
              {DUMMY_CLOSED.map(t => (
                <div key={t.id} style={{ background:"var(--bg-panel)", border:`1px solid ${t.result==="win" ? "rgba(5,150,105,0.2)" : "rgba(220,38,38,0.15)"}`, borderRadius:7, padding:"8px 12px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, minWidth:0 }}>
                    <span style={{ width:6, height:6, borderRadius:"50%", background: t.result==="win"?"#059669":"#dc2626", flexShrink:0 }} />
                    <div style={{ minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                        <span style={{ fontSize:11, fontWeight:700, color:"var(--text-primary)" }}>{t.symbol}</span>
                        <span style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:3, background: t.side==="Long" ? "rgba(5,150,105,0.1)" : "rgba(220,38,38,0.1)", color: t.side==="Long" ? "#059669" : "#dc2626" }}>{t.side}</span>
                      </div>
                      <div style={{ fontSize:10, color:"var(--text-muted)", display:"flex", gap:6, marginTop:2 }}>
                        <span>{t.date}</span>
                        <span>·</span>
                        <span>{t.duration}</span>
                        <span>·</span>
                        <span>{t.entry} → {t.exit}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, fontFamily:"'JetBrains Mono',monospace", color: t.pnl>=0?"#059669":"#dc2626" }}>
                      {t.pnl>=0?"+":""}{t.pnl.toFixed(2)}
                    </div>
                    <div style={{ fontSize:10, color:"var(--text-muted)" }}>{t.pnlPct>=0?"+":""}{t.pnlPct.toFixed(2)}%</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Logs ── */}
          {activeTab==="logs" && (
            <div style={{ padding:"8px 10px", display:"flex", flexDirection:"column", gap:3 }}>
              {DUMMY_LOGS.map(l => (
                <div key={l.id} style={{ display:"flex", gap:8, padding:"6px 10px", background:"var(--bg-panel)", borderRadius:6, border:"1px solid var(--border-subtle)", alignItems:"flex-start" }}>
                  <span style={{ fontSize:9, fontFamily:"'JetBrains Mono',monospace", color:"var(--text-muted)", flexShrink:0, marginTop:1 }}>{l.time}</span>
                  <span style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:3, background:`${l.color}18`, color:l.color, flexShrink:0, textTransform:"uppercase", letterSpacing:"0.04em" }}>{l.type}</span>
                  <span style={{ fontSize:10, color:"var(--text-secondary)", lineHeight:1.4 }}>{l.msg}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Stats / AI ── */}
          {activeTab==="stats" && (
            <div style={{ padding:"10px" }}>
              {/* Performance */}
              <p style={{ fontSize:10, fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:8 }}>Performance</p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6, marginBottom:12 }}>
                {[
                  ["Total PnL",    `+$${DUMMY_STATS.totalPnL.toLocaleString()}`, "#059669"],
                  ["Win Rate",     `${DUMMY_STATS.winRate}%`,                    "#2563eb"],
                  ["Total Trades", DUMMY_STATS.totalTrades,                       "var(--text-primary)"],
                  ["Profit Factor",DUMMY_STATS.profitFactor,                       "#7c3aed"],
                  ["Avg Profit",   `+$${DUMMY_STATS.avgProfit}`,                  "#059669"],
                  ["Avg Loss",     `$${DUMMY_STATS.avgLoss}`,                     "#dc2626"],
                  ["Max Drawdown", `${DUMMY_STATS.maxDrawdown}%`,                 "#dc2626"],
                  ["Sharpe Ratio", DUMMY_STATS.sharpeRatio,                       "#2563eb"],
                  ["Avg Duration", DUMMY_STATS.avgDuration,                       "var(--text-secondary)"],
                  ["Best Trade",   `+$${DUMMY_STATS.bestTrade}`,                  "#059669"],
                  ["Worst Trade",  `$${DUMMY_STATS.worstTrade}`,                  "#dc2626"],
                  ["Avg Duration", DUMMY_STATS.avgDuration,                       "var(--text-muted)"],
                ].map(([label, value, color]) => (
                  <div key={label} style={{ background:"var(--bg-panel)", borderRadius:7, padding:"8px 10px", border:"1px solid var(--border-subtle)" }}>
                    <div style={{ fontSize:9, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:3 }}>{label}</div>
                    <div style={{ fontSize:13, fontWeight:700, fontFamily:"'JetBrains Mono',monospace", color }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Streak */}
              <p style={{ fontSize:10, fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:8 }}>Streaks</p>
              <div style={{ display:"flex", gap:6, marginBottom:12 }}>
                <div style={{ flex:1, background:"rgba(5,150,105,0.08)", border:"1px solid rgba(5,150,105,0.2)", borderRadius:7, padding:"8px 10px" }}>
                  <div style={{ fontSize:9, color:"#059669", textTransform:"uppercase", marginBottom:3 }}>Max Win Streak</div>
                  <div style={{ fontSize:18, fontWeight:800, color:"#059669" }}>{DUMMY_STATS.consecutiveWins}🔥</div>
                </div>
                <div style={{ flex:1, background:"rgba(220,38,38,0.06)", border:"1px solid rgba(220,38,38,0.15)", borderRadius:7, padding:"8px 10px" }}>
                  <div style={{ fontSize:9, color:"#dc2626", textTransform:"uppercase", marginBottom:3 }}>Max Loss Streak</div>
                  <div style={{ fontSize:18, fontWeight:800, color:"#dc2626" }}>{DUMMY_STATS.consecutiveLoss}</div>
                </div>
              </div>

              {/* AI Self-Learning */}
              <p style={{ fontSize:10, fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:8 }}>AI Self-Learning</p>
              <div style={{ background:"linear-gradient(135deg,rgba(6,182,212,0.06),rgba(124,58,237,0.06))", border:"1px solid rgba(6,182,212,0.2)", borderRadius:8, padding:"12px" }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
                  {[
                    ["Model Accuracy",  `${DUMMY_STATS.aiAccuracy}%`,     "#06b6d4"],
                    ["Improvements",    `${DUMMY_STATS.aiImprovements}x`, "#7c3aed"],
                    ["Last Retrain",    DUMMY_STATS.lastRetrain,           "#d97706"],
                    ["Data Points",     "12,847",                          "var(--text-secondary)"],
                  ].map(([l,v,c]) => (
                    <div key={l}>
                      <div style={{ fontSize:9, color:"var(--text-muted)", textTransform:"uppercase", marginBottom:2 }}>{l}</div>
                      <div style={{ fontSize:14, fontWeight:700, fontFamily:"'JetBrains Mono',monospace", color:c }}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* Accuracy bar */}
                <div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:"var(--text-muted)", marginBottom:4 }}>
                    <span>Model Accuracy Over Time</span>
                    <span>{DUMMY_STATS.aiAccuracy}%</span>
                  </div>
                  <div style={{ height:6, background:"rgba(0,0,0,0.08)", borderRadius:3, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${DUMMY_STATS.aiAccuracy}%`, background:"linear-gradient(90deg,#06b6d4,#7c3aed)", borderRadius:3, transition:"width .5s" }} />
                  </div>
                </div>

                {/* Feature importance dummy */}
                <div style={{ marginTop:10 }}>
                  <div style={{ fontSize:9, color:"var(--text-muted)", textTransform:"uppercase", marginBottom:6 }}>Feature Importance</div>
                  {[["RSI",72],["MACD",58],["Volume",51],["BB",44],["SuperTrend",39]].map(([feat,score]) => (
                    <div key={feat} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                      <span style={{ fontSize:10, color:"var(--text-secondary)", width:72 }}>{feat}</span>
                      <div style={{ flex:1, height:4, background:"rgba(0,0,0,0.07)", borderRadius:2, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${score}%`, background:"linear-gradient(90deg,#06b6d4,#7c3aed)", borderRadius:2 }} />
                      </div>
                      <span style={{ fontSize:9, fontFamily:"'JetBrains Mono',monospace", color:"var(--text-muted)", width:24 }}>{score}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
