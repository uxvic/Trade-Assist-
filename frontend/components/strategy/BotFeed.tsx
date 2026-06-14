"use client";

import { Activity, Eye, LogIn, LogOut, Sparkles, Target } from "lucide-react";

import type { BotNote } from "@/lib/api";
import { cn } from "@/lib/utils";

const KIND: Record<string, { icon: typeof Activity; color: string }> = {
  analysis: { icon: Activity, color: "text-sky-400" },
  watch: { icon: Eye, color: "text-muted" },
  signal: { icon: Target, color: "text-amber-400" },
  enter: { icon: LogIn, color: "text-positive" },
  exit: { icon: LogOut, color: "text-negative" },
  ai: { icon: Sparkles, color: "text-primary" },
};

function fmtTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function BotFeed({ notes }: { notes: BotNote[] }) {
  if (notes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted">
        The bot is warming up — reading the higher timeframes…
      </div>
    );
  }

  return (
    <div className="h-full space-y-1.5 overflow-y-auto pr-1">
      {notes.map((n) => {
        const meta = KIND[n.kind] ?? KIND.analysis;
        const Icon = meta.icon;
        return (
          <div
            key={`${n.ts}-${n.kind}-${n.text}`}
            className={cn(
              "flex animate-fade-in gap-2 rounded-lg border border-border/60 bg-surface-2/30 px-2.5 py-2",
              n.kind === "ai" && "border-primary/30 bg-primary/5"
            )}
          >
            <Icon size={14} className={cn("mt-0.5 shrink-0", meta.color)} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] leading-snug text-fg">{n.text}</div>
              <div className="mt-0.5 text-[10px] tabular text-muted">{fmtTime(n.ts)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
