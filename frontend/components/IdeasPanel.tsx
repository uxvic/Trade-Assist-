"use client";

import { ArrowDown, ArrowUp, Bot, LineChart, Loader2, Minus, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { RefObject } from "react";
import { useState } from "react";
import { toast } from "sonner";

import type { ChartHandle } from "@/components/chart/KLineChart";
import { Button } from "@/components/ui/button";
import { type Forecast, fetchForecast, useAccount, useStrategyAnalysis } from "@/lib/api";
import { fmtPrice } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * The right-rail "ideas hub": three tabs — Coach idea · Bot plan · Forecast —
 * each showing that brain's current idea with two actions: "Plot on chart"
 * (draw it) and "Place order" (pre-fill the ticket; you still confirm).
 */
export function IdeasPanel({ chartRef }: { chartRef: RefObject<ChartHandle> }) {
  const tab = useAppStore((s) => s.ideaTab);
  const setTab = useAppStore((s) => s.setIdeaTab);

  return (
    <div className="rounded-xl border border-border bg-surface-2/30 p-2">
      <div className="flex gap-0.5 rounded-lg border border-border bg-surface-2/40 p-1">
        <TabButton active={tab === "coach"} onClick={() => setTab("coach")} icon={Sparkles} label="Coach idea" />
        <TabButton active={tab === "bot"} onClick={() => setTab("bot")} icon={Bot} label="Bot plan" />
        <TabButton active={tab === "forecast"} onClick={() => setTab("forecast")} icon={LineChart} label="Forecast" />
      </div>
      <div className="mt-2 px-1 pb-0.5">
        {tab === "coach" && <CoachTab chartRef={chartRef} />}
        {tab === "bot" && <BotTab />}
        {tab === "forecast" && <ForecastTab />}
      </div>
    </div>
  );
}

// --- Coach tab --------------------------------------------------------------
function CoachTab({ chartRef }: { chartRef: RefObject<ChartHandle> }) {
  const instrument = useAppStore((s) => s.instrument);
  const idea = useAppStore((s) => s.coachIdea);
  const setSuggested = useAppStore((s) => s.setSuggestedTrade);
  const setCoachIdea = useAppStore((s) => s.setCoachIdea);

  if (!idea || (idea.symbol ?? instrument.symbol) !== instrument.symbol) {
    return (
      <Empty>
        No coach idea yet. Press <Kbd>/</Kbd> or double-click the chart to ask the coach — when it
        drafts a trade, it lands here.
      </Empty>
    );
  }

  const buy = (idea.side ?? "buy") === "buy";
  const hasLevels = idea.entry != null || idea.stop != null || idea.target != null;

  return (
    <div className="space-y-2">
      <Header label="Coach's idea" side={idea.side} onClear={() => setCoachIdea(null)} />
      {idea.rationale && <p className="text-[12px] leading-relaxed text-muted">{idea.rationale}</p>}
      <Levels entry={idea.entry} stop={idea.stop} target={idea.target} />
      {idea.risk && <p className="text-[11px] leading-relaxed text-amber-300/90">Risk: {idea.risk}</p>}
      <div className="grid grid-cols-2 gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          disabled={!hasLevels}
          onClick={() => {
            chartRef.current?.drawCoachLevels({ entry: idea.entry, stop: idea.stop, target: idea.target });
            toast.success("Plotted the coach's idea on the chart.");
          }}
        >
          Plot on chart
        </Button>
        <Button
          size="sm"
          variant={buy ? "positive" : "destructive"}
          onClick={() => {
            setSuggested(idea);
            toast.success("Sent to your ticket", { description: "Review and confirm on the right." });
          }}
        >
          Place order
        </Button>
      </div>
    </div>
  );
}

// --- Bot tab ----------------------------------------------------------------
function BotTab() {
  const instrument = useAppStore((s) => s.instrument);
  const showBotPlan = useAppStore((s) => s.showBotPlan);
  const toggleBotPlan = useAppStore((s) => s.toggleBotPlan);
  const setSuggested = useAppStore((s) => s.setSuggestedTrade);
  const { data: a } = useStrategyAnalysis(instrument.assetClass, instrument.symbol);
  const account = useAccount();

  if (!a || a.symbol !== instrument.symbol) return <Empty>Reading the higher timeframes…</Empty>;

  const pt = a.proposed_trade;
  const isBuy = a.signal.state === "buy" && pt;

  function plot() {
    if (!showBotPlan) toggleBotPlan();
    toast.success("Bot plan shown on the chart.");
  }
  function place() {
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
    toast.success("Sent to your ticket", { description: "Review the size and confirm." });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-fg">Bot plan</span>
        <TrendPill dir={a.trend.direction} conf={a.trend.confidence} />
      </div>
      {isBuy ? (
        <>
          <p className="text-[12px] leading-relaxed text-muted">{pt!.rationale}</p>
          <Levels entry={pt!.entry} stop={pt!.stop} target={pt!.target} rr={pt!.rr} />
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" variant="secondary" onClick={plot}>
              Plot on chart
            </Button>
            <Button size="sm" variant="positive" onClick={place}>
              Place order
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[12px] leading-relaxed text-muted">
            <span className="font-medium text-fg">Standing down.</span> {a.signal.reason}
          </p>
          <Button size="sm" variant="secondary" className="w-full" onClick={plot}>
            Show the bot&apos;s levels on the chart
          </Button>
        </>
      )}
    </div>
  );
}

// --- Forecast tab -----------------------------------------------------------
function ForecastTab() {
  const instrument = useAppStore((s) => s.instrument);
  const timeframe = useAppStore((s) => s.timeframe);
  const setChartView = useAppStore((s) => s.setChartView);
  const setSuggested = useAppStore((s) => s.setSuggestedTrade);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Forecast | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchForecast(instrument.assetClass, instrument.symbol, timeframe));
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Forecast unavailable.");
    } finally {
      setLoading(false);
    }
  }

  const f = data && data.symbol === instrument.symbol ? data : null;

  if (!f) {
    return (
      <div className="space-y-2">
        <p className="text-[12px] leading-relaxed text-muted">
          An honest model projection with a live accuracy scorecard — a learning lens, not a signal.
        </p>
        <Button size="sm" variant="secondary" className="w-full" disabled={loading} onClick={run}>
          {loading ? (
            <>
              <Loader2 size={13} className="animate-spin" /> Crunching…
            </>
          ) : (
            "Run forecast"
          )}
        </Button>
        {error && <p className="text-[11px] leading-relaxed text-muted">{error}</p>}
      </div>
    );
  }

  const end = f.point.at(-1)?.value ?? f.made_price;
  const up = end > f.made_price;
  const acc = f.scorecard.directional_acc;

  function place() {
    setSuggested({
      symbol: instrument.symbol,
      asset_class: instrument.assetClass,
      side: up ? "buy" : "sell",
      rationale: `Following the direction of the model's projection (${up ? "up" : "down"} to ~${fmtPrice(end)}).`,
      risk: `From a projection that's been right ${acc ?? "—"}% of the time — not a signal. You choose the size.`,
    });
    toast.success("Sent to your ticket", { description: "Remember: a projection, not a signal." });
  }

  return (
    <div className="space-y-2">
      {acc !== null && (
        <p className="text-sm font-semibold leading-snug text-fg">
          Right on direction {acc}% · beat a naive guess {f.scorecard.beat_naive_pct}%
          <span className="font-normal text-muted"> over {f.scorecard.n}</span>
        </p>
      )}
      <p className="text-xs leading-relaxed text-muted">{f.scorecard.verdict}</p>
      <p className="text-[12px] text-fg">
        Projects {up ? "up ↑" : "down ↓"} to ~{fmtPrice(end)} over {f.horizon} candles.
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        <Button size="sm" variant="secondary" onClick={() => setChartView("forecast")}>
          Show on chart
        </Button>
        <Button size="sm" variant="secondary" onClick={place}>
          Place order
        </Button>
      </div>
      <p className="text-[11px] leading-relaxed text-muted">
        A model&apos;s projection, not a prediction to trade — let the scorecard, not the line, set
        how much you trust it.
      </p>
    </div>
  );
}

// --- shared bits ------------------------------------------------------------
function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
        active ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"
      )}
    >
      <Icon size={13} className={active ? "text-accent" : undefined} />
      {label}
    </button>
  );
}

function Header({ label, side, onClear }: { label: string; side?: string; onClear: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold text-fg">
        {label}
        {side && (
          <span
            className={cn(
              "ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
              side === "sell" ? "bg-negative/15 text-negative" : "bg-positive/15 text-positive"
            )}
          >
            {side}
          </span>
        )}
      </span>
      <button onClick={onClear} className="text-[11px] text-muted hover:text-fg">
        Clear
      </button>
    </div>
  );
}

function Levels({
  entry,
  stop,
  target,
  rr,
}: {
  entry?: number;
  stop?: number;
  target?: number;
  rr?: number;
}) {
  if (entry == null && stop == null && target == null) return null;
  return (
    <div className="grid grid-cols-3 gap-1.5 text-center text-[11px]">
      <Cell label="Entry" value={entry != null ? fmtPrice(entry) : "—"} />
      <Cell label="Stop" value={stop != null ? fmtPrice(stop) : "—"} />
      <Cell label={rr ? `Target 1:${Math.round(rr)}` : "Target"} value={target != null ? fmtPrice(target) : "—"} />
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2/50 py-1">
      <div className="text-[9px] uppercase tracking-wide text-muted">{label}</div>
      <div className="tabular text-fg">{value}</div>
    </div>
  );
}

function TrendPill({ dir, conf }: { dir: string; conf: number }) {
  const up = dir === "up";
  const down = dir === "down";
  const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium capitalize",
        up ? "bg-positive/15 text-positive" : down ? "bg-negative/15 text-negative" : "bg-surface-2/60 text-muted"
      )}
    >
      <Icon size={11} />
      {dir} {(conf * 100).toFixed(0)}%
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-0.5 py-1 text-[12px] leading-relaxed text-muted">{children}</p>;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded bg-surface-2 px-1 text-[11px]">{children}</kbd>;
}
