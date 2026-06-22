"use client";

import { Info } from "lucide-react";
import { useState } from "react";

import { useStrategyAnalysis } from "@/lib/api";
import { useAppStore } from "@/lib/store";

/**
 * The key for the bot's chart lines — what each colour means in plain language.
 * Shown on the chart while "Bot plan" is on, so the green / purple / yellow
 * lines aren't a mystery. Colours mirror TF_COLORS / COACH_COLORS in KLineChart.
 */
const TF_KEY = [
  { label: "Monthly", color: "#F5A623", meaning: "Strongest, longest-term ceilings & floors" },
  { label: "Daily", color: "#7C5CFF", meaning: "Key levels price reacts to day-to-day" },
  { label: "4-hour", color: "#3FA7FF", meaning: "Medium-term levels" },
  { label: "1-hour", color: "#5BC8AF", meaning: "Short-term levels" },
];

const TRADE_KEY = [
  { label: "Entry", color: "#7C5CFF", meaning: "Where the bot would buy" },
  { label: "Stop", color: "#EA3943", meaning: "Where it cuts the loss if it's wrong" },
  { label: "Target", color: "#16C784", meaning: "Where it would take profit (1:3)" },
];

export function LevelLegend() {
  const instrument = useAppStore((s) => s.instrument);
  const { data: a } = useStrategyAnalysis(instrument.assetClass, instrument.symbol);
  const [open, setOpen] = useState(true);

  const hasSetup =
    !!a && a.symbol === instrument.symbol && a.signal.state === "buy" && !!a.proposed_trade;

  return (
    <div className="absolute left-2 top-11 z-[15] w-max max-w-[244px]">
      <div className="rounded-xl border border-border bg-surface/90 shadow-lg backdrop-blur">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-fg"
        >
          <Info size={12} className="text-amber-400" />
          What the lines mean
          <span className="ml-auto text-base leading-none text-muted">{open ? "–" : "+"}</span>
        </button>

        {open && (
          <div className="space-y-1.5 px-2.5 pb-2.5">
            {TF_KEY.map((r) => (
              <Row key={r.label} {...r} />
            ))}

            {hasSetup && (
              <>
                <div className="my-1 border-t border-border" />
                {TRADE_KEY.map((r) => (
                  <Row key={r.label} {...r} />
                ))}
              </>
            )}

            <p className="pt-0.5 text-[10px] leading-snug text-muted">
              Thicker line = stronger level (higher timeframe or more touches).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ color, label, meaning }: { color: string; label: string; meaning: string }) {
  return (
    <div className="flex items-start gap-2" title={meaning}>
      <span
        className="mt-[5px] h-[3px] w-4 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <div className="min-w-0">
        <div className="text-[11px] font-medium text-fg">{label}</div>
        <div className="text-[10px] leading-snug text-muted">{meaning}</div>
      </div>
    </div>
  );
}
