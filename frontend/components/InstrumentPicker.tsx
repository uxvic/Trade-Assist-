"use client";

import { ChevronDown, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { type InstrumentInfo, useInstruments } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const ASSET_CLASSES = [
  { id: "crypto", label: "Crypto" },
  { id: "forex", label: "Forex" },
  { id: "stocks", label: "Stocks" },
];

const SEARCH_PLACEHOLDER: Record<string, string> = {
  crypto: "Search coins (BTC, ETH…)",
  forex: "Search pairs (EUR, GBP…)",
  stocks: "Search stocks & ETFs (AAPL, SPY…)",
};

export function InstrumentPicker() {
  const instrument = useAppStore((s) => s.instrument);
  const setInstrument = useAppStore((s) => s.setInstrument);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(instrument.assetClass || "crypto");
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError } = useInstruments(tab, search);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function pick(i: InstrumentInfo) {
    setInstrument({ symbol: i.symbol, name: i.name, ticker: i.ticker, assetClass: i.asset_class });
    setOpen(false);
    setSearch("");
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-2/40 px-3 py-2 transition-colors hover:bg-surface-2/70"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-[10px] font-semibold text-fg">
          {instrument.ticker.replace("/", "")}
        </div>
        <div className="text-left">
          <div className="text-sm font-semibold text-fg">{instrument.name}</div>
          <div className="text-[11px] capitalize text-muted">
            {instrument.ticker} · {instrument.assetClass}
          </div>
        </div>
        <ChevronDown size={16} className="text-muted" />
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-80 rounded-xl border border-border bg-surface shadow-soft">
          <div className="flex gap-1 p-2">
            {ASSET_CLASSES.map((a) => (
              <button
                key={a.id}
                onClick={() => setTab(a.id)}
                className={cn(
                  "flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors",
                  tab === a.id ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"
                )}
              >
                {a.label}
              </button>
            ))}
          </div>

          <div className="px-2 pb-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={SEARCH_PLACEHOLDER[tab] ?? "Search…"}
                className="h-9 w-full rounded-lg border border-border bg-surface-2 pl-8 pr-3 text-sm text-fg placeholder:text-muted focus:outline-none"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto px-1 pb-2">
            {isLoading && <div className="px-3 py-4 text-sm text-muted">Loading…</div>}
            {isError && (
              <div className="px-3 py-4 text-sm text-muted">
                Couldn't load {tab} instruments. Check your connection.
              </div>
            )}
            {data?.instruments.map((i) => (
              <button
                key={i.symbol}
                onClick={() => pick(i)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-2/60"
              >
                <span className="text-sm text-fg">{i.name}</span>
                <span className="text-xs text-muted">{i.ticker}</span>
              </button>
            ))}
            {data && data.instruments.length === 0 && (
              <div className="px-3 py-4 text-sm text-muted">No matches.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
