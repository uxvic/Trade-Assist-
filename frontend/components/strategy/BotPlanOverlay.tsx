"use client";

import { Bot, Info } from "lucide-react";

import { useBotFeed, useStrategyAnalysis } from "@/lib/api";
import { fmtPrice } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * The bot's plan + commentary, pinned right on the trade chart. Short by
 * default ("what it's doing"); hovering expands to the full reasoning —
 * rationale, the entry checklist, and the bot's most recent reads — so the
 * chart shows the bot's thinking without leaving for the console below.
 * Gated by the same "Bot plan" toggle (`showBotPlan`) that draws the tags.
 */
export function BotPlanOverlay() {
  const instrument = useAppStore((s) => s.instrument);
  const show = useAppStore((s) => s.showBotPlan);
  const { data: a } = useStrategyAnalysis(instrument.assetClass, instrument.symbol);
  const { data: feed } = useBotFeed(instrument.assetClass, instrument.symbol);

  if (!show || !a || a.symbol !== instrument.symbol) return null;

  const pt = a.proposed_trade;
  const buy = a.signal.state === "buy" && !!pt;
  const short = buy
    ? `BUY setup · entry ${fmtPrice(pt!.entry)} · stop ${fmtPrice(pt!.stop)} · target ${fmtPrice(pt!.target)} (1:${Math.round(pt!.rr)})`
    : `Standing down — ${a.signal.reason}`;

  const dir = a.trend.direction;
  const reasons = a.trend.reasons ?? [];
  const checks = Object.entries(a.signal.confirmations ?? {});
  const notes = (feed?.notes ?? []).slice(0, 4);

  return (
    <div className="group absolute bottom-3 left-3 z-20 w-[min(380px,72%)]">
      <div
        className={cn(
          "rounded-xl border bg-surface/90 p-3 shadow-lg backdrop-blur transition-colors",
          buy ? "border-positive/45" : "border-border"
        )}
      >
        {/* Header: identity + trend at a glance */}
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/20 text-amber-400">
            <Bot size={14} />
          </div>
          <span className="text-xs font-semibold text-fg">Bot&apos;s plan</span>
          <span
            className={cn(
              "ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium capitalize",
              dir === "up"
                ? "bg-positive/15 text-positive"
                : dir === "down"
                  ? "bg-negative/15 text-negative"
                  : "bg-surface-2/60 text-muted"
            )}
          >
            {dir} {(a.trend.confidence * 100).toFixed(0)}%
          </span>
        </div>

        {/* Short commentary — always visible */}
        <p className={cn("mt-1.5 text-[13px] leading-snug", buy ? "text-fg" : "text-muted")}>
          {short}
        </p>

        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted group-hover:hidden">
          <Info size={11} /> Hover to read the bot&apos;s full reasoning
        </p>

        {/* Full commentary — revealed on hover */}
        <div className="mt-2 hidden max-h-[42vh] overflow-y-auto group-hover:block">
          {pt?.rationale && (
            <p className="text-[12px] leading-relaxed text-muted">{pt.rationale}</p>
          )}

          {reasons.length > 0 && (
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-wide text-muted">Why</div>
              <ul className="mt-0.5 list-inside list-disc text-[12px] text-muted">
                {reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {checks.length > 0 && (
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-wide text-muted">Checklist</div>
              <ul className="mt-0.5 space-y-0.5 text-[12px]">
                {checks.map(([k, ok]) => (
                  <li key={k} className="flex items-center gap-1.5">
                    <span className={ok ? "text-positive" : "text-negative"}>{ok ? "✓" : "✗"}</span>
                    <span className="text-muted">{k.replace(/_/g, " ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {notes.length > 0 && (
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-wide text-muted">Recent reads</div>
              <ul className="mt-0.5 space-y-0.5 text-[12px] text-muted">
                {notes.map((n, i) => (
                  <li key={i}>{n.text}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
