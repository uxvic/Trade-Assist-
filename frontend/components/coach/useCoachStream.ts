"use client";

import { useState } from "react";

import type { AgentEvent, TradeProposal } from "@/lib/api";

/** Shared streaming state for any coach surface (reads / suggestions / co-pilot). */
export function useCoachStream() {
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState("");
  const [tools, setTools] = useState<string[]>([]);
  const [proposal, setProposal] = useState<TradeProposal | null>(null);
  const [noKey, setNoKey] = useState(false);

  function reset() {
    setOutput("");
    setTools([]);
    setProposal(null);
  }

  async function run(
    gen: AsyncGenerator<AgentEvent>,
    onProposal?: (p: TradeProposal) => void
  ) {
    setBusy(true);
    reset();
    try {
      for await (const ev of gen) {
        if (ev.type === "no_key") {
          setNoKey(true);
          break;
        }
        if (ev.type === "text" && ev.text) {
          setOutput((o) => o + ev.text);
        } else if (ev.type === "tool_call" && ev.name) {
          setTools((t) => (t.includes(ev.name!) ? t : [...t, ev.name!]));
          if (ev.name === "propose_trade" && ev.input) {
            const p = ev.input as TradeProposal;
            setProposal(p);
            onProposal?.(p);
          }
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

  return { busy, output, tools, proposal, noKey, run, reset, setProposal };
}

export const TOOL_LABELS: Record<string, string> = {
  get_quote: "checked the price",
  get_chart: "read the chart",
  get_portfolio: "checked your account",
  propose_trade: "drafted a trade",
  explain_concept: "looked it up",
};
