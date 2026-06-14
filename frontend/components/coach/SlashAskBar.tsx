"use client";

import type { RefObject } from "react";
import { useEffect, useState } from "react";

import type { ChartHandle } from "@/components/chart/KLineChart";
import { Input } from "@/components/ui/input";
import { streamChat } from "@/lib/api";
import { fmtPrice } from "@/lib/format";
import { useAppStore } from "@/lib/store";

import { CoachOutput } from "./CoachOutput";
import type { PointContext } from "./ChartCoachPopover";
import { useCoachStream } from "./useCoachStream";

export function SlashAskBar({
  chartRef,
  ctx,
}: {
  chartRef: RefObject<ChartHandle>;
  ctx: Omit<PointContext, "time" | "price">;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const stream = useCoachStream();
  const intensity = useAppStore((s) => s.coachIntensity);
  const setSuggested = useAppStore((s) => s.setSuggestedTrade);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA";
      if (e.key === "/" && !typing) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;

  function ask(q: string) {
    const query = q.trim();
    if (!query || stream.busy) return;
    const cross = chartRef.current?.getCrosshair?.() ?? { time: null, price: null };
    const where = cross.price ? ` near ${fmtPrice(cross.price)}` : "";
    stream.run(
      streamChat(`On the ${ctx.timeframe} ${ctx.name} (${ctx.symbol}) chart${where}: ${query}`, [], intensity),
      (p) =>
        setSuggested({
          ...p,
          symbol: p.symbol ?? ctx.symbol,
          asset_class: p.asset_class ?? ctx.assetClass,
        })
    );
  }

  return (
    <div className="absolute left-1/2 top-3 z-30 w-[440px] max-w-[92%] -translate-x-1/2 rounded-xl border border-border bg-surface/95 p-2 shadow-soft backdrop-blur">
      <Input
        autoFocus
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") ask(input);
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Ask the coach about the chart…  (Esc to close)"
        className="h-9"
      />
      {stream.noKey && (
        <div className="mt-2 px-1 text-xs text-muted">Add an AI key in Settings to use the coach.</div>
      )}
      {stream.output && (
        <div className="mt-2 max-h-52 overflow-y-auto">
          <CoachOutput text={stream.output} />
        </div>
      )}
    </div>
  );
}
