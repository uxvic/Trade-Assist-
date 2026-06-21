"use client";

import { Bot, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AssistantPanel } from "@/components/AssistantPanel";
import { type ChartHandle, KLineChart } from "@/components/chart/KLineChart";
import { ChartViewToggle } from "@/components/chart/ChartViewToggle";
import { ChartCoachPopover, type PointContext } from "@/components/coach/ChartCoachPopover";
import { SlashAskBar } from "@/components/coach/SlashAskBar";
import { ForecastView } from "@/components/forecast/ForecastView";
import { GuidedTour } from "@/components/GuidedTour";
import { InstrumentBar } from "@/components/InstrumentBar";
import { OrderTicket } from "@/components/OrderTicket";
import { PositionsList } from "@/components/PositionsList";
import { TimeframeSelector } from "@/components/TimeframeSelector";
import { useQuote, useStrategyAnalysis } from "@/lib/api";
import { fmtPrice } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function TradePage() {
  const instrument = useAppStore((s) => s.instrument);
  const timeframe = useAppStore((s) => s.timeframe);
  const chartView = useAppStore((s) => s.chartView);
  const showBotPlan = useAppStore((s) => s.showBotPlan);
  const toggleBotPlan = useAppStore((s) => s.toggleBotPlan);
  const suggested = useAppStore((s) => s.suggestedTrade);
  const quote = useQuote(instrument.assetClass, instrument.symbol);
  const strategy = useStrategyAnalysis(instrument.assetClass, instrument.symbol);

  const chartRef = useRef<ChartHandle>(null);
  const [popover, setPopover] = useState<{ anchor: { x: number; y: number }; ctx: PointContext } | null>(
    null
  );
  const [showPositions, setShowPositions] = useState(true);
  // The AI helpers (coach + bot) live in one collapsible drawer, tucked by default.
  const [assistantOpen, setAssistantOpen] = useState(false);

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
  }, [suggested, instrument.symbol, chartView]);

  // Draw the bot's plan — S&R levels + entry/stop/target — as labelled tags on the chart.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const a = strategy.data;
    if (showBotPlan && a && a.symbol === instrument.symbol) {
      chart.drawBotPlan(a);
    } else {
      chart.clearStrategy();
    }
  }, [strategy.data, instrument.symbol, chartView, showBotPlan]);

  const ctxBase = {
    symbol: instrument.symbol,
    assetClass: instrument.assetClass,
    name: instrument.name,
    timeframe,
  };

  return (
    <div className="flex h-full flex-col">
      <GuidedTour />

      {/* One line for instruments: a pinned "+" to add, then your open tabs */}
      <InstrumentBar />

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-3">
          <ChartViewToggle />
          {chartView === "trade" && (
            <button
              onClick={toggleBotPlan}
              title="Show the bot's levels & plan on your chart"
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                showBotPlan
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                  : "border-border bg-surface-2/40 text-muted hover:text-fg"
              )}
            >
              <Bot size={13} /> Bot plan
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {quote.data && (
            <span className="text-sm font-semibold tabular text-fg">{fmtPrice(quote.data.last)}</span>
          )}
          <TimeframeSelector />
        </div>
      </div>

      {/* Body: the hero chart (with the AI drawer tucked under it) + a slim trade rail */}
      <div className="flex flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col lg:overflow-hidden">
          {/* Hero: your trading chart, or the AI forecast lens — dominant by default */}
          <div
            className={cn(
              "relative min-h-0",
              assistantOpen ? "max-lg:h-[55vh] lg:flex-[3]" : "max-lg:h-[64vh] lg:flex-1"
            )}
          >
            {chartView === "forecast" ? (
              <ForecastView />
            ) : (
              <>
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
              </>
            )}
          </div>

          {/* The AI helpers, consolidated and tucked away until you want them */}
          <AssistantPanel
            open={assistantOpen}
            onOpenChange={setAssistantOpen}
            className={assistantOpen ? "max-lg:h-[75vh] lg:flex-[2]" : "shrink-0"}
          />
        </div>

        {/* Right rail: just the trade — place an order + what you own */}
        <div className="flex w-full shrink-0 flex-col border-t border-border lg:w-[340px] lg:overflow-y-auto lg:border-l lg:border-t-0">
          <div className="p-4">
            <h3 className="mb-3 text-sm font-semibold text-fg">Place a practice trade</h3>
            <OrderTicket
              symbol={instrument.symbol}
              name={instrument.name}
              ticker={instrument.ticker}
              assetClass={instrument.assetClass}
            />
          </div>

          {/* What you own */}
          <div className="border-t border-border">
            <button
              onClick={() => setShowPositions((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-2 text-sm font-semibold text-fg"
            >
              What you own
              {showPositions ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </button>
            {showPositions && (
              <div className="max-h-52 overflow-y-auto">
                <PositionsList />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
