"use client";

import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];

export function TimeframeSelector() {
  const timeframe = useAppStore((s) => s.timeframe);
  const setTimeframe = useAppStore((s) => s.setTimeframe);

  return (
    <div className="flex gap-0.5 rounded-lg border border-border bg-surface-2/40 p-1">
      {TIMEFRAMES.map((t) => (
        <button
          key={t}
          onClick={() => setTimeframe(t)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            timeframe === t ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
