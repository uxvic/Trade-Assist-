"use client";

import { Plus, Search, X } from "lucide-react";
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

/**
 * One scrollable line for everything instrument-related: a pinned "+" that opens
 * the picker, then your open instruments as tabs (newest first). New picks land
 * at the front; the row scrolls horizontally once it runs past the edge.
 */
export function InstrumentBar() {
  const open = useAppStore((s) => s.openInstruments);
  const active = useAppStore((s) => s.instrument);
  const setInstrument = useAppStore((s) => s.setInstrument);
  const closeInstrument = useAppStore((s) => s.closeInstrument);

  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState(active.assetClass || "crypto");
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError } = useInstruments(tab, search);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function pick(i: InstrumentInfo) {
    setInstrument({ symbol: i.symbol, name: i.name, ticker: i.ticker, assetClass: i.asset_class });
    setMenuOpen(false);
    setSearch("");
  }

  return (
    <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
      {/* Pinned "+" — always at the front, opens the picker */}
      <div className="relative shrink-0" ref={ref}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          title="Add an instrument"
          className={cn(
            "flex items-center gap-1.5 rounded-lg border border-border bg-surface-2/40 px-2.5 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2/70 hover:text-fg",
            menuOpen && "bg-surface-2/70 text-fg"
          )}
        >
          <Plus size={15} />
          <span className="max-sm:hidden">Add</span>
        </button>

        {menuOpen && (
          <div className="absolute left-0 top-full z-30 mt-2 w-80 rounded-xl border border-border bg-surface shadow-soft">
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
              {data?.instruments.map((i) => {
                const alreadyOpen = open.some((o) => o.symbol === i.symbol);
                return (
                  <button
                    key={i.symbol}
                    onClick={() => pick(i)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-2/60"
                  >
                    <span className="text-sm text-fg">{i.name}</span>
                    <span className="text-xs text-muted">{alreadyOpen ? "open" : i.ticker}</span>
                  </button>
                );
              })}
              {data && data.instruments.length === 0 && (
                <div className="px-3 py-4 text-sm text-muted">No matches.</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Open instruments — newest first, scrolls horizontally past the edge */}
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {open.map((inst) => {
          const on = inst.symbol === active.symbol;
          return (
            <div
              key={inst.symbol}
              onClick={() => setInstrument(inst)}
              title={`${inst.name} · ${inst.assetClass}`}
              className={cn(
                "group flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                on ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2/50"
              )}
            >
              <span className="font-medium">{inst.ticker}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeInstrument(inst.symbol);
                }}
                aria-label={`Close ${inst.ticker}`}
                className={cn(
                  "text-muted transition-opacity hover:text-fg",
                  on ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
