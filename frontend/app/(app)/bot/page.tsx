"use client";

import { Activity, Bot, Eye, LogIn, LogOut, Target } from "lucide-react";

import { BotEquityCurve } from "@/components/strategy/BotEquityCurve";
import { type BotEvent, type BotTrade, useBotEvents, useBotTrades, useCompare } from "@/lib/api";
import { fmtPrice, fmtSignedUSD, fmtUSD } from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND: Record<string, { icon: typeof Activity; color: string }> = {
  analysis: { icon: Activity, color: "text-sky-400" },
  watch: { icon: Eye, color: "text-muted" },
  signal: { icon: Target, color: "text-amber-400" },
  enter: { icon: LogIn, color: "text-positive" },
  exit: { icon: LogOut, color: "text-negative" },
};

function fmtWhen(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BotPage() {
  const { data: tr } = useBotTrades();
  const { data: ev } = useBotEvents();
  const compare = useCompare();

  const trades = tr?.trades ?? [];
  const stats = tr?.stats;
  const events = ev?.events ?? [];
  const botEquity = compare.data?.bot.equity;
  const botPnl = compare.data?.bot.pnl ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
          <Bot size={20} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-fg">The bot's track record</h2>
          <p className="text-sm text-muted">
            It runs a fixed checklist on its own practice account — this is disciplined
            rule-following, not price prediction.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Equity" value={botEquity != null ? fmtUSD(botEquity) : "—"} />
        <StatCard
          label="Total P&L"
          value={fmtSignedUSD(botPnl)}
          tone={botPnl >= 0 ? "pos" : "neg"}
        />
        <StatCard
          label="Win rate"
          value={stats ? `${(stats.win_rate * 100).toFixed(0)}%` : "—"}
          sub={stats ? `${stats.wins}/${stats.trades_n} closed` : undefined}
        />
        <StatCard
          label="Open now"
          value={stats ? String(stats.open_n) : "—"}
          sub={stats ? `${stats.trades_n + stats.open_n} total` : undefined}
        />
      </div>

      {/* Equity curve */}
      <section className="rounded-2xl border border-border bg-surface/50 p-4">
        <h3 className="mb-2 text-sm font-semibold text-fg">Equity curve</h3>
        <div className="h-56">
          <BotEquityCurve trades={trades} />
        </div>
      </section>

      {/* Trade history */}
      <section className="rounded-2xl border border-border bg-surface/50">
        <h3 className="border-b border-border px-4 py-3 text-sm font-semibold text-fg">
          Trade history
        </h3>
        {trades.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">
            No trades yet. When the bot spots a setup, it appears here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  <Th>Pair</Th>
                  <Th>Entry</Th>
                  <Th>Stop</Th>
                  <Th>Target</Th>
                  <Th>Opened</Th>
                  <Th>Result</Th>
                  <Th right>P&L</Th>
                </tr>
              </thead>
              <tbody>
                {[...trades].reverse().map((t: BotTrade) => (
                  <tr key={t.trade_id} className="border-b border-border/50 last:border-0">
                    <Td className="font-medium text-fg">{t.symbol}</Td>
                    <Td>{fmtPrice(t.entry)}</Td>
                    <Td>{fmtPrice(t.stop)}</Td>
                    <Td>{fmtPrice(t.target)}</Td>
                    <Td className="text-muted">{fmtWhen(t.opened_at)}</Td>
                    <Td>
                      {t.status === "open" ? (
                        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[11px] text-primary">
                          open
                        </span>
                      ) : (
                        <span className="text-muted">{t.exit_reason ?? "closed"}</span>
                      )}
                    </Td>
                    <Td right>
                      {t.pnl == null ? (
                        "—"
                      ) : (
                        <span className={t.pnl >= 0 ? "text-positive" : "text-negative"}>
                          {fmtSignedUSD(t.pnl)}
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Activity log */}
      <section className="rounded-2xl border border-border bg-surface/50">
        <h3 className="border-b border-border px-4 py-3 text-sm font-semibold text-fg">
          Activity log
        </h3>
        {events.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">
            The bot's notes will stream in here as it watches the market.
          </p>
        ) : (
          <div className="max-h-96 space-y-1.5 overflow-y-auto p-3">
            {events.map((n: BotEvent, i) => {
              const meta = KIND[n.kind] ?? KIND.analysis;
              const Icon = meta.icon;
              return (
                <div
                  key={`${n.ts}-${i}`}
                  className="flex gap-2.5 rounded-lg border border-border/50 bg-surface-2/30 px-3 py-2"
                >
                  <Icon size={14} className={cn("mt-0.5 shrink-0", meta.color)} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] leading-snug text-fg">
                      {n.symbol ? <span className="text-muted">{n.symbol} · </span> : null}
                      {n.text}
                    </div>
                    <div className="mt-0.5 text-[10px] tabular text-muted">{fmtWhen(n.ts)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "pos" | "neg";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface/50 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div
        className={cn(
          "mt-1 text-lg font-semibold tabular",
          tone === "pos" ? "text-positive" : tone === "neg" ? "text-negative" : "text-fg"
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={cn("px-3 py-2 font-medium", right ? "text-right" : "text-left")}>{children}</th>;
}

function Td({
  children,
  right,
  className,
}: {
  children: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <td className={cn("px-3 py-2 tabular", right ? "text-right" : "text-left", className)}>
      {children}
    </td>
  );
}
