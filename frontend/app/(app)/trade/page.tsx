"use client";

import { OrderTicket } from "@/components/OrderTicket";
import { PositionsList } from "@/components/PositionsList";
import { PriceChart } from "@/components/PriceChart";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuote, useSymbols } from "@/lib/api";
import { fmtUSD } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function TradePage() {
  const symbols = useSymbols();
  const selected = useAppStore((s) => s.selectedSymbol);
  const setSymbol = useAppStore((s) => s.setSymbol);

  const list = symbols.data?.symbols ?? [];
  const info = list.find((s) => s.symbol === selected) ?? list[0];
  const quote = useQuote(info?.symbol);

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      {/* Symbol picker */}
      <div className="mb-4 flex flex-wrap gap-2">
        {list.map((s) => (
          <button
            key={s.symbol}
            onClick={() => setSymbol(s.symbol)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              s.symbol === info?.symbol
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted hover:bg-surface-2/60 hover:text-fg"
            )}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Chart + positions */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardContent className="pb-3">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-base font-semibold text-fg">{info?.name ?? "—"}</div>
                  <div className="text-xs text-muted">{info?.ticker} · 1-minute candles</div>
                </div>
                <div className="text-right">
                  {quote.data ? (
                    <div className="text-xl font-semibold tabular text-fg">
                      {fmtUSD(quote.data.last)}
                    </div>
                  ) : (
                    <Skeleton className="h-6 w-20" />
                  )}
                  <div className="text-xs text-muted">live price</div>
                </div>
              </div>
              <div className="h-[360px]">{info && <PriceChart symbol={info.symbol} />}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="px-0 py-2">
              <h3 className="px-4 pb-1 pt-1 text-sm font-semibold text-fg">What you own</h3>
              <PositionsList />
            </CardContent>
          </Card>
        </div>

        {/* Order ticket */}
        <div>
          <Card>
            <CardContent>
              <h3 className="mb-4 text-sm font-semibold text-fg">Place a practice trade</h3>
              {info && (
                <OrderTicket symbol={info.symbol} name={info.name} ticker={info.ticker} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
