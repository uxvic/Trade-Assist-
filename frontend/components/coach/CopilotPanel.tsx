"use client";

import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";

import { CoachOutput, ToolLine, WatchToggle } from "./CoachOutput";
import { PositionManager } from "./PositionManager";
import { TradeProposalCard } from "./TradeProposalCard";
import { useCopilot } from "./useCopilot";

export function CopilotPanel() {
  const co = useCopilot();
  const setStyle = useAppStore((s) => s.setCopilotStyle);
  const setSuggested = useAppStore((s) => s.setSuggestedTrade);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">An expert watching with you. You approve every move.</p>
        <button
          onClick={() => setStyle("session")}
          className="shrink-0 text-xs text-primary hover:underline"
        >
          Session view →
        </button>
      </div>

      <div className="flex items-center gap-2">
        <WatchToggle watching={co.watching} onToggle={() => co.setWatching(!co.watching)} />
        <Button size="sm" className="flex-1" disabled={co.busy} onClick={co.scan}>
          {co.busy ? "Scanning…" : `Scan ${co.instrument.ticker} for a setup`}
        </Button>
      </div>

      <ToolLine tools={co.tools} />
      <CoachOutput text={co.output} />

      {co.proposal?.side && (
        <TradeProposalCard
          proposal={co.proposal}
          pending={co.placing}
          onExecute={() => co.applyProposal(co.proposal!)}
          onAdjust={() => setSuggested(co.proposal)}
          onSkip={() => co.setProposal(null)}
        />
      )}

      <PositionManager />
    </div>
  );
}
