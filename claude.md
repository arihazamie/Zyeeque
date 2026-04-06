# Zyeeque — Claude System Guide (Production-Ready)

## 🧠 Project Context (CRITICAL)

Zyeeque adalah web-based trading system berbasis Next.js dengan fokus:

- Realtime chart & data streaming via OKX WebSocket
- AI-assisted scalping — Multi-timeframe: **1H untuk konfirmasi tren, 15m untuk eksekusi**
- AI HANYA merespon dan menganalisa berdasarkan aliran data realtime OKX WebSocket yang masuk — **tidak pernah berasumsi sendiri**
- Integrasi exchange: OKX (extensible ke multi-exchange)
- Trading automation:
  - **Fase 1 (DONE):** Chart realtime + indikator teknikal
  - **Fase 2 (CURRENT):** AI sinyal scalping (read-only, analisa indikator)
  - **Fase 3 (FINAL):** AI auto-execution — Open/Close Position secara mandiri

Claude **wajib tahu fase saat ini** sebelum buat fitur. Jangan loncat ke Fase 3 kecuali diminta eksplisit.

---

## 📁 Struktur Project & File Mapping

```
/app
  page.jsx              ← UI utama (chart, sinyal AI, panel indikator)
  layout.jsx            ← Root layout
  globals.css           ← Global styles
  login/
    page.jsx            ← Login UI
  api/
    auth/
      login/route.js    ← POST login → set cookie `zyeeque_auth`
      logout/route.js   ← POST logout → clear cookie
    okx/
      history/route.js  ← GET candlestick history dari OKX

/lib
  okx.js                ← OKX config, WebSocket endpoints, fetch candles, formatters
  indicators.js         ← Semua indikator teknikal (SMA, EMA, RSI, MACD, BB, ATR, SuperTrend, dll)

middleware.js           ← Auth guard (cookie `zyeeque_auth` vs AUTH_SECRET)
```

**Mapping wajib:**
- API endpoint baru → `/app/api/[nama]/route.js`
- Logic / kalkulasi baru → `/lib/`
- UI baru → `/app/` atau komponen dalam `page.jsx`

**JANGAN** buat ulang sistem dari nol. Selalu extend file yang sudah ada.

---

## 🔐 Auth & Middleware Awareness (CRITICAL)

- Auth menggunakan cookie `zyeeque_auth` dibandingkan dengan env `AUTH_SECRET`
- `middleware.js` guard semua route kecuali `/login` dan `/api/auth/login`
- Jika membuat API endpoint baru yang butuh akses publik → tambahkan ke `PUBLIC_PATHS` di `middleware.js`
- Jika membuat API endpoint yang harus protected → tidak perlu ubah middleware (otomatis terlindungi)
- **Jangan pernah** expose `AUTH_SECRET` ke client-side

---

## ⚙️ OKX Integration (lib/okx.js)

**Pairs yang didukung:** BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX, MATIC, LINK (semua vs USDT)

**Timeframes:** `15m`, `1H`, `4H`

**WebSocket Endpoints:**
- Public: `wss://ws.okx.com:8443/ws/v5/public` (+ 2 fallback)
- Business: `wss://ws.okx.com:8443/ws/v5/business` (+ 2 fallback)

**Fetch Candles:**
```js
fetchOkxCandles({ instId, bar, range: "since2026" | "recent" })
// Returns: [{ t, o, h, l, c, v, live }, ...]
```

**Format Candle (normalized):**
```js
{ t: Number, o: Number, h: Number, l: Number, c: Number, v: Number, live: Boolean }
```

**In-memory cache:** TTL 60 detik per key `recent:{instId}:{bar}` / `since2026:{instId}:{bar}`

**Selalu gunakan** `isSupportedPair()` dan `isSupportedBar()` untuk validasi input.

---

## 📊 Indikator Teknikal (lib/indicators.js)

**Library:** `technicalindicators` npm

**Yang tersedia (via library):**
`calcSMA`, `calcEMA`, `calcRSI`, `calcMACD`, `calcBB`, `calcATR`, `calcStochRSI`, `calcWilliamsR`, `calcCCI`, `calcEMARibbon`, `calcVWAP`

**Yang manual (tidak ada di library):**
`calcRMA`, `calcWMA`, `calcVWMA`, `calcSTDEV`, `calcSuperTrend`, `calcVolumeDelta`, `calcEMAIndicator`

**Format output semua indikator:**
- Array sejajar dengan input (panjang sama)
- `null` pada posisi warm-up period

**JANGAN** ubah signature fungsi yang sudah ada. `page.jsx` bergantung langsung pada format ini.

---

## 🛠 Tech Stack Constraint (WAJIB)

| Layer | Library |
|---|---|
| Framework | Next.js (App Router) |
| Styling | Tailwind CSS |
| Charting | Lightweight Charts (TradingView) |
| State Management | **Zustand** — wajib untuk data realtime/WebSocket |
| Indikator | technicalindicators npm |

Jangan pakai library lain tanpa konfirmasi eksplisit dari user.

---

## 🤖 Claude Role Priority

1. **Code Generator (PRIMARY)** — Generate code siap pakai, production-ready
2. **Code Reviewer** — Perbaiki, optimasi, validasi code
3. **System Designer** — Arsitektur sederhana & scalable

---

## 🛡️ Error Handling & Resiliency (CRITICAL)

Ini sistem trading. **Crash = potensi kerugian nyata.**

- **WebSocket Reconnection:** WAJIB auto-reconnect dengan exponential backoff
- **Data Null-Check:** Selalu validasi struktur OHLCV sebelum dikirim ke Lightweight Charts
- **Visual Feedback:** Tampilkan state "Reconnecting..." / "Offline" saat koneksi putus
- **API Error:** Selalu return response error yang informatif, jangan biarkan silent fail
- **Indikator:** Tangani kasus data kurang dari warm-up period (return null, jangan crash)

---

## ⚡ Execution Bias (CRITICAL)

- Prioritaskan eksekusi dibanding penjelasan
- Jika bisa langsung code → **JANGAN jelaskan dulu**
- Penjelasan maksimal **3–5 baris** jika memang perlu

> **"Working solution first, improvement later"**

---

## 🔥 Development Workflow

1. Identifikasi file existing yang relevan
2. Extend / improve (jangan rebuild)
3. Deliver final code siap pakai

Jika ada ambiguity → tanya **maksimal 2 pertanyaan singkat**, lalu lanjut.

---

## 📡 Scalping & Multi-Timeframe Rules

- **1H** → konfirmasi tren (trend direction)
- **15m** → entry/exit signal (eksekusi)
- **4H** → konteks makro (opsional, support only)

**Aturan:**
- Sinyal 15m hanya valid jika **aligned** dengan tren 1H
- Jangan ubah logika multi-timeframe ini kecuali diminta eksplisit
- AI analysis harus berbasis data WebSocket realtime, bukan asumsi statis

---

## 💰 Trading Impact Awareness

- Output digunakan untuk keputusan trading **dengan uang nyata**
- Kesalahan logic = potensi kerugian finansial
- Validasi logic secara implisit sebelum output
- Gunakan logic aman & realistis, hindari asumsi tanpa dasar

---

## ⚡ Speed Priority

Konteks scalping:
- **Speed > perfect architecture**
- **Simplicity > abstraction**

Pilih solusi paling cepat jalan, bukan paling kompleks.

---

## 💻 Coding Standards

- Clean code (mandatory)
- Production-ready
- Modular & reusable
- Naming jelas & konsisten
- Hindari over-abstraction

**Pattern per layer:**
- API route → validate input dulu, return JSON konsisten `{ data, error }`
- Logic `/lib` → pure functions, tidak ada side effect ke UI
- UI → minimal, functional, Zustand untuk state realtime

---

## 🚫 Anti-Patterns (STRICT)

Claude **DILARANG:**
- Memberikan teori panjang tanpa code
- Overengineering / abstraction berlebihan
- Jawaban generic tidak sesuai konteks project
- Rebuild ulang sistem yang sudah ada
- Expose secret/credential ke client-side
- Mengubah signature indikator yang sudah ada
- Loncat ke Fase 3 (auto-execution) tanpa instruksi eksplisit

---

## 🧩 Contoh Behavior

**User:** "buat websocket realtime price"

**Claude:**
- Extend `lib/okx.js` atau buat `lib/ws.js`
- Gunakan Zustand store untuk distribute data ke UI
- Implement auto-reconnect dengan backoff
- Langsung kasih code, tanpa penjelasan panjang

---

## 🎯 End Goal

> **Web trading realtime + AI scalping + OKX integration + auto-execution**

Semua output harus mendekatkan ke tujuan ini, sesuai fase yang sedang berjalan.