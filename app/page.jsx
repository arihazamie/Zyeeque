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
  ma7:    "#ffffff",
  ma25:   "#aaaaaa",
  ma99:   "#666666",
  bbUpper:"#888888",
  bbLower:"#888888",
  bbMid:  "#bbbbbb",
  macd:   "#ffffff",
  signal: "#888888",
  rsiLine:"#cccccc",
  rsi70:  "#999999",
  rsi30:  "#cccccc",
  stBull: "#0ecb81",   // SuperTrend bullish
  stBear: "#f6465d",   // SuperTrend bearish
  stochK: "#ffffff",
  stochD: "#888888",
  wr:     "#aaaaaa",
  cci:    "#cccccc",
  ribbon: ["#ffffff","#d4d4d4","#aaaaaa","#777777","#444444"],
  vwap:   "#dddddd",
  vol:    { up: "rgba(14,203,129,0.3)", dn: "rgba(246,70,93,0.3)" },
};

// ─── helpers ───────────────────────────────────────────────────────────────
function toSeries(times, values, filterNull = true) {
  return times
    .map((t, i) => ({ time: t, value: values[i] }))
    .filter(p => !filterNull || p.value !== null);
}

// ─── sub-components ────────────────────────────────────────────────────────
function Dot({ status }) {
  const color = { connected:"#ffffff", reconnecting:"#aaaaaa", error:"#666666", polling:"#cccccc" }[status] ?? "#444444";
  return <span className="pulse-dot" style={{ display:"inline-block", width:7, height:7, borderRadius:"50%", background:color, flexShrink:0 }} />;
}

function Kbd({ active, onClick, children, color }) {
  return (
    <button onClick={onClick} style={{
      padding:"3px 9px", borderRadius:4, fontSize:11, fontWeight:600,
      cursor:"pointer", transition:"all .15s",
      color: active ? (color ?? "#000000") : "var(--text-secondary)",
      background: active ? (color ?? "#ffffff") : "transparent",
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
        layout:    { background:{ color:"transparent" }, textColor:"#a0a0a0", fontSize:11, fontFamily:"'JetBrains Mono', monospace" },
        grid:      { vertLines:{ color:"rgba(255,255,255,0.04)" }, horzLines:{ color:"rgba(255,255,255,0.04)" } },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color:"rgba(255,255,255,0.3)", width:1, style:LineStyle.Dashed, labelBackgroundColor:"#1a1a1a" },
          horzLine: { color:"rgba(255,255,255,0.3)", width:1, style:LineStyle.Dashed, labelBackgroundColor:"#1a1a1a" },
        },
        rightPriceScale: { borderColor:"rgba(255,255,255,0.1)", scaleMargins:{ top:0.08, bottom: indVol ? 0.28 : 0.05 } },
        timeScale: {
          borderColor:"rgba(255,255,255,0.1)", timeVisible:true, secondsVisible:false,
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
          upColor:"#0ecb81", downColor:"#f6465d",
          borderUpColor:"#0ecb81", borderDownColor:"#f6465d",
          wickUpColor:"#0ecb81", wickDownColor:"#f6465d",
          priceLineVisible:true, priceLineColor:"rgba(255,255,255,0.25)",
          priceLineWidth:1, priceLineStyle:LineStyle.Dashed,
          lastValueVisible:true,
        });
        sm.main.setData(candles.map(c => ({ time:Math.floor(c.t/1000), open:c.o, high:c.h, low:c.l, close:c.c })));
      } else if (chartType === "line") {
        sm.main = chart.addLineSeries({ color:"#ffffff", lineWidth:2, priceLineVisible:true, lastValueVisible:true });
        sm.main.setData(candles.map(c => ({ time:Math.floor(c.t/1000), value:c.c })));
      } else {
        sm.main = chart.addAreaSeries({
          topColor:"rgba(255,255,255,0.2)", bottomColor:"rgba(255,255,255,0.01)",
          lineColor:"#ffffff", lineWidth:2, priceLineVisible:true, lastValueVisible:true,
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
        sm.ma7.setData(toSeries(times, calcSMA(closes, 7)));
      }

      // ── MA 25 ──
      if (indMA25) {
        sm.ma25 = chart.addLineSeries({ color:C.ma25, lineWidth:1, priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
        sm.ma25.setData(toSeries(times, calcSMA(closes, 25)));
      }

      // ── MA 99 ──
      if (indMA99) {
        sm.ma99 = chart.addLineSeries({ color:C.ma99, lineWidth:1, priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
        sm.ma99.setData(toSeries(times, calcSMA(closes, 99)));
      }

      // ── Bollinger Bands ──
      if (indBB) {
        const bb = calcBB(closes, 20, 2);
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

      // ── SuperTrend ──
      if (indST) {
        const { supertrend, direction } = calcSuperTrend(highs, lows, closes, 10, 3);
        // Split into bullish (green) and bearish (red) segments
        const bullData = [], bearData = [];
        times.forEach((t, i) => {
          if (supertrend[i] === null) return;
          if (direction[i] === 1) { bullData.push({ time:t, value:supertrend[i] }); bearData.push({ time:t, value:null }); }
          else { bearData.push({ time:t, value:supertrend[i] }); bullData.push({ time:t, value:null }); }
        });
        sm.stBull = chart.addLineSeries({ color:C.stBull, lineWidth:2, priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:true });
        sm.stBear = chart.addLineSeries({ color:C.stBear, lineWidth:2, priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:true });
        sm.stBull.setData(bullData.filter(d => d.value !== null));
        sm.stBear.setData(bearData.filter(d => d.value !== null));
      }

      // ── RSI pane ──
      if (indRSI) {
        const rsiVals = calcRSI(closes, 14);
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
          sm.rsi70.setData([{ time:t0, value:70 },{ time:t1, value:70 }]);
          sm.rsi30.setData([{ time:t0, value:30 },{ time:t1, value:30 }]);
        }
      }

      // ── Stoch RSI pane ──
      if (indStoch) {
        const { k, d } = calcStochRSI(closes);
        sm.stochK = chart.addLineSeries({ color:C.stochK, lineWidth:1, priceScaleId:"stoch", priceLineVisible:false, lastValueVisible:true, crosshairMarkerVisible:false, title:"%K" });
        sm.stochD = chart.addLineSeries({ color:C.stochD, lineWidth:1, priceScaleId:"stoch", priceLineVisible:false, lastValueVisible:true, crosshairMarkerVisible:false, title:"%D" });
        chart.priceScale("stoch").applyOptions({ scaleMargins:{ top:0.78, bottom:0.02 }, autoScale:false, minimum:0, maximum:100 });
        sm.stochK.setData(toSeries(times, k));
        sm.stochD.setData(toSeries(times, d));
        const stochValid = toSeries(times, k);
        if (stochValid.length) {
          const t0 = stochValid[0].time, t1 = stochValid[stochValid.length-1].time;
          sm.stoch80 = chart.addLineSeries({ color:"rgba(244,63,94,0.4)", lineWidth:1, lineStyle:LineStyle.Dashed, priceScaleId:"stoch", priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
          sm.stoch20 = chart.addLineSeries({ color:"rgba(16,185,129,0.4)", lineWidth:1, lineStyle:LineStyle.Dashed, priceScaleId:"stoch", priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
          sm.stoch80.setData([{ time:t0, value:80 },{ time:t1, value:80 }]);
          sm.stoch20.setData([{ time:t0, value:20 },{ time:t1, value:20 }]);
        }
      }

      // ── Williams %R pane ──
      if (indWR) {
        const wrVals = calcWilliamsR(highs, lows, closes, 14);
        sm.wr = chart.addLineSeries({ color:C.wr, lineWidth:1, priceScaleId:"wr", priceLineVisible:false, lastValueVisible:true, crosshairMarkerVisible:false, title:"%R" });
        chart.priceScale("wr").applyOptions({ scaleMargins:{ top:0.82, bottom:0.02 }, autoScale:false, minimum:-100, maximum:0 });
        sm.wr.setData(toSeries(times, wrVals));
        const wrValid = toSeries(times, wrVals);
        if (wrValid.length) {
          const t0 = wrValid[0].time, t1 = wrValid[wrValid.length-1].time;
          sm.wr80 = chart.addLineSeries({ color:"rgba(244,63,94,0.4)", lineWidth:1, lineStyle:LineStyle.Dashed, priceScaleId:"wr", priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
          sm.wr20 = chart.addLineSeries({ color:"rgba(16,185,129,0.4)", lineWidth:1, lineStyle:LineStyle.Dashed, priceScaleId:"wr", priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
          sm.wr80.setData([{ time:t0, value:-20 },{ time:t1, value:-20 }]);
          sm.wr20.setData([{ time:t0, value:-80 },{ time:t1, value:-80 }]);
        }
      }

      // ── CCI pane ──
      if (indCCI) {
        const cciVals = calcCCI(highs, lows, closes, 20);
        sm.cci = chart.addLineSeries({ color:C.cci, lineWidth:1, priceScaleId:"cci", priceLineVisible:false, lastValueVisible:true, crosshairMarkerVisible:false, title:"CCI" });
        chart.priceScale("cci").applyOptions({ scaleMargins:{ top:0.85, bottom:0.02 } });
        sm.cci.setData(toSeries(times, cciVals));
        const cciValid = toSeries(times, cciVals);
        if (cciValid.length) {
          const t0 = cciValid[0].time, t1 = cciValid[cciValid.length-1].time;
          sm.cci100 = chart.addLineSeries({ color:"rgba(244,63,94,0.4)", lineWidth:1, lineStyle:LineStyle.Dashed, priceScaleId:"cci", priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
          sm.cciN100 = chart.addLineSeries({ color:"rgba(16,185,129,0.4)", lineWidth:1, lineStyle:LineStyle.Dashed, priceScaleId:"cci", priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
          sm.cci100.setData([{ time:t0, value:100 },{ time:t1, value:100 }]);
          sm.cciN100.setData([{ time:t0, value:-100 },{ time:t1, value:-100 }]);
        }
      }

      // ── MACD pane ──
      if (indMACD) {
        const { macdLine, signalLine, histogram } = calcMACD(closes);
        sm.macd     = chart.addLineSeries({ color:C.macd, lineWidth:1, priceScaleId:"macd", priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
        sm.macdSig  = chart.addLineSeries({ color:C.signal, lineWidth:1, priceScaleId:"macd", priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
        sm.macdHist = chart.addHistogramSeries({ priceScaleId:"macd", priceLineVisible:false, lastValueVisible:false });
        chart.priceScale("macd").applyOptions({ scaleMargins:{ top:0.84, bottom:0.02 } });
        sm.macd.setData(toSeries(times, macdLine));
        sm.macdSig.setData(toSeries(times, signalLine));
        sm.macdHist.setData(
          times.map((t,i) => ({ time:t, value: histogram[i] ?? 0, color: histogram[i] >= 0 ? "rgba(38,166,154,0.6)" : "rgba(239,83,80,0.6)" }))
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
      indST, indStoch, indWR, indCCI, indRibbon, indVWAP]);

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
          <div style={{ width:20, height:20, borderRadius:4, background:"linear-gradient(135deg,#ffffff,#888888)", display:"flex", alignItems:"center", justifyContent:"center" }}>
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
              background: instId===p.value ? "rgba(34,211,238,0.07)" : "transparent",
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
                  color: showIndPanel ? "#050810" : "var(--text-secondary)",
                  background: showIndPanel ? "var(--accent-cyan)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${showIndPanel ? "transparent" : "var(--border-subtle)"}`,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <rect x="1" y="2" width="12" height="1.5" rx=".75" fill="currentColor"/>
                  <rect x="1" y="6.25" width="12" height="1.5" rx=".75" fill="currentColor"/>
                  <rect x="1" y="10.5" width="12" height="1.5" rx=".75" fill="currentColor"/>
                  <circle cx="4" cy="2.75" r="1.5" fill={showIndPanel ? "#050810" : "var(--accent-cyan)"}/>
                  <circle cx="9" cy="7" r="1.5" fill={showIndPanel ? "#050810" : "var(--accent-cyan)"}/>
                  <circle cx="5.5" cy="11.25" r="1.5" fill={showIndPanel ? "#050810" : "var(--accent-cyan)"}/>
                </svg>
                Indicators
                {activeCount > 0 && (
                  <span style={{
                    minWidth:16, height:16, borderRadius:8, fontSize:10, fontWeight:700,
                    background: showIndPanel ? "rgba(0,0,0,0.25)" : "var(--accent-cyan)",
                    color: showIndPanel ? "#050810" : "#050810",
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
                background:"#0f1724", border:"1px solid rgba(255,255,255,0.1)",
                borderRadius:10, padding:"16px", width:300,
                boxShadow:"0 16px 48px rgba(0,0,0,0.6)",
              }}>
                {/* Header */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:"var(--text-primary)", letterSpacing:"0.02em" }}>Indicators</span>
                  <button onClick={() => setShowIndPanel(false)} style={{ width:20, height:20, borderRadius:4, border:"1px solid var(--border-subtle)", background:"transparent", cursor:"pointer", color:"var(--text-muted)", fontSize:13, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
                </div>

                {/* Overlay */}
                <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  {/* Section: Overlays */}
                  <p style={{ fontSize:10, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:4, marginTop:2 }}>Overlays (main chart)</p>
                  {[
                    { label:"MA 7",         color:C.ma7,       active:indMA7,    set:setIndMA7    },
                    { label:"MA 25",        color:C.ma25,      active:indMA25,   set:setIndMA25   },
                    { label:"MA 99",        color:C.ma99,      active:indMA99,   set:setIndMA99   },
                    { label:"Bollinger Bands (20,2)", color:C.bbUpper, active:indBB, set:setIndBB },
                    { label:"Volume",       color:"#aaaaaa",   active:indVol,    set:setIndVol    },
                    { label:"VWAP",         color:C.vwap,      active:indVWAP,   set:setIndVWAP   },
                    { label:"EMA Ribbon (8/13/21/34/55)", color:C.ribbon[2], active:indRibbon, set:setIndRibbon },
                    { label:"SuperTrend (10,3)", color:C.stBull, active:indST,  set:setIndST     },
                  ].map(({ label, color, active, set }) => (
                    <button key={label} onClick={() => set(v => !v)} style={{
                      display:"flex", alignItems:"center", justifyContent:"space-between",
                      padding:"8px 10px", borderRadius:6, cursor:"pointer", transition:"all .12s",
                      background: active ? `${color}14` : "transparent",
                      border: `1px solid ${active ? color + "55" : "rgba(255,255,255,0.06)"}`,
                    }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ width:10, height:10, borderRadius:3, background:color, flexShrink:0, opacity: active ? 1 : 0.35 }} />
                        <span style={{ fontSize:12, color: active ? "var(--text-primary)" : "var(--text-muted)", fontWeight: active ? 500 : 400 }}>{label}</span>
                      </div>
                      {/* Toggle */}
                      <span style={{
                        width:32, height:18, borderRadius:9, position:"relative", flexShrink:0,
                        background: active ? color : "rgba(255,255,255,0.1)", transition:"background .15s",
                        display:"inline-block",
                      }}>
                        <span style={{
                          position:"absolute", top:3, left: active ? 17 : 3, width:12, height:12,
                          borderRadius:"50%", background:"#fff", transition:"left .15s",
                        }} />
                      </span>
                    </button>
                  ))}

                  {/* Section: Oscillators */}
                  <p style={{ fontSize:10, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:4, marginTop:10 }}>Oscillators (sub-panel)</p>
                  {[
                    { label:"RSI (14)",          color:C.rsiLine, active:indRSI,   set:setIndRSI   },
                    { label:"MACD (12,26,9)",     color:C.macd,    active:indMACD,  set:setIndMACD  },
                    { label:"Stochastic RSI",     color:C.stochK,  active:indStoch, set:setIndStoch },
                    { label:"Williams %R (14)",   color:C.wr,      active:indWR,    set:setIndWR    },
                    { label:"CCI (20)",           color:C.cci,     active:indCCI,   set:setIndCCI   },
                  ].map(({ label, color, active, set }) => (
                    <button key={label} onClick={() => set(v => !v)} style={{
                      display:"flex", alignItems:"center", justifyContent:"space-between",
                      padding:"8px 10px", borderRadius:6, cursor:"pointer", transition:"all .12s",
                      background: active ? `${color}14` : "transparent",
                      border: `1px solid ${active ? color + "55" : "rgba(255,255,255,0.06)"}`,
                    }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ width:10, height:10, borderRadius:3, background:color, flexShrink:0, opacity: active ? 1 : 0.35 }} />
                        <span style={{ fontSize:12, color: active ? "var(--text-primary)" : "var(--text-muted)", fontWeight: active ? 500 : 400 }}>{label}</span>
                      </div>
                      <span style={{
                        width:32, height:18, borderRadius:9, position:"relative", flexShrink:0,
                        background: active ? color : "rgba(255,255,255,0.1)", transition:"background .15s",
                        display:"inline-block",
                      }}>
                        <span style={{
                          position:"absolute", top:3, left: active ? 17 : 3, width:12, height:12,
                          borderRadius:"50%", background:"#fff", transition:"left .15s",
                        }} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ══ CHART AREA ══════════════════════════════════════════════════════ */}
      <div style={{ flex:1, position:"relative", overflow:"hidden" }}>
        {error && (
          <div style={{ position:"absolute", top:10, left:10, right:10, zIndex:20, padding:"9px 13px", borderRadius:6, fontSize:12, background:"rgba(244,63,94,0.1)", border:"1px solid rgba(244,63,94,0.3)", color:"#fca5a5" }}>
            ⚠ {error}
          </div>
        )}

        {isLoading && (
          <div style={{ position:"absolute", inset:0, zIndex:10, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"rgba(5,8,16,0.9)", gap:12 }}>
            <div className="spin" style={{ width:28, height:28, border:"2px solid var(--border-subtle)", borderTopColor:"var(--accent-cyan)", borderRadius:"50%" }} />
            <span style={{ fontSize:11, color:"var(--text-muted)" }}>Loading candles…</span>
          </div>
        )}

        {!isLoading && candles.length === 0 && !error && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <span style={{ fontSize:12, color:"var(--text-muted)" }}>No data available</span>
          </div>
        )}

        <div ref={containerRef} style={{ width:"100%", height:"100%" }} />
        <button
          onClick={() => { if (chartRef.current) chartRef.current.timeScale().scrollToRealTime(); }}
          style={{
            position: "absolute", bottom: 24, right: 64, zIndex: 30,
            background: "rgba(34,211,238,0.15)", color: "var(--accent-cyan)",
            border: "1px solid rgba(34,211,238,0.3)",
            padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
            cursor: "pointer", backdropFilter: "blur(4px)"
          }}
        >
          Kembali ke Awal &raquo;
        </button>
      </div>

      {/* ══ STATUS BAR ══════════════════════════════════════════════════════ */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"0 14px", height:24, flexShrink:0,
        borderTop:"1px solid var(--border-subtle)", background:"var(--bg-panel)",
        fontSize:10, color:"var(--text-muted)",
      }}>
        <div style={{ display:"flex", gap:14 }}>
          <span>OKX Exchange · {wsStatus === "polling" ? "REST Polling (WS unavailable)" : "WebSocket v5 Business"}</span>
          <span style={{ color:"var(--border-subtle)" }}>|</span>
          <span>{candles.length} candles</span>
          {liveCandle && <span style={{ color:"var(--green)", display:"flex", alignItems:"center", gap:4 }}><span className="pulse-dot" style={{ width:5, height:5, borderRadius:"50%", background:"var(--green)", display:"inline-block" }} />Live updating</span>}
        </div>
        <div style={{ display:"flex", gap:14 }}>
          <span>{instId} · {bar}</span>
          <span style={{ color:"var(--border-subtle)" }}>|</span>
          <span>lightweight-charts v4 · TradingView</span>
        </div>
      </div>
    </div>
  );
}
