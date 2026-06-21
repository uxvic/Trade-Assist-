"use client";

import {
  ColorType,
  LineStyle,
  type UTCTimestamp,
  createChart,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

import type { Forecast, ForecastPoint } from "@/lib/api";

type LinePoint = { time: UTCTimestamp; value: number };

/** lightweight-charts wants strictly-ascending, de-duplicated timestamps. */
function toLine(points: ForecastPoint[]): LinePoint[] {
  const seen = new Set<number>();
  const out: LinePoint[] = [];
  for (const p of points) {
    if (seen.has(p.ts)) continue;
    seen.add(p.ts);
    out.push({ time: p.ts as UTCTimestamp, value: p.value });
  }
  return out.sort((a, b) => (a.time as number) - (b.time as number));
}

/**
 * The forecast as a fan chart that extends into the FUTURE — something the main
 * KLineChart can't do (its axis stops at the last candle). We draw the real
 * recent price, the model's median projection, and the P10–P90 cone so the
 * uncertainty is impossible to miss.
 */
export function ForecastChart({ forecast }: { forecast: Forecast }) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Build the chart AND draw the forecast in one effect, re-running on each new
  // forecast. Keeping creation + drawing together means teardown is a single
  // `chart.remove()` — calling `removeSeries` after the chart is already gone
  // (which happened when this was split across two effects) throws
  // "Value is undefined".
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
      timeScale: {
        borderColor: "#242C3B",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
      },
      crosshair: { mode: 1 },
    });

    // The anchor stitches "what happened" to "what the model expects".
    const anchor: ForecastPoint = { ts: forecast.as_of, value: forecast.made_price };

    // What actually happened (solid, muted).
    const history = chart.addLineSeries({
      color: "#8A93A6",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    history.setData(toLine([...forecast.history, anchor]));

    // The P10–P90 cone (faint, dotted) — the honest spread of outcomes.
    const coneOpts = {
      color: "rgba(124,92,255,0.45)",
      lineWidth: 1 as const,
      lineStyle: LineStyle.Dotted,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    };
    const upper = chart.addLineSeries(coneOpts);
    upper.setData(toLine([anchor, ...forecast.upper]));
    const lower = chart.addLineSeries(coneOpts);
    lower.setData(toLine([anchor, ...forecast.lower]));

    // The median projection (dashed, accent) — the model's best guess.
    const median = chart.addLineSeries({
      color: "#7C5CFF",
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    median.setData(toLine([anchor, ...forecast.point]));

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
    };
  }, [forecast]);

  return <div ref={containerRef} className="h-full w-full" />;
}
