"use client";

import { CoachPanel } from "@/components/CoachPanel";
import { GuidedTour } from "@/components/GuidedTour";
import { InstrumentPicker } from "@/components/InstrumentPicker";
import { OrderTicket } from "@/components/OrderTicket";
import { PositionsList } from "@/components/PositionsList";
import { PriceChart } from "@/components/PriceChart";
import { TimeframeSelector } from "@/components/TimeframeSelector";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuote } from "@/lib/api";
import { fmtPrice } from "@/lib/format";
import { useAppStore } from "@/lib/store";

export default function TradePage() {
  const instrument = useAppStore((s) => s.instrument);
  const timeframe = useAppStore((s) => s.timeframe);
  const quote = useQuote(instrument.assetClass, instrument.symbol);

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <GuidedTour />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <InstrumentPicker />
        <TimeframeSelector />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Chart + positions */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardContent className="pb-3">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-base font-semibold text-fg">{instrument.name}</div>
                  <div className="text-xs text-muted">
                    {instrument.ticker} · {timeframe} candles
                  </div>
                </div>
                <div className="text-right">
                  {quote.data ? (
                    <div className="text-xl font-semibold tabular text-fg">
                      {fmtPrice(quote.data.last)}
                    </div>
                  ) : (
                    <Skeleton className="h-6 w-20" />
                  )}
                  <div className="text-xs text-muted">live price</div>
                </div>
              </div>
              <div className="h-[360px]">
                <PriceChart
                  assetClass={instrument.assetClass}
                  symbol={instrument.symbol}
                  timeframe={timeframe}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="px-0 py-2">
              <h3 className="px-4 pb-1 pt-1 text-sm font-semibold text-fg">What you own</h3>
              <PositionsList />
            </CardContent>
          </Card>
        </div>

        {/* Order ticket + coach */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent>
              <h3 className="mb-4 text-sm font-semibold text-fg">Place a practice trade</h3>
              <OrderTicket
                symbol={instrument.symbol}
                name={instrument.name}
                ticker={instrument.ticker}
                assetClass={instrument.assetClass}
              />
            </CardContent>
          </Card>
          <CoachPanel />
        </div>
      </div>
    </div>
  );
}
