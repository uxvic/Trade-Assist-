"use client";

import { Button } from "@/components/ui/button";
import type { TradeProposal } from "@/lib/api";
import { fmtPrice, fmtUSD } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TradeProposalCard({
  proposal,
  onExecute,
  onAdjust,
  onSkip,
  pending,
}: {
  proposal: TradeProposal;
  onExecute: () => void;
  onAdjust: () => void;
  onSkip: () => void;
  pending: boolean;
}) {
  const buy = proposal.side === "buy";
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-xs font-semibold",
            buy ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative"
          )}
        >
          {buy ? "Buy" : "Sell"} setup
        </span>
        {proposal.leverage && proposal.leverage > 1 && (
          <span className="text-xs text-muted">{proposal.leverage}× leverage</span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
        <Stat label="Size" value={proposal.notional ? fmtUSD(proposal.notional) : "—"} />
        <Stat label="Stop" value={proposal.stop ? fmtPrice(proposal.stop) : "—"} />
        <Stat label="Target" value={proposal.target ? fmtPrice(proposal.target) : "—"} />
      </div>

      {proposal.rationale && (
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{proposal.rationale}</p>
      )}
      {proposal.risk && (
        <p className="mt-1 text-[12px] leading-relaxed text-amber-300/90">Risk: {proposal.risk}</p>
      )}

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <Button
          size="sm"
          variant={buy ? "positive" : "destructive"}
          disabled={pending}
          onClick={onExecute}
        >
          {pending ? "…" : "Execute"}
        </Button>
        <Button size="sm" variant="secondary" onClick={onAdjust}>
          Adjust
        </Button>
        <Button size="sm" variant="ghost" onClick={onSkip}>
          Skip
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2/50 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="tabular text-fg">{value}</div>
    </div>
  );
}
