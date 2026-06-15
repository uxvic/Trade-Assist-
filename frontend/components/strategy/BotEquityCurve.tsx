"use client";

import {
  ColorType,
  type IChartApi,
  type UTCTimestamp,
  createChart,
} from "lightweight-charts";
import { useEffect, useMemo, useRef } from "react";

import type { BotTrade } from "@/lib/api";

/** Cumulative realized P&L over time, built from the bot's closed trades. */
export function BotEquityCurve({
  trades,
  starting = 100000,
}: {
  trades: BotTrade[];
  starting?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const points = useMemo(() => {
    const closed = trades
      .filter((t) => t.status === "closed" && t.closed_at != null && t.pnl != null)
      .sort((a, b) => a.closed_at! - b.closed_at!);
    if (!closed.length) return [];
    const seen = new Map<number, number>();
    let eq = starting;
    for (const t of closed) {
      eq += t.pnl!;
      seen.set(t.closed_at!, eq); // last write wins for same-second closes
    }
    const sorted = [...seen.entries()].sort((a, b) => a[0] - b[0]);
    return [{ time: sorted[0][0] - 1, value: starting }, ...sorted.map(([time, value]) => ({ time, value }))];
  }, [trades, starting]);

  useEffect(() => {
    if (!containerRef.current || points.length < 2) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8A93A6",
        fontFamily: "-apple-system, BlinkMacSystemFont, Inter, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(36,44,59,0.4)" },
        horzLines: { color: "rgba(36,44,59,0.4)" },
      },
      rightPriceScale: { borderColor: "#242C3B" },
      timeScale: { borderColor: "#242C3B", timeVisible: false, secondsVisible: false },
      crosshair: { mode: 1 },
    });
    const series = chart.addAreaSeries({
      lineColor: "#7C5CFF",
      topColor: "rgba(124,92,255,0.30)",
      bottomColor: "rgba(124,92,255,0.02)",
      lineWidth: 2,
    });
    series.setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    chart.timeScale().fitContent();
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [points]);

  if (points.length < 2) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
        The equity curve appears once the bot closes its first trades.
      </div>
    );
  }
  return <div ref={containerRef} className="h-full w-full" />;
}
