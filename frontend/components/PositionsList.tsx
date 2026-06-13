"use client";

import { Wallet } from "lucide-react";

import { usePositions } from "@/lib/api";
import { fmtNumber, fmtSignedUSD, fmtUSD, pnlTone } from "@/lib/format";
import { cn } from "@/lib/utils";

function prettyTicker(symbol: string) {
  return symbol.replace(/USDT$/, "");
}

export function PositionsList() {
  const { data, isLoading } = usePositions();

  if (isLoading) {
    return <div className="px-4 py-6 text-sm text-muted">Loading…</div>;
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-muted">
          <Wallet size={20} />
        </div>
        <div className="text-sm font-medium text-fg">You don't own anything yet</div>
        <div className="mt-1 text-sm text-muted">
          Place your first practice trade on the left to see it here.
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr] gap-2 border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted">
        <span>Coin</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Avg price</span>
        <span className="text-right">Profit / loss</span>
      </div>
      {data.map((p) => {
        const tone = pnlTone(p.unrealized_pnl);
        return (
          <div
            key={p.symbol}
            className="grid grid-cols-[1.2fr_1fr_1fr_1fr] items-center gap-2 px-4 py-3 text-sm hover:bg-surface-2/40"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-fg">
                {prettyTicker(p.symbol)}
              </div>
              <span className="font-medium text-fg">{prettyTicker(p.symbol)}</span>
            </div>
            <span className="text-right tabular text-fg">{fmtNumber(p.qty, 6)}</span>
            <span className="text-right tabular text-muted">{fmtUSD(p.avg_cost)}</span>
            <span
              className={cn(
                "text-right font-semibold tabular",
                tone === "positive" && "text-positive",
                tone === "negative" && "text-negative",
                tone === "flat" && "text-muted"
              )}
            >
              {fmtSignedUSD(p.unrealized_pnl)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
