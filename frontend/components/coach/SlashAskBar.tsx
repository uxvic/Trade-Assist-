"use client";

import { X } from "lucide-react";
import type { RefObject } from "react";
import { useEffect, useState } from "react";

import type { ChartHandle } from "@/components/chart/KLineChart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { streamChat } from "@/lib/api";
import { fmtPrice } from "@/lib/format";
import { useAppStore } from "@/lib/store";

import { CoachOutput, ToolLine } from "./CoachOutput";
import type { PointContext } from "./ChartCoachPopover";
import { useCoachStream } from "./useCoachStream";

const QUICK = ["What's happening?", "Is this a good entry?", "Where's the risk?", "Explain this chart"];

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
    <div className="absolute left-1/2 top-3 z-30 w-[460px] max-w-[92%] -translate-x-1/2 rounded-xl border border-border bg-surface/95 p-2.5 shadow-soft backdrop-blur">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-xs text-muted">Ask the coach about this chart</span>
        <button onClick={() => setOpen(false)} className="text-muted hover:text-fg">
          <X size={14} />
        </button>
      </div>

      {/* Quick asks — one tap */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button
            key={q}
            onClick={() => ask(q)}
            disabled={stream.busy}
            className="rounded-lg border border-border bg-surface-2/40 px-2 py-1 text-[11px] text-fg transition-colors hover:border-primary/40 disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Type + a real Send button (Enter also works) */}
      <div className="mt-2 flex gap-1.5">
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
        <Button
          size="sm"
          className="h-9 shrink-0"
          disabled={stream.busy || !input.trim()}
          onClick={() => ask(input)}
        >
          {stream.busy ? "…" : "Ask"}
        </Button>
      </div>

      {stream.busy && <div className="mt-2 px-1 text-xs text-muted">Coach is thinking…</div>}
      {stream.noKey && (
        <div className="mt-2 px-1 text-xs text-muted">
          Add an AI key in{" "}
          <a href="/settings" className="text-primary underline">
            Settings
          </a>{" "}
          to use the coach.
        </div>
      )}
      <ToolLine tools={stream.tools} />
      {stream.output && (
        <div className="mt-2 max-h-60 overflow-y-auto px-1">
          <CoachOutput text={stream.output} />
        </div>
      )}
    </div>
  );
}
