"use client";

import { X } from "lucide-react";

import { fmtPrice } from "@/lib/format";
import { useAppStore } from "@/lib/store";

import { ChatThread } from "./ChatThread";
import { useCoachChat } from "./useCoachChat";

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
  const setSuggested = useAppStore((s) => s.setSuggestedTrade);

  const chat = useCoachChat({
    contextPrefix: () => {
      const when = ctx.time ? new Date(ctx.time).toLocaleString() : "this point";
      const where = ctx.price ? ` (price was around ${fmtPrice(ctx.price)})` : "";
      return `On the ${ctx.timeframe} ${ctx.name} (${ctx.symbol}) chart, looking at ${when}${where}: `;
    },
    onProposal: (p) =>
      setSuggested({ ...p, symbol: p.symbol ?? ctx.symbol, asset_class: p.asset_class ?? ctx.assetClass }),
  });

  const left = Math.max(8, Math.min(anchor.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 360));
  const top = Math.max(8, Math.min(anchor.y, (typeof window !== "undefined" ? window.innerHeight : 800) - 360));

  return (
    <div
      className="fixed z-40 w-[340px] rounded-xl border border-border bg-surface p-3 shadow-soft"
      style={{ left, top }}
    >
      <div className="flex items-center justify-between pb-1.5">
        <div className="text-xs text-muted">
          {ctx.price ? `Ask about ${fmtPrice(ctx.price)}` : "Ask the coach"}
        </div>
        <button onClick={onClose} className="text-muted hover:text-fg">
          <X size={14} />
        </button>
      </div>
      <ChatThread {...chat} chips={QUICK} placeholder="Ask about this spot…" scrollClassName="max-h-[38vh]" />
    </div>
  );
}
