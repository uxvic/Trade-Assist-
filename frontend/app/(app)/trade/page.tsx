"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { KLineChart, type ChartHandle } from "@/components/chart/KLineChart";
import { ChartCoachPopover, type PointContext } from "@/components/coach/ChartCoachPopover";
import { CoachDock } from "@/components/coach/CoachDock";
import { SlashAskBar } from "@/components/coach/SlashAskBar";
import { GuidedTour } from "@/components/GuidedTour";
import { InstrumentPicker } from "@/components/InstrumentPicker";
import { OrderTicket } from "@/components/OrderTicket";
import { PositionsList } from "@/components/PositionsList";
import { TimeframeSelector } from "@/components/TimeframeSelector";
import { useQuote } from "@/lib/api";
import { fmtPrice } from "@/lib/format";
import { useAppStore } from "@/lib/store";

export default function TradePage() {
  const instrument = useAppStore((s) => s.instrument);
  const timeframe = useAppStore((s) => s.timeframe);
  const suggested = useAppStore((s) => s.suggestedTrade);
  const quote = useQuote(instrument.assetClass, instrument.symbol);

  const chartRef = useRef<ChartHandle>(null);
  const [popover, setPopover] = useState<{ anchor: { x: number; y: number }; ctx: PointContext } | null>(
    null
  );
  const [showPositions, setShowPositions] = useState(true);

  // The coach draws its thinking (entry/stop/target) right on the chart.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (suggested && (suggested.symbol ?? instrument.symbol) === instrument.symbol) {
      chart.drawCoachLevels({
        entry: suggested.entry,
        stop: suggested.stop,
        target: suggested.target,
      });
    } else {
      chart.clearCoach();
    }
  }, [suggested, instrument.symbol]);

  const ctxBase = {
    symbol: instrument.symbol,
    assetClass: instrument.assetClass,
    name: instrument.name,
    timeframe,
  };

  return (
    <div className="flex h-full flex-col">
      <GuidedTour />

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <InstrumentPicker />
        <div className="flex items-center gap-3">
          {quote.data && (
            <span className="text-sm font-semibold tabular text-fg">{fmtPrice(quote.data.last)}</span>
          )}
          <TimeframeSelector />
        </div>
      </div>

      {/* Body: chart (hero) + slim rail */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="relative flex-1">
            <KLineChart
              ref={chartRef}
              assetClass={instrument.assetClass}
              symbol={instrument.symbol}
              timeframe={timeframe}
              onPointClick={(p) =>
                setPopover({
                  anchor: { x: p.clientX, y: p.clientY },
                  ctx: { ...ctxBase, time: p.time, price: p.price },
                })
              }
            />
            <SlashAskBar chartRef={chartRef} ctx={ctxBase} />
            {popover && (
              <ChartCoachPopover
                anchor={popover.anchor}
                ctx={popover.ctx}
                onClose={() => setPopover(null)}
              />
            )}
            <div className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[11px] text-muted">
              Double-click the chart to ask the coach · press <kbd className="rounded bg-surface-2 px-1">/</kbd> to ask
            </div>
          </div>

          {/* Positions strip */}
          <div className="border-t border-border">
            <button
              onClick={() => setShowPositions((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-2 text-sm font-semibold text-fg"
            >
              What you own
              {showPositions ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </button>
            {showPositions && (
              <div className="max-h-44 overflow-y-auto">
                <PositionsList />
              </div>
            )}
          </div>
        </div>

        {/* Right rail: order ticket + coach */}
        <div className="flex w-[340px] shrink-0 flex-col overflow-y-auto border-l border-border">
          <div className="p-4">
            <h3 className="mb-3 text-sm font-semibold text-fg">Place a practice trade</h3>
            <OrderTicket
              symbol={instrument.symbol}
              name={instrument.name}
              ticker={instrument.ticker}
              assetClass={instrument.assetClass}
            />
          </div>
          <CoachDock />
        </div>
      </div>
    </div>
  );
}
