/**
 * indicators.js
 * Technical indicators — converted 1:1 from official PineScript v6 sources.
 *
 * Primitives mirror PineScript's ta.* namespace:
 *   calcSMA   → ta.sma
 *   calcEMA   → ta.ema
 *   calcRMA   → ta.rma   (Wilder's smoothing / SMMA)
 *   calcWMA   → ta.wma
 *   calcVWMA  → ta.vwma
 *   calcSTDEV → ta.stdev
 *   calcATR   → ta.atr   (ta.rma of ta.tr(true))
 *   calcRSI   → ta.rsi   (ta.rma internally)
 *
 * Indicators (1:1 PineScript v6 conversions):
 *   calcSuperTrend   → indicator("Supertrend")
 *   calcMACD         → indicator("MACD")
 *   calcVolumeDelta  → indicator("Volume Delta")  [approximated — see note]
 *   calcEMAIndicator → indicator("EMA") with full smoothing options
 *
 * NOTE on Volume Delta:
 *   PineScript uses ta.requestVolumeDelta(lowerTF) which needs tick/LTF data.
 *   We approximate with: delta = volume × (2×close − high − low) / (high − low)
 *   This is the standard approximation used when tick data is unavailable.
 *
 * All arrays are parallel to candle input (index 0 = oldest bar).
 * null is used where PineScript emits na.
 */

// ═══════════════════════════════════════════════════════════════════════════════
//  PRIMITIVES  (ta.* equivalents)
// ═══════════════════════════════════════════════════════════════════════════════

/** ta.sma */
export function calcSMA(src, length) {
  const out = [];
  for (let i = 0; i < src.length; i++) {
    if (i < length - 1) { out.push(null); continue; }
    let sum = 0;
    for (let j = i - length + 1; j <= i; j++) sum += src[j];
    out.push(sum / length);
  }
  return out;
}

/**
 * ta.ema — alpha = 2/(length+1), seeded with SMA of first `length` bars.
 * After warm-up this converges identically to PineScript output.
 */
export function calcEMA(src, length) {
  const alpha = 2 / (length + 1);
  const out   = [];
  let   ema   = null;
  for (let i = 0; i < src.length; i++) {
    if (src[i] == null) { out.push(null); continue; }
    if (ema === null) {
      if (i < length - 1) { out.push(null); continue; }
      let sum = 0;
      for (let j = i - length + 1; j <= i; j++) sum += src[j];
      ema = sum / length;
    } else {
      ema = src[i] * alpha + ema * (1 - alpha);
    }
    out.push(ema);
  }
  return out;
}

/**
 * ta.rma — Wilder's Moving Average.  alpha = 1/length.
 * Seeds with SMA of first `length` bars.
 */
export function calcRMA(src, length) {
  const alpha = 1 / length;
  const out   = [];
  let   rma   = null;
  for (let i = 0; i < src.length; i++) {
    if (src[i] == null) { out.push(null); continue; }
    if (rma === null) {
      if (i < length - 1) { out.push(null); continue; }
      let sum = 0;
      for (let j = i - length + 1; j <= i; j++) sum += src[j];
      rma = sum / length;
    } else {
      rma = src[i] * alpha + rma * (1 - alpha);
    }
    out.push(rma);
  }
  return out;
}

/** ta.wma — weights: 1, 2, … length (newest = highest) */
export function calcWMA(src, length) {
  const denom = (length * (length + 1)) / 2;
  const out   = [];
  for (let i = 0; i < src.length; i++) {
    if (i < length - 1) { out.push(null); continue; }
    let sum = 0;
    for (let j = 0; j < length; j++) sum += src[i - (length - 1 - j)] * (j + 1);
    out.push(sum / denom);
  }
  return out;
}

/** ta.vwma */
export function calcVWMA(src, volumes, length) {
  const out = [];
  for (let i = 0; i < src.length; i++) {
    if (i < length - 1) { out.push(null); continue; }
    let pv = 0, v = 0;
    for (let j = i - length + 1; j <= i; j++) { pv += src[j] * volumes[j]; v += volumes[j]; }
    out.push(v === 0 ? null : pv / v);
  }
  return out;
}

/** ta.stdev — population std dev (biased=true, matching PineScript default) */
export function calcSTDEV(src, length) {
  const sma = calcSMA(src, length);
  const out  = [];
  for (let i = 0; i < src.length; i++) {
    if (sma[i] == null) { out.push(null); continue; }
    let variance = 0;
    for (let j = i - length + 1; j <= i; j++) variance += (src[j] - sma[i]) ** 2;
    out.push(Math.sqrt(variance / length));
  }
  return out;
}

/** ta.tr(true) — True Range with gap handling */
function calcTR(highs, lows, closes) {
  return highs.map((h, i) =>
    i === 0
      ? h - lows[i]
      : Math.max(h - lows[i], Math.abs(h - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]))
  );
}

/** ta.atr — ta.rma(ta.tr(true), length) */
export function calcATR(highs, lows, closes, length) {
  return calcRMA(calcTR(highs, lows, closes), length);
}

/** ta.rsi — uses ta.rma for avgGain / avgLoss */
export function calcRSI(src, length) {
  const gains  = [0], losses = [0];
  for (let i = 1; i < src.length; i++) {
    const d = src[i] - src[i - 1];
    gains.push(Math.max(d, 0));
    losses.push(Math.max(-d, 0));
  }
  const ag = calcRMA(gains,  length);
  const al = calcRMA(losses, length);
  return ag.map((g, i) => {
    if (g == null || al[i] == null) return null;
    if (al[i] === 0) return 100;
    return 100 - 100 / (1 + g / al[i]);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INDICATOR 1 — SUPERTREND
//  PineScript source: indicator("Supertrend", overlay=true)
//
//  Internal ta.supertrend(factor, atrPeriod):
//    src        = hl2
//    atr        = ta.atr(atrPeriod)
//    upperBand  = src + factor * atr   (resistance — active in downtrend)
//    lowerBand  = src - factor * atr   (support   — active in uptrend)
//
//    Band adjustments (bands cannot widen against current trend):
//      upperBand := na(upperBand[1]) or upperBand < upperBand[1] or close[1] > upperBand[1]
//                   ? upperBand : upperBand[1]
//      lowerBand := na(lowerBand[1]) or lowerBand > lowerBand[1] or close[1] < lowerBand[1]
//                   ? lowerBand : lowerBand[1]
//
//    Direction tracking (PineScript sign: -1 = uptrend, 1 = downtrend):
//      direction = na(atr[1]) ? 1
//                : prevST == prevUpper
//                    ? (close <= upper ? 1  : -1)   // was downtrend
//                    : (close >= lower ? -1 : 1 )   // was uptrend
//      supertrend = direction == 1 ? upper : lower
//
//  Plot mappings from PineScript:
//    upTrend   = direction <  0  → green line (supertrend below price)
//    downTrend = direction >= 0  → red   line (supertrend above price)
//    fill bodyMiddle↔upTrend   → green bg (90% transparent)
//    fill bodyMiddle↔downTrend → red   bg (90% transparent)
// ═══════════════════════════════════════════════════════════════════════════════
export function calcSuperTrend(highs, lows, closes, period = 10, multiplier = 3.0) {
  const atr        = calcATR(highs, lows, closes, period);
  const supertrend = new Array(closes.length).fill(null);
  const direction  = new Array(closes.length).fill(null);
  let prevUpper = null, prevLower = null, prevST = null, prevDir = null;

  for (let i = 0; i < closes.length; i++) {
    if (atr[i] == null) continue;
    const src = (highs[i] + lows[i]) / 2;
    let upper = src + multiplier * atr[i];
    let lower = src - multiplier * atr[i];

    // Band adjustment
    if (prevUpper !== null)
      upper = (upper < prevUpper || (i > 0 && closes[i - 1] > prevUpper)) ? upper : prevUpper;
    if (prevLower !== null)
      lower = (lower > prevLower || (i > 0 && closes[i - 1] < prevLower)) ? lower : prevLower;

    // Direction (PineScript sign: -1=up, 1=down)
    let dir;
    if (prevDir === null) {
      dir = 1;                                                  // na(atr[1]) ? 1
    } else if (prevST === prevUpper) {
      dir = closes[i] <= upper ? 1 : -1;                       // was downtrend
    } else {
      dir = closes[i] >= lower ? -1 : 1;                       // was uptrend
    }

    const st      = dir === 1 ? upper : lower;
    supertrend[i] = st;
    direction[i]  = dir;
    prevUpper = upper; prevLower = lower; prevST = st; prevDir = dir;
  }
  return { supertrend, direction };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INDICATOR 2 — MACD
//  PineScript source: indicator("Moving Average Convergence Divergence", "MACD")
//
//  ma(source, length, maType) =>
//    "EMA" → ta.ema  |  "SMA" → ta.sma
//
//  maFast  = ma(close, fastLen=12, oscType="EMA")
//  maSlow  = ma(close, slowLen=26, oscType="EMA")
//  macd    = maFast − maSlow
//  signal  = ma(macd, sigLen=9, sigType="EMA")
//  hist    = macd − signal
//
//  Histogram colour (exact PineScript values):
//    hist >= 0 → growing: #26a69a  shrinking: #b2dfdb
//    hist <  0 → growing: #ffcdd2  shrinking: #ff5252
// ═══════════════════════════════════════════════════════════════════════════════
export function calcMACD(closes, fast = 12, slow = 26, signal = 9, oscType = "EMA", sigType = "EMA") {
  const ma = (src, len, type) => type === "SMA" ? calcSMA(src, len) : calcEMA(src, len);

  const maFast   = ma(closes, fast, oscType);
  const maSlow   = ma(closes, slow, oscType);
  const macdLine = maFast.map((f, i) => f != null && maSlow[i] != null ? f - maSlow[i] : null);

  // Feed macd into signal MA; treat null gaps as 0 (Pine skips na internally)
  const sigInput   = macdLine.map(v => v ?? 0);
  const signalLine = ma(sigInput, signal, sigType).map((v, i) => macdLine[i] == null ? null : v);
  const histogram  = macdLine.map((v, i) => v != null && signalLine[i] != null ? v - signalLine[i] : null);

  // Exact PineScript histogram colour
  const histColor = histogram.map((h, i) => {
    if (h == null) return null;
    const prev    = i > 0 ? histogram[i - 1] : null;
    const growing = prev == null || h > prev;
    return h >= 0
      ? (growing ? "#26a69a" : "#b2dfdb")
      : (growing ? "#ffcdd2" : "#ff5252");
  });

  return { macdLine, signalLine, histogram, histColor };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INDICATOR 3 — VOLUME DELTA
//  PineScript source: indicator("Volume Delta", format=format.volume)
//
//  Original uses: ta.requestVolumeDelta(lowerTF)  ← requires tick/LTF data.
//  Approximation (standard when tick data is absent):
//
//    upVol   = volume × (close − low)  / (high − low)
//    downVol = volume × (high − close) / (high − low)
//    delta   = upVol − downVol = volume × (2×close − high − low) / (high − low)
//
//  Returns candlestick-format arrays matching plotcandle() from PineScript:
//    open  = 0          (accumulated delta at candle start)
//    close = delta      (net delta at candle end)
//    high  = max(0, delta)
//    low   = min(0, delta)
//    color = teal if delta > 0, red otherwise  (matches PineScript col)
// ═══════════════════════════════════════════════════════════════════════════════
export function calcVolumeDelta(highs, lows, closes, volumes) {
  const open = [], high = [], low = [], close = [], color = [];
  for (let i = 0; i < closes.length; i++) {
    const range = highs[i] - lows[i];
    const delta = range === 0 ? 0 : volumes[i] * (2 * closes[i] - highs[i] - lows[i]) / range;
    open.push(0);
    close.push(delta);
    high.push(Math.max(0, delta));
    low.push(Math.min(0, delta));
    color.push(delta > 0 ? "#26a69a" : "#ef5350");
  }
  return { open, high, low, close, color };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INDICATOR 4 — EMA WITH OPTIONAL SMOOTHING
//  PineScript source: indicator("Moving Average Exponential", "EMA", overlay=true)
//
//  Base:   out = ta.ema(close, len)                   [default len=9]
//
//  Smoothing types (applied to `out`):
//    "None"                 — disabled
//    "SMA"                  → ta.sma(out, smoothLen)
//    "SMA + Bollinger Bands"→ ta.sma(out, smoothLen) ± bbMult × ta.stdev(out, smoothLen)
//    "EMA"                  → ta.ema(out, smoothLen)
//    "SMMA (RMA)"           → ta.rma(out, smoothLen)
//    "WMA"                  → ta.wma(out, smoothLen)
//    "VWMA"                 → ta.vwma(out, volume, smoothLen)
// ═══════════════════════════════════════════════════════════════════════════════
export function calcEMAIndicator(closes, volumes, len = 9, smoothType = "None", smoothLen = 14, bbMult = 2.0) {
  const ema       = calcEMA(closes, len);
  const emaFilled = ema.map(v => v ?? 0);   // treat na as 0 for downstream MAs

  let smoothMA = new Array(closes.length).fill(null);
  let bbUpper  = new Array(closes.length).fill(null);
  let bbLower  = new Array(closes.length).fill(null);

  const mask = v => (_, i) => ema[i] == null ? null : v[i];  // restore nulls

  if (smoothType !== "None") {
    switch (smoothType) {
      case "SMA":
        smoothMA = calcSMA(emaFilled, smoothLen).map(mask(calcSMA(emaFilled, smoothLen)));
        // simpler:
        smoothMA = calcSMA(emaFilled, smoothLen).map((v, i) => ema[i] == null ? null : v);
        break;
      case "SMA + Bollinger Bands": {
        const sma   = calcSMA(emaFilled, smoothLen);
        const stdev = calcSTDEV(emaFilled, smoothLen);
        smoothMA = sma.map((v, i)   => ema[i] == null ? null : v);
        bbUpper  = sma.map((v, i)   => (ema[i] == null || stdev[i] == null) ? null : v + bbMult * stdev[i]);
        bbLower  = sma.map((v, i)   => (ema[i] == null || stdev[i] == null) ? null : v - bbMult * stdev[i]);
        break;
      }
      case "EMA":
        smoothMA = calcEMA(emaFilled, smoothLen).map((v, i) => ema[i] == null ? null : v);
        break;
      case "SMMA (RMA)":
        smoothMA = calcRMA(emaFilled, smoothLen).map((v, i) => ema[i] == null ? null : v);
        break;
      case "WMA":
        smoothMA = calcWMA(emaFilled, smoothLen).map((v, i) => ema[i] == null ? null : v);
        break;
      case "VWMA":
        smoothMA = calcVWMA(emaFilled, volumes, smoothLen).map((v, i) => ema[i] == null ? null : v);
        break;
    }
  }

  return { ema, smoothMA, bbUpper, bbLower };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ADDITIONAL / LEGACY INDICATORS  (used by existing chart code)
// ═══════════════════════════════════════════════════════════════════════════════

export function calcBB(closes, period = 20, stdDev = 2) {
  const middle = calcSMA(closes, period);
  const stdev  = calcSTDEV(closes, period);
  return {
    middle,
    upper: middle.map((m, i) => m == null ? null : m + stdDev * stdev[i]),
    lower: middle.map((m, i) => m == null ? null : m - stdDev * stdev[i]),
  };
}

function smoothSMALocal(values, period) {
  const clean = values.map(v => v ?? 0);
  return calcSMA(clean, period).map((v, i) => values[i] == null ? null : v);
}

export function calcStochRSI(closes, rsiPeriod = 14, stochPeriod = 14, kPeriod = 3, dPeriod = 3) {
  const rsi  = calcRSI(closes, rsiPeriod);
  const kRaw = [];
  for (let i = 0; i < rsi.length; i++) {
    if (rsi[i] == null || i < rsiPeriod + stochPeriod - 2) { kRaw.push(null); continue; }
    const win = rsi.slice(i - stochPeriod + 1, i + 1).filter(v => v != null);
    if (win.length < stochPeriod) { kRaw.push(null); continue; }
    const lo = Math.min(...win), hi = Math.max(...win);
    kRaw.push(hi === lo ? 100 : ((rsi[i] - lo) / (hi - lo)) * 100);
  }
  const k = smoothSMALocal(kRaw, kPeriod);
  const d = smoothSMALocal(k,    dPeriod);
  return { k, d };
}

export function calcWilliamsR(highs, lows, closes, period = 14) {
  const out = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    const hh = Math.max(...highs.slice(i - period + 1, i + 1));
    const ll = Math.min(...lows.slice(i  - period + 1, i + 1));
    out.push(hh === ll ? -50 : ((hh - closes[i]) / (hh - ll)) * -100);
  }
  return out;
}

export function calcCCI(highs, lows, closes, period = 20) {
  const out = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    const typicals = [];
    for (let j = i - period + 1; j <= i; j++) typicals.push((highs[j] + lows[j] + closes[j]) / 3);
    const tp  = (highs[i] + lows[i] + closes[i]) / 3;
    const sma = typicals.reduce((a, b) => a + b, 0) / period;
    const mad = typicals.reduce((a, b) => a + Math.abs(b - sma), 0) / period;
    out.push(mad === 0 ? 0 : (tp - sma) / (0.015 * mad));
  }
  return out;
}

export function calcEMARibbon(closes) {
  return {
    ema8:  calcEMA(closes, 8),
    ema13: calcEMA(closes, 13),
    ema21: calcEMA(closes, 21),
    ema34: calcEMA(closes, 34),
    ema55: calcEMA(closes, 55),
  };
}

export function calcVWAP(candles) {
  let cumPV = 0, cumV = 0;
  return candles.map(({ h, l, c, v }) => {
    const tp = (h + l + c) / 3;
    cumPV += tp * v; cumV += v;
    return cumV === 0 ? null : cumPV / cumV;
  });
}
