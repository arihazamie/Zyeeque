/**
 * indicators.js
 * Technical indicators — backed by the `technicalindicators` npm library.
 *
 * Semua fungsi yang di-ekspor mempertahankan signature dan format output yang
 * IDENTIK dengan versi manual sebelumnya, sehingga app/page.jsx tidak perlu
 * diubah sama sekali.
 *
 * Format output: setiap array sejajar dengan array input (sama panjang),
 * dengan `null` pada posisi warm-up period — persis seperti sebelumnya.
 *
 * Install: npm install technicalindicators
 *
 * Indikator yang menggunakan technicalindicators:
 *   calcSMA, calcEMA, calcRSI, calcMACD, calcBB,
 *   calcATR, calcStochRSI, calcWilliamsR, calcCCI,
 *   calcEMARibbon, calcVWAP
 *
 * Tetap manual (tidak tersedia di library):
 *   calcRMA, calcWMA, calcVWMA, calcSTDEV,
 *   calcSuperTrend, calcVolumeDelta, calcEMAIndicator
 */

import {
  SMA,
  EMA,
  RSI,
  MACD,
  BollingerBands,
  ATR,
  WilliamsR,
  CCI,
  VWAP,
  StochasticRSI,
} from "technicalindicators";

// ─── Helper: pad array dengan null di depan ───────────────────────────────────
// technicalindicators mengembalikan array LEBIH PENDEK (tanpa null warm-up).
// Fungsi ini mengembalikan array sejajar dengan input asli.
function padNull(inputLen, results) {
  const offset = inputLen - results.length;
  return [...Array(offset).fill(null), ...results];
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════════

/** ta.sma — via technicalindicators SMA */
export function calcSMA(src, length) {
  if (src.length < length) return Array(src.length).fill(null);
  const results = SMA.calculate({ period: length, values: src });
  return padNull(src.length, results);
}

/** ta.ema — via technicalindicators EMA */
export function calcEMA(src, length) {
  if (src.length < length) return Array(src.length).fill(null);
  const results = EMA.calculate({ period: length, values: src });
  return padNull(src.length, results);
}

/** ta.rma — Wilder's MA. Tetap manual, dipakai oleh SuperTrend. */
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

/** ta.wma — tetap manual */
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

/** ta.vwma — tetap manual */
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

/** ta.stdev — population std dev, tetap manual */
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

/** ta.atr — via technicalindicators ATR */
export function calcATR(highs, lows, closes, length) {
  if (closes.length < length + 1) return Array(closes.length).fill(null);
  const results = ATR.calculate({ high: highs, low: lows, close: closes, period: length });
  return padNull(closes.length, results);
}

/** ta.rsi — via technicalindicators RSI */
export function calcRSI(src, length) {
  if (src.length < length + 1) return Array(src.length).fill(null);
  const results = RSI.calculate({ period: length, values: src });
  return padNull(src.length, results);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INDICATOR 1 — SUPERTREND (tetap manual, pakai calcATR baru)
// ═══════════════════════════════════════════════════════════════════════════════
export function calcSuperTrend(highs, lows, closes, period = 10, multiplier = 3.0) {
  const atr        = calcATR(highs, lows, closes, period);
  const supertrend = new Array(closes.length).fill(null);
  const direction  = new Array(closes.length).fill(null);
  let prevUpper = null, prevLower = null, prevST = null;

  for (let i = 0; i < closes.length; i++) {
    if (atr[i] == null) continue;
    const src = (highs[i] + lows[i]) / 2;
    let upper = src + multiplier * atr[i];
    let lower = src - multiplier * atr[i];

    if (prevUpper !== null)
      upper = (upper < prevUpper || (i > 0 && closes[i - 1] > prevUpper)) ? upper : prevUpper;
    if (prevLower !== null)
      lower = (lower > prevLower || (i > 0 && closes[i - 1] < prevLower)) ? lower : prevLower;

    let dir;
    if (prevST === null) {
      dir = 1;
    } else if (prevST === prevUpper) {
      dir = closes[i] <= upper ? 1 : -1;
    } else {
      dir = closes[i] >= lower ? -1 : 1;
    }

    const st = dir === 1 ? upper : lower;
    supertrend[i] = st;
    direction[i]  = dir;
    prevUpper = upper;
    prevLower = lower;
    prevST    = st;
  }

  return { supertrend, direction };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INDICATOR 2 — MACD (via technicalindicators)
//  Output identik: { macdLine, signalLine, histogram, histColor }
// ═══════════════════════════════════════════════════════════════════════════════
export function calcMACD(closes, fast = 12, slow = 26, signal = 9, oscType = "EMA", sigType = "EMA") {
  const raw = MACD.calculate({
    values: closes,
    fastPeriod: fast,
    slowPeriod: slow,
    signalPeriod: signal,
    SimpleMAOscillator: oscType === "SMA",
    SimpleMASignal: sigType === "SMA",
  });

  const offset     = closes.length - raw.length;
  const macdLine   = Array(offset).fill(null);
  const signalLine = Array(offset).fill(null);
  const histogram  = Array(offset).fill(null);
  const histColor  = Array(offset).fill(null);

  raw.forEach((r, i) => {
    const m = r.MACD      ?? null;
    const s = r.signal    ?? null;
    const h = r.histogram ?? null;
    macdLine.push(m);
    signalLine.push(s);
    histogram.push(h);

    if (h == null) { histColor.push(null); return; }
    const prev    = i > 0 ? (raw[i - 1].histogram ?? null) : null;
    const growing = prev == null || h > prev;
    histColor.push(
      h >= 0
        ? (growing ? "#26a69a" : "#b2dfdb")
        : (growing ? "#ffcdd2" : "#ff5252")
    );
  });

  return { macdLine, signalLine, histogram, histColor };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INDICATOR 3 — VOLUME DELTA (tetap manual)
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
//  INDICATOR 4 — EMA WITH OPTIONAL SMOOTHING (base EMA via library)
// ═══════════════════════════════════════════════════════════════════════════════
export function calcEMAIndicator(closes, volumes, len = 9, smoothType = "None", smoothLen = 14, bbMult = 2.0) {
  const ema       = calcEMA(closes, len);
  const emaFilled = ema.map(v => v ?? 0);

  let smoothMA = new Array(closes.length).fill(null);
  let bbUpper  = new Array(closes.length).fill(null);
  let bbLower  = new Array(closes.length).fill(null);

  if (smoothType !== "None") {
    switch (smoothType) {
      case "SMA":
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
//  ADDITIONAL INDICATORS — via technicalindicators
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Bollinger Bands — output: { upper, middle, lower }
 */
export function calcBB(closes, period = 20, stdDev = 2) {
  if (closes.length < period) {
    const e = Array(closes.length).fill(null);
    return { upper: e, middle: [...e], lower: [...e] };
  }
  const raw    = BollingerBands.calculate({ period, values: closes, stdDev });
  const offset = closes.length - raw.length;
  const upper  = Array(offset).fill(null);
  const middle = Array(offset).fill(null);
  const lower  = Array(offset).fill(null);
  raw.forEach(r => { upper.push(r.upper); middle.push(r.middle); lower.push(r.lower); });
  return { upper, middle, lower };
}

/**
 * Stochastic RSI — output: { k, d }
 */
export function calcStochRSI(closes, rsiPeriod = 14, stochPeriod = 14, kPeriod = 3, dPeriod = 3) {
  if (closes.length < rsiPeriod + stochPeriod + kPeriod + dPeriod) {
    const e = Array(closes.length).fill(null);
    return { k: e, d: [...e] };
  }
  const raw    = StochasticRSI.calculate({
    values: closes,
    rsiPeriod,
    stochasticPeriod: stochPeriod,
    kPeriod,
    dPeriod,
  });
  const offset = closes.length - raw.length;
  const k = Array(offset).fill(null);
  const d = Array(offset).fill(null);
  raw.forEach(r => { k.push(r.k ?? null); d.push(r.d ?? null); });
  return { k, d };
}

/**
 * Williams %R — output: array sejajar closes
 */
export function calcWilliamsR(highs, lows, closes, period = 14) {
  if (closes.length < period) return Array(closes.length).fill(null);
  const raw = WilliamsR.calculate({ high: highs, low: lows, close: closes, period });
  return padNull(closes.length, raw);
}

/**
 * CCI — output: array sejajar closes
 */
export function calcCCI(highs, lows, closes, period = 20) {
  if (closes.length < period) return Array(closes.length).fill(null);
  const raw = CCI.calculate({ high: highs, low: lows, close: closes, period });
  return padNull(closes.length, raw);
}

/**
 * EMA Ribbon — output: { ema8, ema13, ema21, ema34, ema55 }
 */
export function calcEMARibbon(closes) {
  return {
    ema8:  calcEMA(closes, 8),
    ema13: calcEMA(closes, 13),
    ema21: calcEMA(closes, 21),
    ema34: calcEMA(closes, 34),
    ema55: calcEMA(closes, 55),
  };
}

/**
 * VWAP — input: array candle dengan { h, l, c, v }
 * Output: array sejajar candles
 */
export function calcVWAP(candles) {
  if (candles.length < 2) return Array(candles.length).fill(null);
  const raw = VWAP.calculate({
    high:   candles.map(c => c.h),
    low:    candles.map(c => c.l),
    close:  candles.map(c => c.c),
    volume: candles.map(c => c.v),
  });
  return raw.map(v => (v == null || isNaN(v) ? null : v));
}
