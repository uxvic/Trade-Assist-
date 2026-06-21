"use client";

import { Send } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { ChatMsg } from "./useCoachChat";

const TOOL_LABELS: Record<string, string> = {
  get_quote: "checked the live price",
  get_chart: "looked at the chart",
  get_portfolio: "checked your account",
  propose_trade: "drafted a trade",
  place_paper_order: "prepared an order",
  explain_concept: "looked it up",
};

/**
 * A compact chat surface: the conversation on top, the input pinned at the
 * BOTTOM (below the answers). Sending clears the box and the question joins the
 * thread. State comes from useCoachChat so every coach surface behaves the same.
 */
export function ChatThread({
  messages,
  input,
  setInput,
  send,
  busy,
  noKey,
  chips,
  placeholder = "Ask the coach…",
  scrollClassName,
}: {
  messages: ChatMsg[];
  input: string;
  setInput: (v: string) => void;
  send: (t: string) => void;
  busy: boolean;
  noKey: boolean;
  chips?: string[];
  placeholder?: string;
  scrollClassName?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col">
      {messages.length > 0 && (
        <div ref={scrollRef} className={cn("overflow-y-auto pr-0.5", scrollClassName ?? "max-h-[42vh]")}>
          <div className="flex flex-col gap-2.5">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" && "justify-end")}>
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-relaxed",
                    m.role === "user"
                      ? "bg-primary text-primary-fg"
                      : "border border-border bg-surface-2/40 text-fg"
                  )}
                >
                  {m.tools.length > 0 && (
                    <div className="mb-1 text-[11px] text-muted">
                      {Array.from(new Set(m.tools))
                        .map((t) => TOOL_LABELS[t] ?? t)
                        .join(" · ")}
                    </div>
                  )}
                  {m.content || (busy && i === messages.length - 1 ? "…" : "")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {chips && messages.length === 0 && (
        <div className="flex flex-wrap gap-1.5 pb-0.5">
          {chips.map((c) => (
            <button
              key={c}
              onClick={() => send(c)}
              disabled={busy}
              className="rounded-lg border border-border bg-surface-2/40 px-2 py-1 text-[11px] text-fg transition-colors hover:border-primary/40 disabled:opacity-50"
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {noKey && (
        <div className="px-1 py-1.5 text-xs text-muted">
          Add an AI key in{" "}
          <Link href="/settings" className="text-primary underline">
            Settings
          </Link>{" "}
          to use the coach.
        </div>
      )}

      <div className="mt-1.5 flex items-center gap-1.5">
        <Input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send(input);
          }}
          placeholder={placeholder}
          disabled={busy}
          className="h-9"
        />
        <Button
          size="icon"
          className="h-9 w-9 shrink-0"
          disabled={busy || !input.trim()}
          onClick={() => send(input)}
        >
          <Send size={16} />
        </Button>
      </div>
    </div>
  );
}
