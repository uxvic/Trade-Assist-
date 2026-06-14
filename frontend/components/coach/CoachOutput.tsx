"use client";

import { cn } from "@/lib/utils";

import { TOOL_LABELS } from "./useCoachStream";

export function ToolLine({ tools }: { tools: string[] }) {
  if (tools.length === 0) return null;
  return (
    <div className="text-xs text-muted">{tools.map((t) => TOOL_LABELS[t] ?? t).join(" · ")}</div>
  );
}

export function CoachOutput({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="whitespace-pre-wrap rounded-xl border border-border bg-surface-2/30 p-3 text-[13.5px] leading-relaxed text-fg">
      {text}
    </div>
  );
}

export function WatchToggle({ watching, onToggle }: { watching: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
        watching
          ? "border-positive/40 bg-positive/10 text-positive"
          : "border-border text-muted hover:text-fg"
      )}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          watching ? "animate-pulse-soft bg-positive" : "bg-muted"
        )}
      />
      {watching ? "Watching live" : "Watch live"}
    </button>
  );
}
