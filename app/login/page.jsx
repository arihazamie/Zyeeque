"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const from         = searchParams.get("from") || "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [showPass, setShowPass] = useState(false);

  // Apply dark theme on login page
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username || !password) { setError("Username dan password wajib diisi."); return; }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok) { setError(data.error || "Login gagal."); return; }
      router.push(from);
      router.refresh();
    } catch {
      setError("Koneksi gagal. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg-deep)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      {/* Background grid decoration */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0,
        backgroundImage: "linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
        pointerEvents: "none",
      }} />

      {/* Glow */}
      <div style={{
        position: "fixed", top: "20%", left: "50%", transform: "translateX(-50%)",
        width: 400, height: 400, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 0,
      }} />

      {/* Card */}
      <div style={{
        position: "relative", zIndex: 1,
        width: "100%", maxWidth: 380,
        background: "var(--bg-panel)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 14,
        padding: "36px 32px",
        boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "linear-gradient(135deg,#3b82f6,#06b6d4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <svg width="14" height="14" viewBox="0 0 10 10" fill="none">
              <path d="M1 5h8M5 1v8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Zyeeque</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>Trading Terminal</div>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Masuk ke akun</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Masukkan kredensial untuk melanjutkan.</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Username */}
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="username"
              style={{
                width: "100%", padding: "10px 12px",
                background: "var(--bg-surface)",
                border: "1px solid var(--border-mid)",
                borderRadius: 8,
                fontSize: 13, color: "var(--text-primary)",
                outline: "none",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            />
          </div>

          {/* Password */}
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
              Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                style={{
                  width: "100%", padding: "10px 38px 10px 12px",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-mid)",
                  borderRadius: 8,
                  fontSize: 13, color: "var(--text-primary)",
                  outline: "none",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                style={{
                  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--text-muted)", padding: 2,
                  display: "flex", alignItems: "center",
                }}
              >
                {showPass ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: "9px 12px",
              background: "rgba(220,38,38,0.08)",
              border: "1px solid rgba(220,38,38,0.2)",
              borderRadius: 7,
              fontSize: 12, color: "#ef4444",
              display: "flex", alignItems: "center", gap: 7,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              padding: "11px 0",
              background: loading ? "rgba(59,130,246,0.5)" : "linear-gradient(135deg,#3b82f6,#06b6d4)",
              border: "none",
              borderRadius: 8,
              fontSize: 13, fontWeight: 600, color: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "opacity .15s",
            }}
          >
            {loading && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 0.8s linear infinite" }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
            )}
            {loading ? "Memverifikasi..." : "Masuk"}
          </button>
        </form>

        <p style={{ marginTop: 20, fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
          Akses terbatas · Zyeeque Trading Terminal
        </p>
      </div>
    </div>
  );
}
