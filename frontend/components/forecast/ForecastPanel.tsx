"use client";

import { ChevronDown, ChevronUp, LineChart, Loader2 } from "lucide-react";
import { useState } from "react";

import { type Forecast, fetchForecast } from "@/lib/api";
import { fmtPrice } from "@/lib/format";
import { useAppStore } from "@/lib/store";

const SVG_W = 300;
const SVG_H = 84;
const PAD = 5;

/** Build the SVG geometry: a muted history line, a dashed median projection,
 *  and a shaded P10–P90 band — all anchored at "now" for visual continuity. */
function geometry(f: Forecast) {
  const anchor = { ts: f.as_of, value: f.made_price };
  const hist = f.history.length ? f.history : [anchor];
  const line = [anchor, ...f.point];
  const upper = [anchor, ...f.upper];
  const lower = [anchor, ...f.lower];

  const xs = [...hist, ...upper].map((p) => p.ts);
  const ys = [
    ...hist.map((p) => p.value),
    ...upper.map((p) => p.value),
    ...lower.map((p) => p.value),
  ];
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xr = xMax - xMin || 1;
  const yr = yMax - yMin || 1;

  const X = (ts: number) => PAD + ((ts - xMin) / xr) * (SVG_W - 2 * PAD);
  const Y = (v: number) => PAD + (1 - (v - yMin) / yr) * (SVG_H - 2 * PAD);
  const draw = (pts: { ts: number; value: number }[]) =>
    pts.map((p, i) => `${i ? "L" : "M"}${X(p.ts).toFixed(1)} ${Y(p.value).toFixed(1)}`).join(" ");

  const band =
    `${draw(upper)} ` +
    lower
      .slice()
      .reverse()
      .map((p) => `L${X(p.ts).toFixed(1)} ${Y(p.value).toFixed(1)}`)
      .join(" ") +
    " Z";

  return { hist: draw(hist), line: draw(line), band, nowX: X(f.as_of) };
}

function Sparkline({ f }: { f: Forecast }) {
  const g = geometry(f);
  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      className="h-20 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Recent price and the model's projected path with an uncertainty band"
    >
      <path d={g.band} className="fill-accent/15" />
      <line
        x1={g.nowX}
        x2={g.nowX}
        y1={0}
        y2={SVG_H}
        className="stroke-border"
        strokeDasharray="2 3"
      />
      <path d={g.hist} fill="none" className="stroke-muted" strokeWidth={1.5} />
      <path
        d={g.line}
        fill="none"
        className="stroke-accent"
        strokeWidth={1.75}
        strokeDasharray="4 3"
      />
    </svg>
  );
}

function projectionLine(f: Forecast): string {
  const end = f.point.at(-1)?.value ?? f.made_price;
  const lo = f.lower.at(-1)?.value ?? end;
  const hi = f.upper.at(-1)?.value ?? end;
  const dir = end > f.made_price ? "up ↑" : end < f.made_price ? "down ↓" : "flat →";
  return `Projects ${dir} to ~${fmtPrice(end)} over the next ${f.horizon} candles (range ${fmtPrice(lo)}–${fmtPrice(hi)}).`;
}

export function ForecastPanel() {
  const instrument = useAppStore((s) => s.instrument);
  const timeframe = useAppStore((s) => s.timeframe);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Forecast | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const f = await fetchForecast(instrument.assetClass, instrument.symbol, timeframe);
      setData(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Forecast unavailable.");
    } finally {
      setLoading(false);
    }
  }

  const card = data && data.symbol === instrument.symbol ? data : null;

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2 text-sm font-semibold text-fg"
      >
        <span className="flex items-center gap-2">
          <LineChart size={15} className="text-accent" />
          Forecast
          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
            experimental
          </span>
        </span>
        {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>

      {open && (
        <div className="px-4 pb-4">
          <button
            onClick={run}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-fg transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <LineChart size={15} />}
            {loading ? "Crunching…" : card ? "Run again" : "Run forecast"}
          </button>
          {loading && (
            <p className="mt-2 text-center text-xs text-muted">
              Loading the model the first time can take a minute.
            </p>
          )}

          {error && !loading && (
            <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">{error}</p>
          )}

          {card && !loading && (
            <div className="mt-3 space-y-3">
              {/* The hero: the honest track record. */}
              <div className="rounded-lg bg-surface-2 px-3 py-2.5">
                {card.scorecard.directional_acc !== null ? (
                  <div className="mb-1 text-sm font-semibold text-fg">
                    Right on direction {card.scorecard.directional_acc}% · beat a naive guess{" "}
                    {card.scorecard.beat_naive_pct}%
                    <span className="font-normal text-muted">
                      {" "}
                      over {card.scorecard.n} forecast{card.scorecard.n === 1 ? "" : "s"}
                    </span>
                  </div>
                ) : null}
                <p className="text-xs leading-relaxed text-muted">{card.scorecard.verdict}</p>
              </div>

              {/* One plain-language projection line. */}
              <p className="text-xs text-fg">{projectionLine(card)}</p>

              {/* A tiny, self-contained sparkline (history → projection + band). */}
              <Sparkline f={card} />

              {/* The caveat — kept right next to the pretty line on purpose. */}
              <p className="text-[11px] leading-relaxed text-muted">
                A model's projection, not a prediction to trade. Markets are near-random — let the
                scorecard, not the line, tell you how much to trust it.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
