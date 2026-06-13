"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Account = {
  cash: string;
  equity: string;
  currency: string;
};

export default function Home() {
  const [health, setHealth] = useState<string>("checking…");
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    fetch(`${API}/health`)
      .then((r) => r.json())
      .then((d) => setHealth(`${d.status} · v${d.version}`))
      .catch(() => setHealth("backend unreachable"));

    fetch(`${API}/api/paper/account`)
      .then((r) => r.json())
      .then(setAccount)
      .catch(() => setAccount(null));
  }, []);

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "48px 24px" }}>
      <div
        style={{
          background: "var(--warn)",
          color: "#000",
          padding: "8px 14px",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 28,
        }}
      >
        Educational use only · Not financial advice · Paper trading only
      </div>

      <h1 style={{ fontSize: 34, margin: "0 0 8px" }}>Trade-Assist</h1>
      <p style={{ color: "var(--muted)", marginTop: 0, fontSize: 17 }}>
        Your AI trading tutor. Learn by doing — with a live coach, real market data, and a
        risk-first simulated account.
      </p>

      <section style={panel}>
        <h2 style={h2}>System</h2>
        <Row label="Backend" value={health} />
        <Row label="Paper cash" value={account ? `${account.cash} ${account.currency}` : "—"} />
        <Row label="Equity" value={account ? account.equity : "—"} />
      </section>

      <section style={panel}>
        <h2 style={h2}>Coming next (Phase 1)</h2>
        <ul style={{ color: "var(--muted)", lineHeight: 1.8, marginTop: 8 }}>
          <li>Live candlestick chart (TradingView Lightweight Charts) over WebSocket</li>
          <li>Order ticket wired to the paper engine</li>
          <li>Streaming coach chat (the agent explains and guides as you trade)</li>
          <li>Starter curriculum: markets, order types, and risk management</li>
        </ul>
      </section>
    </main>
  );
}

const panel: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 20,
  marginTop: 20,
};

const h2: React.CSSProperties = { fontSize: 14, textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)", margin: "0 0 12px" };

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}
