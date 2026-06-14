"use client";

import { KeyRound, Sparkles } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useAISettings } from "@/lib/api";
import { useAppStore } from "@/lib/store";

import { CopilotPanel } from "./CopilotPanel";
import { ModeSelector } from "./ModeSelector";
import { ReadsView } from "./ReadsView";
import { SuggestionsView } from "./SuggestionsView";

export function CoachDock() {
  const ai = useAISettings();
  const mode = useAppStore((s) => s.coachIntensity);

  return (
    <div className="border-t border-border p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-fg">
          <Sparkles size={15} />
        </div>
        <h3 className="text-sm font-semibold text-fg">Your coach</h3>
      </div>

      {ai.isLoading ? null : !ai.data?.configured ? (
        <div className="rounded-xl border border-border bg-surface-2/30 p-3 text-center text-sm text-muted">
          Add an AI key to get reads, suggestions, and co-pilot trades — and to
          double-click the chart to ask about any spot.
          <Link href="/settings" className="mt-2 block">
            <Button size="sm" variant="secondary" className="w-full">
              <KeyRound size={14} /> Add your AI key
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <ModeSelector />
          {mode === "reads" && <ReadsView />}
          {mode === "suggestions" && <SuggestionsView />}
          {mode === "copilot" && <CopilotPanel />}
        </div>
      )}
    </div>
  );
}
