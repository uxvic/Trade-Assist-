"use client";

import { KeyRound, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { streamChat, useAISettings } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  content: string;
  tools: string[];
}

const EXAMPLES = [
  "What's happening with Bitcoin right now?",
  "What does a candle on the chart mean?",
  "Is putting $100 into one coin a sensible size?",
  "I'm nervous about a drop — how should I think about it?",
];

const TOOL_LABELS: Record<string, string> = {
  get_quote: "checked the live price",
  get_chart: "looked at the chart",
  get_portfolio: "checked your account",
  place_paper_order: "prepared an order",
  explain_concept: "looked it up",
};

export function CoachChat() {
  const ai = useAISettings();
  const intensity = useAppStore((s) => s.coachIntensity);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [noKey, setNoKey] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [
      ...prev,
      { role: "user", content: q, tools: [] },
      { role: "assistant", content: "", tools: [] },
    ]);
    setBusy(true);
    try {
      for await (const ev of streamChat(q, history, intensity)) {
        if (ev.type === "no_key") {
          setNoKey(true);
          break;
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

  if (ai.isLoading) {
    return <div className="flex h-full items-center justify-center text-sm text-muted">Loading…</div>;
  }

  if (!ai.data?.configured || noKey) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-soft">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Sparkles size={26} />
          </div>
          <h2 className="text-xl font-semibold text-fg">Wake up your coach</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            Your AI coach needs an API key to come online. Add one in Settings (it stays on your
            machine) and it'll be ready to explain the markets and guide your trades.
          </p>
          <Link href="/settings">
            <Button className="mt-6 w-full" size="lg">
              <KeyRound size={18} /> Add your AI key
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          {messages.length === 0 && (
            <div className="mt-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-fg">
                <Sparkles size={26} />
              </div>
              <h2 className="text-lg font-semibold text-fg">I'm your trading coach</h2>
              <p className="mt-1 text-sm text-muted">
                Ask me anything — I'll explain in plain language and help you decide for yourself.
              </p>
              <div className="mx-auto mt-5 grid max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => send(ex)}
                    className="rounded-xl border border-border bg-surface p-3 text-left text-sm text-fg transition-colors hover:border-primary/40 hover:bg-surface-2/60"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={cn("flex gap-3", m.role === "user" && "justify-end")}>
              {m.role === "assistant" && (
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-fg">
                  <Sparkles size={16} />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed",
                  m.role === "user"
                    ? "bg-primary text-primary-fg"
                    : "border border-border bg-surface text-fg"
                )}
              >
                {m.tools.length > 0 && (
                  <div className="mb-1.5 text-xs text-muted">
                    {Array.from(new Set(m.tools))
                      .map((t) => TOOL_LABELS[t] ?? t)
                      .join(" · ")}
                  </div>
                )}
                <div className="whitespace-pre-wrap">
                  {m.content || (busy && i === messages.length - 1 ? "…" : "")}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-border p-4">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <Input
            placeholder="Ask your coach anything…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            disabled={busy}
            className="h-12"
          />
          <Button size="icon" className="h-12 w-12" disabled={busy} onClick={() => send(input)}>
            <Send size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
}
