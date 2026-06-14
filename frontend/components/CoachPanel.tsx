"use client";

import { KeyRound, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  type AgentEvent,
  type TradeProposal,
  streamChat,
  streamObserve,
  useAISettings,
  usePlaceOrder,
} from "@/lib/api";
import { fmtPrice, fmtUSD } from "@/lib/format";
import { type CoachIntensity, useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const INTENSITIES: { id: CoachIntensity; label: string }[] = [
  { id: "reads", label: "Reads" },
  { id: "suggestions", label: "Suggestions" },
  { id: "copilot", label: "Co-pilot" },
];

const TOOL_LABELS: Record<string, string> = {
  get_quote: "checked the price",
  get_chart: "read the chart",
  get_portfolio: "checked your account",
  propose_trade: "drafted a trade",
  explain_concept: "looked it up",
};

export function CoachPanel() {
  const instrument = useAppStore((s) => s.instrument);
  const timeframe = useAppStore((s) => s.timeframe);
  const name = useAppStore((s) => s.name);
  const intensity = useAppStore((s) => s.coachIntensity);
  const setIntensity = useAppStore((s) => s.setCoachIntensity);

  const ai = useAISettings();
  const place = usePlaceOrder();

  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState("");
  const [tools, setTools] = useState<string[]>([]);
  const [proposal, setProposal] = useState<TradeProposal | null>(null);
  const [ask, setAsk] = useState("");
  const [noKey, setNoKey] = useState(false);

  async function consume(gen: AsyncGenerator<AgentEvent>) {
    setBusy(true);
    setOutput("");
    setTools([]);
    setProposal(null);
    try {
      for await (const ev of gen) {
        if (ev.type === "no_key") {
          setNoKey(true);
          break;
        }
        if (ev.type === "text" && ev.text) setOutput((o) => o + ev.text);
        else if (ev.type === "tool_call" && ev.name) {
          setTools((t) => (t.includes(ev.name!) ? t : [...t, ev.name!]));
          if (ev.name === "propose_trade" && ev.input) setProposal(ev.input as TradeProposal);
        } else if (ev.type === "error") {
          setOutput((o) => o + `\n\n⚠️ ${ev.message ?? "Something went wrong."}`);
        }
      }
    } catch (e) {
      setOutput((o) => o + `\n\n⚠️ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function getRead() {
    consume(
      streamObserve({
        symbol: instrument.symbol,
        assetClass: instrument.assetClass,
        timeframe,
        name,
        intensity,
      })
    );
  }

  function sendAsk() {
    const q = ask.trim();
    if (!q || busy) return;
    setAsk("");
    consume(
      streamChat(
        `About ${instrument.name} (${instrument.symbol}) on the ${timeframe} chart: ${q}`,
        [],
        intensity
      )
    );
  }

  function applyProposal() {
    if (!proposal?.side) return;
    const notional = proposal.notional ?? 100;
    place.mutate(
      {
        symbol: proposal.symbol ?? instrument.symbol,
        asset_class: proposal.asset_class ?? instrument.assetClass,
        side: proposal.side,
        type: "market",
        notional,
      },
      {
        onSuccess: (o) =>
          o.status === "filled"
            ? toast.success(`Applied: ${proposal.side} ${fmtUSD(notional)} of ${instrument.name}`)
            : toast.error("Didn't go through", {
                description: o.risk_assessment?.reasons?.[0] ?? o.reject_reason ?? "",
              }),
        onError: (e) => toast.error("Error", { description: (e as Error).message }),
      }
    );
  }

  if (ai.isLoading) return null;

  if (!ai.data?.configured || noKey) {
    return (
      <Card>
        <CardContent className="text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Sparkles size={20} />
          </div>
          <h3 className="text-sm font-semibold text-fg">Your coach is asleep</h3>
          <p className="mt-1 text-sm text-muted">
            Add an AI key to get live expert reads and trade ideas right here.
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

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-fg">
            <Sparkles size={15} />
          </div>
          <h3 className="text-sm font-semibold text-fg">Coach's read</h3>
        </div>

        {/* Intensity selector */}
        <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-surface-2/40 p-1">
          {INTENSITIES.map((it) => (
            <button
              key={it.id}
              onClick={() => setIntensity(it.id)}
              className={cn(
                "rounded-md py-1.5 text-xs font-medium transition-colors",
                intensity === it.id ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"
              )}
            >
              {it.label}
            </button>
          ))}
        </div>

        <Button size="sm" className="w-full" disabled={busy} onClick={getRead}>
          {busy ? "Reading the market…" : `Get a read on ${instrument.ticker}`}
        </Button>

        {tools.length > 0 && (
          <div className="text-xs text-muted">
            {tools.map((t) => TOOL_LABELS[t] ?? t).join(" · ")}
          </div>
        )}

        {output && (
          <div className="whitespace-pre-wrap rounded-xl border border-border bg-surface-2/30 p-3 text-[13.5px] leading-relaxed text-fg">
            {output}
          </div>
        )}

        {proposal?.side && (
          <ProposalCard proposal={proposal} onApply={applyProposal} pending={place.isPending} />
        )}

        {/* Quick ask */}
        <div className="flex items-center gap-2 pt-1">
          <Input
            placeholder={`Ask about ${instrument.ticker}…`}
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendAsk()}
            disabled={busy}
            className="h-9 text-sm"
          />
          <Button size="icon" className="h-9 w-9" disabled={busy} onClick={sendAsk}>
            <Send size={15} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProposalCard({
  proposal,
  onApply,
  pending,
}: {
  proposal: TradeProposal;
  onApply: () => void;
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
          {buy ? "Buy" : "Sell"} idea
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

      <Button
        size="sm"
        variant={buy ? "positive" : "destructive"}
        className="mt-3 w-full"
        disabled={pending}
        onClick={onApply}
      >
        {pending ? "Placing…" : "Apply this trade"}
      </Button>
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
