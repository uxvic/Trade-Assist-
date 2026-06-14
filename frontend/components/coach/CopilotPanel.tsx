"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";

import { CoachOutput, ToolLine, WatchToggle } from "./CoachOutput";
import { PositionManager } from "./PositionManager";
import { TradeProposalCard } from "./TradeProposalCard";
import { useCopilot } from "./useCopilot";

export function CopilotPanel() {
  const co = useCopilot();
  const setSuggested = useAppStore((s) => s.setSuggestedTrade);

  // Surface any proposal to the chart (draws entry/stop/target) and ticket.
  useEffect(() => {
    if (co.proposal?.side) setSuggested(co.proposal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [co.proposal]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">An expert watching with you. You approve every move.</p>

      <div className="flex items-center gap-2">
        <WatchToggle watching={co.watching} onToggle={() => co.setWatching(!co.watching)} />
        <Button size="sm" className="flex-1" disabled={co.busy} onClick={co.scan}>
          {co.busy ? "Scanning…" : `Scan ${co.instrument.ticker}`}
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
