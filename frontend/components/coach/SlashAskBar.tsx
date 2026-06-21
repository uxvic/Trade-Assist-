"use client";

import { X } from "lucide-react";
import type { RefObject } from "react";
import { useEffect, useState } from "react";

import type { ChartHandle } from "@/components/chart/KLineChart";
import { fmtPrice } from "@/lib/format";
import { useAppStore } from "@/lib/store";

import { ChatThread } from "./ChatThread";
import type { PointContext } from "./ChartCoachPopover";
import { useCoachChat } from "./useCoachChat";

const QUICK = ["What's happening?", "Is this a good entry?", "Where's the risk?", "Explain this chart"];

export function SlashAskBar({
  chartRef,
  ctx,
}: {
  chartRef: RefObject<ChartHandle>;
  ctx: Omit<PointContext, "time" | "price">;
}) {
  const [open, setOpen] = useState(false);
  const setSuggested = useAppStore((s) => s.setSuggestedTrade);

  const chat = useCoachChat({
    contextPrefix: () => {
      const cross = chartRef.current?.getCrosshair?.() ?? { time: null, price: null };
      const where = cross.price ? ` near ${fmtPrice(cross.price)}` : "";
      return `On the ${ctx.timeframe} ${ctx.name} (${ctx.symbol}) chart${where}: `;
    },
    onProposal: (p) =>
      setSuggested({ ...p, symbol: p.symbol ?? ctx.symbol, asset_class: p.asset_class ?? ctx.assetClass }),
  });

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

  return (
    <div className="absolute left-1/2 top-3 z-30 w-[460px] max-w-[92%] -translate-x-1/2 rounded-xl border border-border bg-surface/95 p-2.5 shadow-soft backdrop-blur">
      <div className="flex items-center justify-between px-0.5 pb-1.5">
        <span className="text-xs text-muted">Ask the coach about this chart</span>
        <button onClick={() => setOpen(false)} className="text-muted hover:text-fg">
          <X size={14} />
        </button>
      </div>
      <ChatThread {...chat} chips={QUICK} placeholder="Ask the coach about the chart…  (Esc to close)" />
    </div>
  );
}
