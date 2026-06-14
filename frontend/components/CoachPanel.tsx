"use client";

import { KeyRound, Sparkles } from "lucide-react";
import Link from "next/link";

import { CopilotPanel } from "@/components/coach/CopilotPanel";
import { ModeSelector } from "@/components/coach/ModeSelector";
import { ReadsView } from "@/components/coach/ReadsView";
import { SuggestionsView } from "@/components/coach/SuggestionsView";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAISettings } from "@/lib/api";
import { useAppStore } from "@/lib/store";

export function CoachPanel() {
  const ai = useAISettings();
  const mode = useAppStore((s) => s.coachIntensity);

  if (ai.isLoading) return null;
  if (!ai.data?.configured) return <NoKeyCard />;

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-fg">
            <Sparkles size={15} />
          </div>
          <h3 className="text-sm font-semibold text-fg">Your coach</h3>
        </div>

        <ModeSelector />

        {mode === "reads" && <ReadsView />}
        {mode === "suggestions" && <SuggestionsView />}
        {mode === "copilot" && <CopilotPanel />}
      </CardContent>
    </Card>
  );
}

function NoKeyCard() {
  return (
    <Card>
      <CardContent className="text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Sparkles size={20} />
        </div>
        <h3 className="text-sm font-semibold text-fg">Your coach is asleep</h3>
        <p className="mt-1 text-sm text-muted">
          Add an AI key to get live expert reads, suggestions, and co-pilot trades right here.
        </p>
        <Link href="/settings">
          <Button variant="secondary" size="sm" className="mt-3">
            <KeyRound size={14} /> Add your AI key
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
