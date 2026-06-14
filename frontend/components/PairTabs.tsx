"use client";

import { X } from "lucide-react";

import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function PairTabs() {
  const open = useAppStore((s) => s.openInstruments);
  const active = useAppStore((s) => s.instrument);
  const setInstrument = useAppStore((s) => s.setInstrument);
  const closeInstrument = useAppStore((s) => s.closeInstrument);

  if (open.length <= 1) return null; // no tab strip needed for a single instrument

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-3 py-1.5">
      {open.map((inst) => {
        const on = inst.symbol === active.symbol;
        return (
          <div
            key={inst.symbol}
            onClick={() => setInstrument(inst)}
            className={cn(
              "group flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-sm transition-colors",
              on ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2/50"
            )}
          >
            <span className="font-medium">{inst.ticker}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeInstrument(inst.symbol);
              }}
              className="text-muted opacity-0 transition-opacity hover:text-fg group-hover:opacity-100"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
