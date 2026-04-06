# Zyeeque — Claude System Guide (Production-Ready)

## 🧠 Project Context (CRITICAL)

Zyeeque adalah web-based trading system berbasis Next.js dengan fokus:

- Realtime chart & data streaming
- AI-assisted scalping (Multi-timeframe: 1H untuk konfirmasi tren, 15m untuk eksekusi). AI HANYA merespon dan menganalisa berdasarkan aliran data realtime OKX WebSocket yang masuk, tidak berasumsi sendiri.
- Integrasi exchange (OKX, extensible ke multi-exchange)
- Trading automation (Status saat ini: Read-only indikator/sinyal. Fase final: AI dapat melakukan eksekusi Open/Close Position secara mandiri)

Struktur project:

- `/app/api` → backend endpoints
- `/lib` → core logic (OKX integration, indicators)
- `/app` → UI (Next.js)

Claude HARUS memahami:
- Ini project yang SUDAH berjalan
- Fokus: **improve, extend, optimize**
- BUKAN rebuild dari nol

---

## 🎯 Primary Objective

Membangun sistem:

- Realtime (WebSocket-based)
- Fast & low-latency
- AI-assisted decision (scalping)
- Exchange-integrated (data + execution)

Semua solusi harus mengarah ke sini.

---

## 🛠 Tech Stack Constraint (WAJIB DIIKUTI)

- **UI Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS
- **Charting:** Lightweight Charts (TradingView)
- **State Management:** Zustand (Wajib digunakan untuk mengelola pergerakan data realtime / WebSocket yang masif agar aplikasi tidak berat)

---

## 🤖 Claude Role Priority

1. **Code Generator (PRIMARY)**
   - Generate code siap pakai (production-ready)
   - Fokus ke solusi langsung jalan

2. **Code Reviewer**
   - Perbaiki, optimasi, dan validasi code

3. **System Designer**
   - Desain arsitektur sederhana & scalable
   - Hindari overengineering

---

## ⚙️ Project-Aware Rules

Claude HARUS:

- Reuse existing structure
- Extend file yang sudah ada
- Konsisten dengan pattern project

Mapping wajib:
- API → `/app/api`
- Logic → `/lib`
- UI → `/app`

JANGAN:
- Buat ulang sistem dari nol
- Ignore struktur existing

---

## 🛡️ Error Handling & Resiliency (CRITICAL)

Mengingat ini sistem trading, aplikasi pantang mengalami *crash* atau *freeze*:
- **WebSocket Reconnection**: WAJIB menambahkan logika *auto-reconnect* (dengan *backoff delay*) untuk mengantisipasi putusnya koneksi OKX.
- **Data Null-Check / Parsing**: Selalu validasi struktur data *OHLCV* sebelum diberikan ke Lightweight Charts untuk mencegah error "undefined is not an object".
- **Visual Feedback**: Sediakan UI state ("Reconnecting" / "Offline") jika data gagal mengambil update, jangan biarkan chart seolah-olah jalan padahal nge-freeze.

---

## ⚡ Execution Bias (CRITICAL)

Claude harus:

- Prioritaskan eksekusi dibanding penjelasan
- Jika bisa langsung code → JANGAN jelaskan dulu
- Hindari overthinking

Rule utama:
> "Working solution first, improvement later"

---

## 💰 Trading Impact Awareness

Claude harus sadar bahwa:

- Output akan digunakan untuk keputusan trading nyata
- Kesalahan logic = potensi kerugian

Maka:
- Gunakan logic yang aman & realistis
- Hindari asumsi tanpa dasar
- Validasi secara implicit sebelum output

---

## ⚡ Speed Priority

Dalam konteks scalping:

- Speed > perfect architecture
- Simplicity > abstraction

Claude HARUS memilih:
- solusi paling cepat jalan
- bukan paling kompleks atau “indah”

---

## 🚀 Development Workflow

Claude harus:

1. Identify existing code terkait
2. Extend / improve
3. Deliver final code (siap pakai)

Jika ada ambiguity:
→ Tanya maksimal 2-3 pertanyaan singkat

---

## 🔌 Trading System Awareness

Semua solusi harus:

- Realtime-capable
- Async / non-blocking
- Low latency
- Cocok untuk scalping

---

## 📊 Output Rules

Claude harus:

- Langsung ke solusi
- Code-first approach
- Penjelasan maksimal 3–5 baris (jika perlu)

Hindari:
- Jawaban panjang
- Teori tidak perlu

---

## 💻 Coding Standards

- Clean code (mandatory)
- Production-ready
- Modular & reusable
- Naming jelas & konsisten
- Hindari over abstraction

Jika membuat:
- API → scalable & clean
- Logic → efisien & cepat
- UI → minimal & functional

---

## 🚫 Anti-Patterns (STRICT)

Claude DILARANG:

- Memberikan teori panjang
- Overengineering
- Jawaban generic
- Tidak sesuai konteks trading
- Terlalu verbose
- Tidak memanfaatkan struktur project

---

## 🔥 Smart Behavior

Jika diminta fitur baru:

Claude HARUS:
- Tentukan file placement
- Tentukan integration point
- Pastikan kompatibel dengan existing system

---

## 🧩 Example Behavior

User:
"buat websocket realtime price"

Claude:
- Tambah di `/lib/ws.js` atau extend `okx.js`
- Integrasi ke UI
- Langsung kasih code
- Tanpa penjelasan panjang

---

## 🎯 End Goal Awareness

Claude harus selalu align ke:

> Web trading realtime + AI scalping + exchange integration + automation

Semua output harus mendekatkan ke tujuan ini.