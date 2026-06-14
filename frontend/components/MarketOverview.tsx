"use client";

import Link from "next/link";

import { Skeleton } from "@/components/ui/skeleton";
import { type SymbolInfo, useCandles, useQuote } from "@/lib/api";
import { fmtPct, fmtUSD } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

function Sparkline({ symbol }: { symbol: string }) {
  const { data } = useCandles("crypto", symbol, "1m", 32);
  const closes = data?.candles.map((c) => c.close) ?? [];
  if (closes.length < 2) return <div className="h-8 w-24" />;

  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const up = closes[closes.length - 1] >= closes[0];
  const points = closes
    .map((c, i) => {
      const x = (i / (closes.length - 1)) * 96;
      const y = 32 - ((c - min) / range) * 30 - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width="96" height="32" className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={up ? "#16C784" : "#EA3943"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CoinRow({ info }: { info: SymbolInfo }) {
  const { data: quote } = useQuote("crypto", info.symbol);
  const { data: candles } = useCandles("crypto", info.symbol, "1m", 32);
  const setInstrument = useAppStore((s) => s.setInstrument);

  const closes = candles?.candles ?? [];
  const change =
    closes.length >= 2
      ? ((closes[closes.length - 1].close - closes[0].close) / closes[0].close) * 100
      : null;

  return (
    <Link
      href="/trade"
      onClick={() =>
        setInstrument({
          symbol: info.symbol,
          name: info.name,
          ticker: info.ticker,
          assetClass: "crypto",
        })
      }
      className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2/60"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-fg">
          {info.ticker}
        </div>
        <div>
          <div className="text-sm font-medium text-fg">{info.name}</div>
          <div className="text-xs text-muted">{info.ticker}</div>
        </div>
      </div>

      <Sparkline symbol={info.symbol} />

      <div className="w-28 text-right">
        <div className="text-sm font-semibold tabular text-fg">
          {quote ? fmtUSD(quote.last) : <Skeleton className="ml-auto h-4 w-16" />}
        </div>
        {change !== null && (
          <div
            className={cn(
              "text-xs tabular",
              change >= 0 ? "text-positive" : "text-negative"
            )}
          >
            {fmtPct(change)}
          </div>
        )}
      </div>
    </Link>
  );
}

export function MarketOverview({ symbols, limit = 4 }: { symbols: SymbolInfo[]; limit?: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      {symbols.slice(0, limit).map((s) => (
        <CoinRow key={s.symbol} info={s} />
      ))}
    </div>
  );
}
