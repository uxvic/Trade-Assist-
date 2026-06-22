"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { useCandles, useQuote, type BotTrade, type StrategyAnalysis } from "@/lib/api";
import { fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { Chart, KLineData } from "klinecharts";

export interface StrategyLevel {
  price: number;
  strength: number;
  source_tf: string;
}

/** Declutter: keep the strongest ~n levels near the current price. */
export function topLevels<T extends { price: number; strength: number }>(
  levels: T[],
  price: number,
  n = 6
): T[] {
  if (!levels.length) return [];
  if (!price) return [...levels].sort((a, b) => b.strength - a.strength).slice(0, n);
  const band = price * 0.08; // within ~8% of price
  const near = levels.filter((l) => Math.abs(l.price - price) <= band);
  const pool = near.length >= 3 ? near : levels;
  return [...pool].sort((a, b) => b.strength - a.strength).slice(0, n);
}

export interface ChartHandle {
  drawCoachLevels: (levels: { entry?: number; stop?: number; target?: number }) => void;
  clearCoach: () => void;
  markPoint: (time: number, price: number, text: string) => void;
  getCrosshair: () => { time: number | null; price: number | null };
  drawLevels: (levels: StrategyLevel[]) => void;
  drawProposedTrade: (t: { entry?: number; stop?: number; target?: number } | null) => void;
  /** The bot's whole plan as labelled, plain-language tags on the price axis. */
  drawBotPlan: (analysis: StrategyAnalysis | null) => void;
  clearStrategy: () => void;
  /** The bot's real trades on this symbol, marked where it bought and sold. */
  drawBotTrades: (trades: BotTrade[]) => void;
  clearBotTrades: () => void;
}

interface Props {
  assetClass: string;
  symbol: string;
  timeframe: string;
  /** Strip the toolbars + interactions — for the bot's compact "mini" chart. */
  minimal?: boolean;
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

// S&R level color by source timeframe — monthly is the strongest / most distinct.
const TF_COLORS: Record<string, string> = {
  "1M": "#F5A623",
  "1d": "#7C5CFF",
  "4h": "#3FA7FF",
  "1h": "#5BC8AF",
};

// Plain-language timeframe words for the on-chart level tags.
const TF_WORDS: Record<string, string> = {
  "1M": "Monthly",
  "1d": "Daily",
  "4h": "4H",
  "1h": "1H",
};

export const KLineChart = forwardRef<ChartHandle, Props>(function KLineChart(
  { assetClass, symbol, timeframe, minimal = false, onPointClick },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const kcRef = useRef<typeof import("klinecharts") | null>(null);
  const coachIdsRef = useRef<string[]>([]);
  const strategyIdsRef = useRef<string[]>([]);
  const botTradeIdsRef = useRef<string[]>([]);
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
      if (!minimal) chart.createIndicator("VOL");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function clearStrategy() {
    const chart = chartRef.current;
    if (!chart) return;
    strategyIdsRef.current.forEach((id) => chart.removeOverlay(id));
    strategyIdsRef.current = [];
  }

  function clearBotTrades() {
    const chart = chartRef.current;
    if (!chart) return;
    botTradeIdsRef.current.forEach((id) => chart.removeOverlay(id));
    botTradeIdsRef.current = [];
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
    drawLevels: (levels) => {
      const chart = chartRef.current;
      if (!chart) return;
      clearStrategy();
      for (const lv of levels) {
        const color = TF_COLORS[lv.source_tf] ?? "#8A93A6";
        const id = chart.createOverlay({
          name: "horizontalStraightLine",
          points: [{ value: lv.price }],
          styles: { line: { color, size: 1 + Math.round(lv.strength * 2) }, text: { color } },
        } as never);
        if (typeof id === "string") strategyIdsRef.current.push(id);
      }
    },
    drawProposedTrade: (t) => {
      const chart = chartRef.current;
      if (!chart || !t) return;
      const lines: [number | undefined, string][] = [
        [t.entry, COACH_COLORS.entry],
        [t.stop, COACH_COLORS.stop],
        [t.target, COACH_COLORS.target],
      ];
      for (const [value, color] of lines) {
        if (value == null) continue;
        const id = chart.createOverlay({
          name: "priceLine",
          points: [{ value }],
          styles: { line: { color }, text: { color } },
        } as never);
        if (typeof id === "string") strategyIdsRef.current.push(id);
      }
    },
    drawBotPlan: (analysis) => {
      const chart = chartRef.current;
      if (!chart) return;
      clearStrategy();
      if (!analysis) return;

      // Each line becomes a `simpleTag`: a level across the pane + a
      // plain-language label on the price axis (role + price via fmtPrice).
      const tag = (value: number, text: string, color: string, size = 1) => {
        const id = chart.createOverlay({
          name: "simpleTag",
          points: [{ value }],
          extendData: text,
          // White label on the timeframe-coloured pill — the colour alone (e.g.
          // purple/blue on the price axis) left the text unreadable.
          styles: { line: { color, size }, text: { color: "#fff", backgroundColor: color } },
        } as never);
        if (typeof id === "string") strategyIdsRef.current.push(id);
      };

      // S&R levels — strongest near price; monthly thickest/amber.
      for (const lv of topLevels(analysis.levels, analysis.current_price, 6)) {
        const color = TF_COLORS[lv.source_tf] ?? "#8A93A6";
        const tf = TF_WORDS[lv.source_tf] ?? lv.source_tf;
        tag(lv.price, `${tf} ${lv.type} ${fmtPrice(lv.price)}`, color, 1 + Math.round(lv.strength * 2));
      }

      // The proposed trade (buys-only) as entry / stop / target tags.
      const pt = analysis.proposed_trade;
      if (analysis.signal.state === "buy" && pt) {
        tag(pt.entry, `Buy entry ${fmtPrice(pt.entry)}`, COACH_COLORS.entry);
        tag(pt.stop, `Stop ${fmtPrice(pt.stop)}`, COACH_COLORS.stop);
        tag(pt.target, `Target 1:${Math.round(pt.rr)} ${fmtPrice(pt.target)}`, COACH_COLORS.target);
      }
    },
    clearStrategy,
    drawBotTrades: (trades) => {
      const chart = chartRef.current;
      if (!chart) return;
      clearBotTrades();
      // A small arrow + label where the bot actually bought / sold this symbol.
      const anno = (timestamp: number, value: number, text: string, color: string) => {
        const id = chart.createOverlay({
          name: "simpleAnnotation",
          points: [{ timestamp, value }],
          extendData: text,
          styles: { line: { color }, polygon: { color }, text: { color } },
        } as never);
        if (typeof id === "string") botTradeIdsRef.current.push(id);
      };
      for (const t of trades) {
        if (t.symbol !== symbol) continue;
        anno(t.opened_at * 1000, t.entry, `Bot bought ${fmtPrice(t.entry)}`, "#7C5CFF");
        if (t.closed_at && t.pnl != null && t.qty > 0) {
          const exit = t.entry + t.pnl / t.qty;
          const pct = (t.pnl / (t.entry * t.qty)) * 100;
          const sign = t.pnl >= 0 ? "+" : "";
          anno(
            t.closed_at * 1000,
            exit,
            `Bot sold ${sign}${pct.toFixed(1)}%`,
            t.pnl >= 0 ? "#16C784" : "#EA3943"
          );
        }
      }
    },
    clearBotTrades,
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

  if (minimal) {
    return (
      <div className="relative h-full w-full">
        <div ref={containerRef} className="h-full w-full" />
        {isError && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-muted">
            No live feed.
          </div>
        )}
      </div>
    );
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
