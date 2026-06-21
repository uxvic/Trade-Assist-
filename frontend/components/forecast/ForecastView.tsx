"use client";

import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ForecastChart } from "@/components/forecast/ForecastChart";
import { type Forecast, fetchForecast } from "@/lib/api";
import { fmtPrice } from "@/lib/format";
import { useAppStore } from "@/lib/store";

function projectionLine(f: Forecast): string {
  const end = f.point.at(-1)?.value ?? f.made_price;
  const lo = f.lower.at(-1)?.value ?? end;
  const hi = f.upper.at(-1)?.value ?? end;
  const dir = end > f.made_price ? "up ↑" : end < f.made_price ? "down ↓" : "flat →";
  return `Projects ${dir} to ~${fmtPrice(end)} over the next ${f.horizon} candles (range ${fmtPrice(lo)}–${fmtPrice(hi)}).`;
}

/**
 * The forecast "lens" that takes over the hero when toggled on. It auto-runs for
 * the current instrument/timeframe and leads with the honest scorecard — the
 * projection is deliberately framed as a model's guess, never a signal.
 */
export function ForecastView() {
  const instrument = useAppStore((s) => s.instrument);
  const timeframe = useAppStore((s) => s.timeframe);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Forecast | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const f = await fetchForecast(instrument.assetClass, instrument.symbol, timeframe);
      setData(f);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Forecast unavailable.");
    } finally {
      setLoading(false);
    }
  }, [instrument.assetClass, instrument.symbol, timeframe]);

  // Run on mount and whenever the instrument or timeframe changes.
  useEffect(() => {
    run();
  }, [run]);

  const card = data && data.symbol === instrument.symbol ? data : null;

  return (
    <div className="flex h-full flex-col">
      {/* The chart canvas (or its loading / empty state). */}
      <div className="relative min-h-0 flex-1">
        {card && !loading ? (
          <ForecastChart forecast={card} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            {loading ? (
              <>
                <Loader2 size={20} className="animate-spin text-accent" />
                <p className="text-sm text-muted">Crunching the forecast…</p>
                <p className="text-xs text-muted">
                  Loading the model the first time can take a minute.
                </p>
              </>
            ) : (
              <>
                <Sparkles size={20} className="text-accent" />
                <p className="max-w-sm text-sm text-muted">{error ?? "No forecast yet."}</p>
                <button
                  onClick={run}
                  className="mt-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-fg transition hover:opacity-90"
                >
                  Try again
                </button>
              </>
            )}
          </div>
        )}

        {card && !loading && (
          <button
            onClick={run}
            title="Run a fresh forecast"
            className="absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded-md bg-surface/80 px-2 py-1 text-[11px] font-medium text-muted backdrop-blur transition hover:text-fg"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        )}
      </div>

      {/* The honest footer: scorecard (the hero) → projection → caveat. */}
      {card && !loading && (
        <div className="space-y-1.5 border-t border-border px-4 py-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {card.scorecard.directional_acc !== null && (
              <span className="text-sm font-semibold text-fg">
                Right on direction {card.scorecard.directional_acc}% · beat a naive guess{" "}
                {card.scorecard.beat_naive_pct}%
                <span className="font-normal text-muted">
                  {" "}
                  over {card.scorecard.n} forecast{card.scorecard.n === 1 ? "" : "s"}
                </span>
              </span>
            )}
            <span className="text-xs text-muted">{card.scorecard.verdict}</span>
          </div>
          <p className="text-xs text-fg">{projectionLine(card)}</p>
          <p className="text-[11px] leading-relaxed text-muted">
            A model&apos;s projection, not a prediction to trade. Markets are near-random — let the
            scorecard, not the line, tell you how much to trust it.
          </p>
        </div>
      )}
    </div>
  );
}
