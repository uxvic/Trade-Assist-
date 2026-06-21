"use client";

import { ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { streamChat } from "@/lib/api";
import { useAppStore } from "@/lib/store";

import { CoachOutput, ToolLine } from "./CoachOutput";
import { useCoachStream } from "./useCoachStream";

export function SuggestionsView() {
  const instrument = useAppStore((s) => s.instrument);
  const timeframe = useAppStore((s) => s.timeframe);
  const setSuggested = useAppStore((s) => s.setSuggestedTrade);
  const stream = useCoachStream();

  function suggest() {
    stream.run(
      streamChat(
        `Suggest one specific trade for ${instrument.name} (${instrument.symbol}) on the ${timeframe} chart. ` +
          "Use the propose_trade tool with side, dollar size, stop, target, rationale and the key risk.",
        [],
        "suggestions"
      ),
      (p) => {
        setSuggested({
          ...p,
          symbol: p.symbol ?? instrument.symbol,
          asset_class: p.asset_class ?? instrument.assetClass,
        });
        toast.success("Idea sent to your order ticket — review & confirm");
      }
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        A concrete idea that fills your order ticket on the left. You review, tweak, and confirm.
      </p>
      <Button size="sm" className="w-full" disabled={stream.busy} onClick={suggest}>
        {stream.busy ? "Thinking…" : `Suggest a trade for ${instrument.ticker}`}
      </Button>
      <ToolLine tools={stream.tools} />
      <CoachOutput text={stream.output} />
      {stream.proposal?.side && !stream.busy && (
        <div className="flex items-center gap-1.5 text-xs text-primary">
          <ArrowRight size={13} /> Filled in your order form below — review and place it.
        </div>
      )}
    </div>
  );
}
