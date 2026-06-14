"use client";

import { X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { streamChat } from "@/lib/api";
import { fmtPrice } from "@/lib/format";
import { useAppStore } from "@/lib/store";

import { CoachOutput, ToolLine } from "./CoachOutput";
import { useCoachStream } from "./useCoachStream";

export interface PointContext {
  symbol: string;
  assetClass: string;
  name: string;
  timeframe: string;
  time: number | null;
  price: number | null;
}

const QUICK = ["What's happening here?", "Is this a good entry?", "Where's the risk?"];

export function ChartCoachPopover({
  anchor,
  ctx,
  onClose,
}: {
  anchor: { x: number; y: number };
  ctx: PointContext;
  onClose: () => void;
}) {
  const stream = useCoachStream();
  const intensity = useAppStore((s) => s.coachIntensity);
  const setSuggested = useAppStore((s) => s.setSuggestedTrade);
  const [input, setInput] = useState("");

  function ask(q: string) {
    const query = q.trim();
    if (!query || stream.busy) return;
    const when = ctx.time ? new Date(ctx.time).toLocaleString() : "this point";
    const where = ctx.price ? ` (price was around ${fmtPrice(ctx.price)})` : "";
    stream.run(
      streamChat(
        `On the ${ctx.timeframe} ${ctx.name} (${ctx.symbol}) chart, looking at ${when}${where}: ${query}`,
        [],
        intensity
      ),
      (p) =>
        setSuggested({
          ...p,
          symbol: p.symbol ?? ctx.symbol,
          asset_class: p.asset_class ?? ctx.assetClass,
        })
    );
  }

  const left = Math.max(8, Math.min(anchor.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 360));
  const top = Math.max(8, Math.min(anchor.y, (typeof window !== "undefined" ? window.innerHeight : 800) - 340));

  return (
    <div
      className="fixed z-40 w-[340px] rounded-xl border border-border bg-surface p-3 shadow-soft"
      style={{ left, top }}
    >
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted">
          {ctx.price ? `Ask about ${fmtPrice(ctx.price)}` : "Ask the coach"}
        </div>
        <button onClick={onClose} className="text-muted hover:text-fg">
          <X size={14} />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button
            key={q}
            onClick={() => ask(q)}
            className="rounded-lg border border-border bg-surface-2/40 px-2 py-1 text-[11px] text-fg transition-colors hover:border-primary/40"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="mt-2 flex gap-1.5">
        <Input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(input)}
          placeholder="Ask about this spot…"
          className="h-8 text-xs"
        />
        <Button size="sm" className="h-8" disabled={stream.busy} onClick={() => ask(input)}>
          Ask
        </Button>
      </div>

      {stream.noKey && (
        <div className="mt-2 text-xs text-muted">Add an AI key in Settings to use the coach.</div>
      )}
      <ToolLine tools={stream.tools} />
      {stream.output && (
        <div className="mt-2 max-h-52 overflow-y-auto">
          <CoachOutput text={stream.output} />
        </div>
      )}
    </div>
  );
}
