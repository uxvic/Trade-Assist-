"use client";

import { CandlestickChart, Sparkles } from "lucide-react";

import { type ChartView, useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const VIEWS: { id: ChartView; label: string; icon: typeof CandlestickChart }[] = [
  { id: "trade", label: "Trade", icon: CandlestickChart },
  { id: "forecast", label: "Forecast", icon: Sparkles },
];

/** Swap the hero between the live trading chart and the honest AI forecast lens. */
export function ChartViewToggle() {
  const view = useAppStore((s) => s.chartView);
  const setView = useAppStore((s) => s.setChartView);

  return (
    <div className="flex gap-0.5 rounded-lg border border-border bg-surface-2/40 p-1">
      {VIEWS.map(({ id, label, icon: Icon }) => {
        const active = view === id;
        return (
          <button
            key={id}
            onClick={() => setView(id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              active ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"
            )}
          >
            <Icon size={13} className={active && id === "forecast" ? "text-accent" : undefined} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
