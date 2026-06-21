"use client";

import { useState } from "react";

import { streamChat, type TradeProposal } from "@/lib/api";
import { useAppStore } from "@/lib/store";

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  tools: string[];
}

/**
 * Shared multi-turn coach chat: a message thread + a send loop that streams the
 * answer, keeps history, clears the input, and surfaces a drafted trade.
 * Reused by the `/` ask bar, the click-a-point popover, and the full Coach page.
 */
export function useCoachChat(opts?: {
  /** Prepended to each user message sent to the model (e.g. chart context). */
  contextPrefix?: () => string;
  onProposal?: (p: TradeProposal) => void;
}) {
  const intensity = useAppStore((s) => s.coachIntensity);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [noKey, setNoKey] = useState(false);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    // Show the user's own words; send the context-prefixed version to the model.
    setMessages((prev) => [
      ...prev,
      { role: "user", content: q, tools: [] },
      { role: "assistant", content: "", tools: [] },
    ]);
    setBusy(true);
    const prefixed = (opts?.contextPrefix?.() ?? "") + q;
    try {
      for await (const ev of streamChat(prefixed, history, intensity)) {
        if (ev.type === "no_key") {
          setNoKey(true);
          break;
        }
        if (ev.type === "tool_call" && ev.name === "propose_trade" && ev.input) {
          opts?.onProposal?.(ev.input as TradeProposal);
        }
        setMessages((prev) => {
          const next = [...prev];
          const a = next[next.length - 1];
          if (ev.type === "text" && ev.text) a.content += ev.text;
          else if (ev.type === "tool_call" && ev.name) a.tools = [...a.tools, ev.name];
          else if (ev.type === "error") a.content += `\n\n⚠️ ${ev.message ?? "Something went wrong."}`;
          return next;
        });
      }
    } catch (e) {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1].content += `\n\n⚠️ ${(e as Error).message}`;
        return next;
      });
    } finally {
      setBusy(false);
    }
  }

  return { messages, input, setInput, send, busy, noKey };
}
