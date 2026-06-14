"use client";

import { ArrowDown, ArrowUp, Bot, Minus, Sparkles } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { type AiSecondOpinion, fetchAiRead, useCompare, useStrategyAnalysis } from "@/lib/api";
import { fmtPrice, fmtSignedUSD, fmtUSD } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const TF_COLORS: Record<string, string> = {
  "1M": "#F5A623",
  "1d": "#7C5CFF",
  "4h": "#3FA7FF",
  "1h": "#5BC8AF",
};

export function MarketVsBotPanel() {
  const instrument = useAppStore((s) => s.instrument);
  const analysis = useStrategyAnalysis(instrument.assetClass, instrument.symbol);
  const compare = useCompare();
  const [ai, setAi] = useState<AiSecondOpinion | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  async function getAi() {
    setAiLoading(true);
    try {
      setAi(await fetchAiRead(instrument.assetClass, instrument.symbol));
    } finally {
      setAiLoading(false);
    }
  }

  const a = analysis.data;
  const sig = a?.signal;
  const pt = a?.proposed_trade;

  return (
    <div className="space-y-3 border-t border-border p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
          <Bot size={15} />
        </div>
        <h3 className="text-sm font-semibold text-fg">Market vs Bot</h3>
      </div>

      {compare.data && (
        <div className="grid grid-cols-2 gap-2">
          <CompareStat label="You" equity={compare.data.user.equity} pnl={compare.data.user.pnl} />
          <CompareStat
            label="Bot"
            equity={compare.data.bot.equity}
            pnl={compare.data.bot.pnl}
            extra={`${(compare.data.bot.win_rate * 100).toFixed(0)}% win`}
          />
        </div>
      )}

      {a?.trend && <TrendBadge trend={a.trend} />}

      {a ? (
        sig?.state === "buy" && pt ? (
          <div className="rounded-xl border border-positive/30 bg-positive/5 p-3">
            <div className="text-xs font-semibold text-positive">Bot would BUY</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
              <Box label="Entry" value={fmtPrice(pt.entry)} />
              <Box label="Stop" value={fmtPrice(pt.stop)} />
              <Box label="Target" value={fmtPrice(pt.target)} />
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">{pt.rationale}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface-2/30 p-3 text-sm text-muted">
            <span className="font-medium text-fg">Bot is standing down.</span> {sig?.reason}
          </div>
        )
      ) : (
        <div className="text-sm text-muted">
          {analysis.isError ? "Couldn't analyze (data feed)." : "Analyzing the higher timeframes…"}
        </div>
      )}

      {a && a.levels.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
          {(["1M", "1d", "4h", "1h"] as const).map((tf) => (
            <span key={tf} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: TF_COLORS[tf] }} /> {tf}
            </span>
          ))}
          <span className="ml-auto">{a.levels.length} levels</span>
        </div>
      )}

      {/* AI second opinion */}
      <div className="rounded-xl border border-border bg-surface-2/30 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <Sparkles size={13} className="text-primary" /> AI's read
          </div>
          <Button size="sm" variant="secondary" className="h-7" disabled={aiLoading} onClick={getAi}>
            {aiLoading ? "Thinking…" : "Get AI's read"}
          </Button>
        </div>
        {ai &&
          (ai.available === false ? (
            <div className="mt-2 text-xs text-muted">
              {ai.market_read ?? "Add an AI key in Settings to enable the AI's read."}
            </div>
          ) : (
            <div className="mt-2 space-y-1.5">
              {ai.agrees_with_bot != null && (
                <span
                  className={cn(
                    "inline-block rounded-md px-2 py-0.5 text-[11px] font-medium",
                    ai.agrees_with_bot
                      ? "bg-positive/15 text-positive"
                      : "bg-amber-400/15 text-amber-300"
                  )}
                >
                  {ai.agrees_with_bot ? "AI agrees with the bot" : "AI would wait"}
                </span>
              )}
              <p className="text-[13px] leading-relaxed text-muted">{ai.market_read}</p>
            </div>
          ))}
      </div>

      <p className="text-[11px] leading-relaxed text-muted">
        The bot applies a fixed checklist consistently — it isn't predicting price.
      </p>
    </div>
  );
}

function TrendBadge({ trend }: { trend: { direction: string; confidence: number; reasons: string[] } }) {
  const up = trend.direction === "up";
  const down = trend.direction === "down";
  const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
        up ? "bg-positive/10 text-positive" : down ? "bg-negative/10 text-negative" : "bg-surface-2/40 text-muted"
      )}
    >
      <Icon size={15} />
      <span className="font-medium capitalize">{trend.direction}</span>
      <span className="text-xs opacity-80">{(trend.confidence * 100).toFixed(0)}%</span>
      {trend.reasons[0] && (
        <span className="ml-auto truncate text-[11px] opacity-70">{trend.reasons[0]}</span>
      )}
    </div>
  );
}

function CompareStat({
  label,
  equity,
  pnl,
  extra,
}: {
  label: string;
  equity: number;
  pnl: number;
  extra?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/30 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="text-sm font-semibold tabular text-fg">{fmtUSD(equity)}</div>
      <div className={cn("text-[11px] tabular", pnl >= 0 ? "text-positive" : "text-negative")}>
        {fmtSignedUSD(pnl)}
        {extra ? ` · ${extra}` : ""}
      </div>
    </div>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2/50 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="tabular text-fg">{value}</div>
    </div>
  );
}
