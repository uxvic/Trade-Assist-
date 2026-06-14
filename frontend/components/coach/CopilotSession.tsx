"use client";

import { ArrowLeft, KeyRound, Radar } from "lucide-react";
import Link from "next/link";

import { InstrumentPicker } from "@/components/InstrumentPicker";
import { PriceChart } from "@/components/PriceChart";
import { TimeframeSelector } from "@/components/TimeframeSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fmtPrice } from "@/lib/format";
import { useAppStore } from "@/lib/store";

import { CoachOutput, ToolLine, WatchToggle } from "./CoachOutput";
import { PositionManager } from "./PositionManager";
import { TradeProposalCard } from "./TradeProposalCard";
import { useCopilot } from "./useCopilot";
import { useAISettings, useQuote } from "@/lib/api";

export function CopilotSession() {
  const co = useCopilot();
  const ai = useAISettings();
  const setStyle = useAppStore((s) => s.setCopilotStyle);
  const setSuggested = useAppStore((s) => s.setSuggestedTrade);
  const quote = useQuote(co.instrument.assetClass, co.instrument.symbol);
  const ready = ai.data?.configured ?? false;

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button size="sm" variant="secondary" onClick={() => setStyle("panel")}>
            <ArrowLeft size={14} /> Panel
          </Button>
          <InstrumentPicker />
        </div>
        <div className="flex items-center gap-3">
          <WatchToggle watching={co.watching} onToggle={() => co.setWatching(!co.watching)} />
          <TimeframeSelector />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Chart */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="pb-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-fg">
                  <Radar size={15} className="text-primary" /> Co-pilot · {co.instrument.name}
                </div>
                {quote.data && (
                  <div className="text-lg font-semibold tabular text-fg">
                    {fmtPrice(quote.data.last)}
                  </div>
                )}
              </div>
              <div className="h-[440px]">
                <PriceChart
                  assetClass={co.instrument.assetClass}
                  symbol={co.instrument.symbol}
                  timeframe={co.timeframe}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Co-pilot rail */}
        <div>
          <Card>
            <CardContent className="space-y-3">
              <h3 className="text-sm font-semibold text-fg">Co-pilot</h3>
              {ready ? (
                <>
                  <Button size="sm" className="w-full" disabled={co.busy} onClick={co.scan}>
                    {co.busy ? "Scanning the market…" : "Scan for a setup"}
                  </Button>
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
                </>
              ) : (
                <div className="rounded-xl border border-border bg-surface-2/30 p-3 text-center text-sm text-muted">
                  Add an AI key to wake the co-pilot.
                  <Link href="/settings" className="mt-2 block">
                    <Button size="sm" variant="secondary" className="w-full">
                      <KeyRound size={14} /> Add your AI key
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
