"use client";

import { Button } from "@/components/ui/button";
import { streamObserve } from "@/lib/api";
import { useAppStore } from "@/lib/store";

import { CoachOutput, ToolLine } from "./CoachOutput";
import { useCoachStream } from "./useCoachStream";

export function ReadsView() {
  const instrument = useAppStore((s) => s.instrument);
  const timeframe = useAppStore((s) => s.timeframe);
  const name = useAppStore((s) => s.name);
  const stream = useCoachStream();

  function getRead() {
    stream.run(
      streamObserve({
        symbol: instrument.symbol,
        assetClass: instrument.assetClass,
        timeframe,
        name,
        intensity: "reads",
      })
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        A calm, expert read of what's happening — trend, key levels, what to watch. No actions.
      </p>
      <Button size="sm" className="w-full" disabled={stream.busy} onClick={getRead}>
        {stream.busy ? "Reading the market…" : `Get a read on ${instrument.ticker}`}
      </Button>
      <ToolLine tools={stream.tools} />
      <CoachOutput text={stream.output} />
    </div>
  );
}
