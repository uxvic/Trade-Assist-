"use client";

import { ArrowDown, ArrowUp, Bot, Minus, Sparkles, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { type ChartHandle, KLineChart, topLevels } from "@/components/chart/KLineChart";
import { Button } from "@/components/ui/button";
import {
  type BotNote,
  fetchBotCommentary,
  useAccount,
  useBotFeed,
  useCompare,
} from "@/lib/api";
import { fmtPrice, fmtSignedUSD, fmtUSD } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

import { BotFeed } from "./BotFeed";

export function BotConsole() {
  const instrument = useAppStore((s) => s.instrument);
  const setSuggested = useAppStore((s) => s.setSuggestedTrade);
  const feed = useBotFeed(instrument.assetClass, instrument.symbol);
  const compare = useCompare();
  const account = useAccount();
  const chartRef = useRef<ChartHandle>(null);
  const [aiNotes, setAiNotes] = useState<BotNote[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  const call = feed.data?.call ?? null;

  // Copy the bot's setup into the user's order ticket (sized to risk ~1%).
  function tradeThis() {
    const pt = call?.proposed_trade;
    if (!pt) return;
    const equity = account.data ? Number(account.data.equity) : 0;
    const qty = pt.risk_per_unit > 0 ? (equity * 0.01) / pt.risk_per_unit : 0;
    const notional = qty > 0 ? Math.max(10, Math.round(qty * pt.entry)) : undefined;
    setSuggested({
      symbol: instrument.symbol,
      asset_class: instrument.assetClass,
      side: "buy",
      notional,
      entry: pt.entry,
      stop: pt.stop,
      target: pt.target,
      rationale: pt.rationale,
      risk: "Sized to risk ~1% of your account — review before you confirm.",
    });
    toast.success("Filled in your order form below", {
      description: "Review the size and place it when you're ready.",
    });
  }

  // Draw the bot's strongest levels + its proposed trade on the mini "bot's-eye" chart.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (call && feed.data?.symbol === instrument.symbol) {
      chart.drawLevels(topLevels(call.levels, call.current_price, 6));
      chart.drawProposedTrade(call.signal.state === "buy" ? call.proposed_trade : null);
    } else {
      chart.clearStrategy();
    }
  }, [call, feed.data?.symbol, instrument.symbol]);

  // Drop injected AI notes when switching instruments.
  useEffect(() => setAiNotes([]), [instrument.symbol]);

  // Merge the bot's deterministic notes with any on-demand AI commentary, newest first.
  const notes = useMemo(() => {
    const server = feed.data?.notes ?? [];
    return [...aiNotes, ...server].sort((a, b) => b.ts - a.ts);
  }, [feed.data?.notes, aiNotes]);

  async function getCommentary() {
    setAiLoading(true);
    try {
      const res = await fetchBotCommentary(instrument.assetClass, instrument.symbol);
      const text =
        res.commentary ?? "Add an AI key in Settings to hear the bot's colour commentary.";
      setAiNotes((prev) => [{ ts: Math.floor(Date.now() / 1000), kind: "ai", text }, ...prev]);
    } finally {
      setAiLoading(false);
    }
  }

  const trend = call?.trend;
  const pt = call?.proposed_trade;
  const isBuy = call?.signal.state === "buy" && pt;

  return (
    <div className="flex h-full flex-col">
      {/* Header: identity + the bot's current call + you-vs-bot */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <div className="flex shrink-0 items-center gap-2">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
            <Bot size={17} />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse-soft rounded-full bg-positive" />
          </div>
          <div>
            <div className="text-sm font-semibold text-fg">Trading bot · live</div>
            <div className="text-[11px] text-muted">Re-reading {instrument.ticker}…</div>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {call ? (
            isBuy ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="rounded-md bg-positive/15 px-2 py-0.5 text-xs font-semibold text-positive">
                  BUY setup
                </span>
                <span className="hidden truncate tabular text-muted md:inline">
                  entry <span className="text-fg">{fmtPrice(pt!.entry)}</span> · stop{" "}
                  <span className="text-fg">{fmtPrice(pt!.stop)}</span> · target{" "}
                  <span className="text-fg">{fmtPrice(pt!.target)}</span>
                </span>
                <Button
                  size="sm"
                  variant="positive"
                  className="ml-auto h-7 shrink-0"
                  onClick={tradeThis}
                >
                  <Zap size={13} /> Trade this
                </Button>
              </div>
            ) : (
              <div className="truncate text-sm text-muted">
                <span className="font-medium text-fg">Standing down.</span> {call.signal.reason}
              </div>
            )
          ) : (
            <div className="text-sm text-muted">
              {feed.isError ? "Couldn't reach the data feed." : "Analyzing the higher timeframes…"}
            </div>
          )}
        </div>

        {trend && <TrendChip dir={trend.direction} conf={trend.confidence} />}

        {compare.data && (
          <div className="hidden shrink-0 items-center gap-3 border-l border-border pl-3 lg:flex">
            <Stat label="You" value={fmtUSD(compare.data.user.equity)} pnl={compare.data.user.pnl} />
            <Stat
              label="Bot"
              value={fmtUSD(compare.data.bot.equity)}
              pnl={compare.data.bot.pnl}
              extra={`${(compare.data.bot.win_rate * 100).toFixed(0)}% win`}
            />
          </div>
        )}
      </div>

      {/* Body: live feed (left) + mini bot's-eye chart (right) */}
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_minmax(280px,38%)]">
        <div className="flex min-h-0 flex-col border-b border-border md:border-b-0 md:border-r">
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Live activity
            </span>
            <Button
              size="sm"
              variant="secondary"
              className="h-7"
              disabled={aiLoading}
              onClick={getCommentary}
            >
              <Sparkles size={13} className="text-primary" />
              {aiLoading ? "Thinking…" : "AI commentary"}
            </Button>
          </div>
          <div className="min-h-0 flex-1 px-4 pb-3">
            <BotFeed notes={notes} />
          </div>
        </div>

        <div className="relative min-h-0">
          <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-md bg-surface/80 px-2 py-0.5 text-[10px] font-medium text-muted backdrop-blur">
            Bot's-eye view · 30m
          </div>
          <KLineChart
            ref={chartRef}
            assetClass={instrument.assetClass}
            symbol={instrument.symbol}
            timeframe="30m"
            minimal
          />
        </div>
      </div>

      <p className="border-t border-border px-4 py-1.5 text-[11px] text-muted">
        The bot applies a fixed checklist consistently — it isn't predicting price.
      </p>
    </div>
  );
}

function TrendChip({ dir, conf }: { dir: string; conf: number }) {
  const up = dir === "up";
  const down = dir === "down";
  const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
        up
          ? "bg-positive/10 text-positive"
          : down
            ? "bg-negative/10 text-negative"
            : "bg-surface-2/50 text-muted"
      )}
    >
      <Icon size={13} />
      <span className="capitalize">{dir}</span>
      <span className="opacity-70">{(conf * 100).toFixed(0)}%</span>
    </div>
  );
}

function Stat({
  label,
  value,
  pnl,
  extra,
}: {
  label: string;
  value: string;
  pnl: number;
  extra?: string;
}) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="text-xs font-semibold tabular text-fg">{value}</div>
      <div className={cn("text-[10px] tabular", pnl >= 0 ? "text-positive" : "text-negative")}>
        {fmtSignedUSD(pnl)}
        {extra ? ` · ${extra}` : ""}
      </div>
    </div>
  );
}
