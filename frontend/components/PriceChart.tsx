"use client";

import {
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  createChart,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

import { useCandles, useQuote } from "@/lib/api";

export function PriceChart({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const { data, isLoading, isError } = useCandles(symbol, "1m", 150);
  const { data: quote } = useQuote(symbol);

  // Create the chart once.
  useEffect(() => {
    if (!containerRef.current) return;
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
      timeScale: { borderColor: "#242C3B", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1 },
    });
    const series = chart.addCandlestickSeries({
      upColor: "#16C784",
      downColor: "#EA3943",
      borderVisible: false,
      wickUpColor: "#16C784",
      wickDownColor: "#EA3943",
    });
    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Load candles when they arrive / symbol changes.
  useEffect(() => {
    if (!seriesRef.current || !data) return;
    seriesRef.current.setData(
      data.candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  // Nudge the latest candle with the live quote so the chart feels alive.
  useEffect(() => {
    if (!seriesRef.current || !quote || !data || data.candles.length === 0) return;
    const last = data.candles[data.candles.length - 1];
    const price = Number(quote.last);
    seriesRef.current.update({
      time: last.time as UTCTimestamp,
      open: last.open,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
      close: price,
    });
  }, [quote, data]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
          Loading live chart…
        </div>
      )}
      {isError && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted">
          Couldn't reach the live price feed. Check your internet connection and try again.
        </div>
      )}
    </div>
  );
}
