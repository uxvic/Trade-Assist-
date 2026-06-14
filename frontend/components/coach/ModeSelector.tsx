"use client";

import { Eye, Lightbulb, Sparkles } from "lucide-react";

import { type CoachIntensity, useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const MODES: { id: CoachIntensity; label: string; desc: string; icon: typeof Eye }[] = [
  { id: "reads", label: "Reads", desc: "Observe", icon: Eye },
  { id: "suggestions", label: "Suggest", desc: "Fills ticket", icon: Lightbulb },
  { id: "copilot", label: "Co-pilot", desc: "Approve & go", icon: Sparkles },
];

export function ModeSelector() {
  const mode = useAppStore((s) => s.coachIntensity);
  const setMode = useAppStore((s) => s.setCoachIntensity);

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {MODES.map(({ id, label, desc, icon: Icon }) => {
        const active = mode === id;
        return (
          <button
            key={id}
            onClick={() => setMode(id)}
            className={cn(
              "rounded-xl border p-2.5 text-left transition-colors",
              active ? "border-primary/50 bg-primary/10" : "border-border hover:bg-surface-2/60"
            )}
          >
            <Icon size={16} className={active ? "text-primary" : "text-muted"} />
            <div className="mt-1.5 text-sm font-semibold text-fg">{label}</div>
            <div className="text-[11px] leading-tight text-muted">{desc}</div>
          </button>
        );
      })}
    </div>
  );
}
