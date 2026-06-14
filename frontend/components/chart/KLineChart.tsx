"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { useCandles, useQuote } from "@/lib/api";
import { cn } from "@/lib/utils";

import type { Chart, KLineData } from "klinecharts";

export interface ChartHandle {
  drawCoachLevels: (levels: { entry?: number; stop?: number; target?: number }) => void;
  clearCoach: () => void;
  markPoint: (time: number, price: number, text: string) => void;
  getCrosshair: () => { time: number | null; price: number | null };
}

interface Props {
  assetClass: string;
  symbol: string;
  timeframe: string;
  onPointClick?: (p: {
    clientX: number;
    clientY: number;
    time: number | null;
    price: number | null;
  }) => void;
}

// Dark theme to match the app.
const STYLES = {
  grid: {
    horizontal: { color: "rgba(36,44,59,0.45)" },
    vertical: { color: "rgba(36,44,59,0.45)" },
  },
  candle: {
    bar: {
      upColor: "#16C784",
      downColor: "#EA3943",
      upBorderColor: "#16C784",
      downBorderColor: "#EA3943",
      upWickColor: "#16C784",
      downWickColor: "#EA3943",
    },
    priceMark: {
      high: { color: "#8A93A6" },
      low: { color: "#8A93A6" },
      last: {
        line: { color: "#8A93A6" },
        text: { color: "#fff" },
      },
    },
    tooltip: { text: { color: "#E6E9EF" } },
  },
  xAxis: { axisLine: { color: "#242C3B" }, tickLine: { color: "#242C3B" }, tickText: { color: "#8A93A6" } },
  yAxis: { axisLine: { color: "#242C3B" }, tickLine: { color: "#242C3B" }, tickText: { color: "#8A93A6" } },
  crosshair: {
    horizontal: { line: { color: "#6b7280" }, text: { backgroundColor: "#2962ff" } },
    vertical: { line: { color: "#6b7280" }, text: { backgroundColor: "#2962ff" } },
  },
  separator: { color: "#242C3B" },
  indicator: { tooltip: { text: { color: "#8A93A6" } } },
};

const DRAW_TOOLS: { name: string; label: string }[] = [
  { name: "segment", label: "Trend" },
  { name: "horizontalStraightLine", label: "Level" },
  { name: "rayLine", label: "Ray" },
  { name: "rect", label: "Box" },
  { name: "fibonacciLine", label: "Fib" },
  { name: "simpleAnnotation", label: "Note" },
];

// Indicators that overlay on the price pane vs. their own sub-pane.
const OVERLAY_INDICATORS = ["MA", "EMA", "BOLL"];
const PANE_INDICATORS = ["VOL", "MACD", "RSI"];

const COACH_COLORS: Record<string, string> = {
  entry: "#7C5CFF",
  stop: "#EA3943",
  target: "#16C784",
};

export const KLineChart = forwardRef<ChartHandle, Props>(function KLineChart(
  { assetClass, symbol, timeframe, onPointClick },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const kcRef = useRef<typeof import("klinecharts") | null>(null);
  const coachIdsRef = useRef<string[]>([]);
  const crosshairRef = useRef<{ time: number | null; price: number | null }>({
    time: null,
    price: null,
  });
  const [ready, setReady] = useState(false);
  const [activeIndicators, setActiveIndicators] = useState<Record<string, string>>({});

  const { data, isError } = useCandles(assetClass, symbol, timeframe, 300);
  const { data: quote } = useQuote(assetClass, symbol);

  // --- create chart once ------------------------------------------------
  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | null = null;

    import("klinecharts").then((kc) => {
      if (disposed || !containerRef.current) return;
      const chart = kc.init(containerRef.current);
      if (!chart) return;
      chart.setStyles(STYLES as never);
      chart.createIndicator("VOL");
      chart.subscribeAction(kc.ActionType.OnCrosshairChange, (c: unknown) => {
        const cross = c as { kLineData?: KLineData };
        if (cross?.kLineData) {
          crosshairRef.current = {
            time: cross.kLineData.timestamp,
            price: cross.kLineData.close,
          };
        }
      });
      kcRef.current = kc;
      chartRef.current = chart;
      setReady(true);

      ro = new ResizeObserver(() => chart.resize());
      ro.observe(containerRef.current);
    });

    return () => {
      disposed = true;
      ro?.disconnect();
      if (kcRef.current && containerRef.current) {
        kcRef.current.dispose(containerRef.current);
      }
      chartRef.current = null;
    };
  }, []);

  // --- load candles -----------------------------------------------------
  useEffect(() => {
    if (!ready || !chartRef.current || !data) return;
    const klines: KLineData[] = data.candles.map((c) => ({
      timestamp: c.time * 1000,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
    chartRef.current.applyNewData(klines);
    // New instrument/timeframe → drop coach overlays.
    clearCoach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, data]);

  // --- live update last candle -----------------------------------------
  useEffect(() => {
    if (!ready || !chartRef.current || !quote || !data || data.candles.length === 0) return;
    const last = data.candles[data.candles.length - 1];
    const price = Number(quote.last);
    chartRef.current.updateData({
      timestamp: last.time * 1000,
      open: last.open,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
      close: price,
      volume: last.volume,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote]);

  // --- imperative API for the coach ------------------------------------
  function clearCoach() {
    const chart = chartRef.current;
    if (!chart) return;
    coachIdsRef.current.forEach((id) => chart.removeOverlay(id));
    coachIdsRef.current = [];
  }

  useImperativeHandle(ref, () => ({
    drawCoachLevels: ({ entry, stop, target }) => {
      const chart = chartRef.current;
      if (!chart) return;
      clearCoach();
      const levels: [string, number | undefined][] = [
        ["entry", entry],
        ["stop", stop],
        ["target", target],
      ];
      for (const [kind, value] of levels) {
        if (value == null) continue;
        const id = chart.createOverlay({
          name: "priceLine",
          points: [{ value }],
          styles: {
            line: { color: COACH_COLORS[kind] },
            text: { color: COACH_COLORS[kind] },
          },
        } as never);
        if (typeof id === "string") coachIdsRef.current.push(id);
      }
    },
    clearCoach,
    markPoint: (time, price, text) => {
      const chart = chartRef.current;
      if (!chart) return;
      const id = chart.createOverlay({
        name: "simpleAnnotation",
        points: [{ timestamp: time, value: price }],
        extendData: text,
      } as never);
      if (typeof id === "string") coachIdsRef.current.push(id);
    },
    getCrosshair: () => crosshairRef.current,
  }));

  // --- drawing tools + indicators --------------------------------------
  function startDrawing(name: string) {
    chartRef.current?.createOverlay(name);
  }

  function clearDrawings() {
    chartRef.current?.removeOverlay();
    coachIdsRef.current = [];
  }

  function toggleIndicator(name: string) {
    const chart = chartRef.current;
    if (!chart) return;
    setActiveIndicators((prev) => {
      const next = { ...prev };
      if (next[name]) {
        const paneId = next[name];
        chart.removeIndicator(paneId, name);
        delete next[name];
      } else if (OVERLAY_INDICATORS.includes(name)) {
        chart.createIndicator(name, true, { id: "candle_pane" });
        next[name] = "candle_pane";
      } else {
        const paneId = chart.createIndicator(name);
        if (paneId) next[name] = paneId;
      }
      return next;
    });
  }

  // --- click → (time, price) for the coach -----------------------------
  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const chart = chartRef.current;
    if (!chart || !onPointClick) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let time: number | null = null;
    let price: number | null = null;
    try {
      const res = chart.convertFromPixel([{ x, y }], { paneId: "candle_pane" });
      const point = Array.isArray(res) ? res[0] : res;
      time = (point?.timestamp as number) ?? null;
      price = (point?.value as number) ?? null;
    } catch {
      /* ignore */
    }
    onPointClick({ clientX: e.clientX, clientY: e.clientY, time, price });
  }

  return (
    <div className="relative h-full w-full">
      {/* Drawing toolbar */}
      <div className="absolute left-2 top-2 z-10 flex flex-wrap gap-1">
        {DRAW_TOOLS.map((t) => (
          <button
            key={t.name}
            onClick={() => startDrawing(t.name)}
            className="rounded-md border border-border bg-surface/80 px-2 py-1 text-[11px] font-medium text-muted backdrop-blur transition-colors hover:text-fg"
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={clearDrawings}
          className="rounded-md border border-border bg-surface/80 px-2 py-1 text-[11px] font-medium text-muted backdrop-blur transition-colors hover:text-negative"
        >
          Clear
        </button>
      </div>

      {/* Indicator toggles */}
      <div className="absolute right-2 top-2 z-10 flex flex-wrap gap-1">
        {[...OVERLAY_INDICATORS, ...PANE_INDICATORS].map((name) => (
          <button
            key={name}
            onClick={() => toggleIndicator(name)}
            className={cn(
              "rounded-md border px-2 py-1 text-[11px] font-medium backdrop-blur transition-colors",
              activeIndicators[name]
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-border bg-surface/80 text-muted hover:text-fg"
            )}
          >
            {name}
          </button>
        ))}
      </div>

      <div ref={containerRef} onDoubleClick={handleClick} className="h-full w-full" />

      {isError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted">
          Couldn't reach the live price feed. Check your internet connection.
        </div>
      )}
    </div>
  );
});
