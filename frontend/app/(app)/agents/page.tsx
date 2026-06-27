"use client";

import { Activity, Brain, Loader2, ScrollText, ShieldCheck, Sparkles, Square } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { TOOL_LABELS } from "@/components/coach/useCoachStream";
import { InstrumentBar } from "@/components/InstrumentBar";
import { Button } from "@/components/ui/button";
import {
  type TradeProposal,
  streamMarketAnalysis,
  useAISettings,
  useStrategyAnalysis,
  useTradingRules,
} from "@/lib/api";
import { fmtPrice } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type Stage = "analyst" | "reviewer";
type Verdict = "CONSIDER" | "WAIT" | "AVOID" | null;

const VERDICT_STYLE: Record<string, string> = {
  CONSIDER: "bg-positive/15 text-positive",
  WAIT: "bg-amber-500/15 text-amber-400",
  AVOID: "bg-negative/15 text-negative",
};

export default function AgentsPage() {
  const instrument = useAppStore((s) => s.instrument);
  const timeframe = useAppStore((s) => s.timeframe);
  const setSuggested = useAppStore((s) => s.setSuggestedTrade);
  const router = useRouter();
  const ai = useAISettings();
  const rules = useTradingRules();
  const strategy = useStrategyAnalysis(instrument.assetClass, instrument.symbol);

  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<Stage | null>(null);
  const [analyst, setAnalyst] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [tools, setTools] = useState<Record<Stage, string[]>>({ analyst: [], reviewer: [] });
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [usedRules, setUsedRules] = useState(false);
  const [usage, setUsage] = useState<{ input_tokens: number; output_tokens: number } | null>(null);
  const [proposal, setProposal] = useState<TradeProposal | null>(null);
  const [ran, setRan] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Cancel any in-flight stream when leaving the page (don't leak the server run).
  useEffect(() => () => abortRef.current?.abort(), []);

  const rulesActive = !!rules.data?.use_rules && !!rules.data?.rules_text.trim();
  const configured = ai.data?.configured;
  const sd = strategy.data && strategy.data.symbol === instrument.symbol ? strategy.data : null;

  function stop() {
    abortRef.current?.abort();
    setBusy(false);
    setActive(null);
  }

  async function run() {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setRan(true);
    setAnalyst("");
    setReviewer("");
    setTools({ analyst: [], reviewer: [] });
    setVerdict(null);
    setUsedRules(false);
    setUsage(null);
    setProposal(null);
    setActive("analyst");

    let curStage: Stage = "analyst";
    try {
      for await (const ev of streamMarketAnalysis(
        instrument.symbol,
        instrument.assetClass,
        timeframe,
        ac.signal
      )) {
        if (ev.type === "no_key") {
          toast.error("Add an AI key in Settings to run the agents.");
          break;
        }
        if (ev.type === "stage" && ev.stage) {
          curStage = ev.stage;
          setActive(ev.stage);
          continue;
        }
        const stage: Stage = (ev.stage as Stage) ?? curStage;
        const append = stage === "reviewer" ? setReviewer : setAnalyst;
        if (ev.type === "text" && ev.text) {
          const t = ev.text;
          append((o) => o + t);
        } else if (ev.type === "tool_call" && ev.name) {
          const name = ev.name;
          setTools((prev) =>
            prev[stage].includes(name) ? prev : { ...prev, [stage]: [...prev[stage], name] }
          );
          if (name === "propose_trade" && ev.input) setProposal(ev.input as TradeProposal);
        } else if (ev.type === "done") {
          if ("verdict" in ev) setVerdict((ev.verdict as Verdict) ?? null);
          if (ev.used_rules) setUsedRules(true);
          if (ev.usage) setUsage(ev.usage);
        } else if (ev.type === "error") {
          append((o) => o + `\n\n⚠️ ${ev.message ?? "Something went wrong."}`);
        }
      }
    } catch (e) {
      // A user-initiated abort is not an error.
      if ((e as Error).name !== "AbortError") {
        setReviewer((o) => o + `\n\n⚠️ ${(e as Error).message}`);
      }
    } finally {
      setBusy(false);
      setActive(null);
    }
  }

  function sendToTicket() {
    if (!proposal) return;
    setSuggested({ ...proposal, symbol: instrument.symbol, asset_class: instrument.assetClass });
    toast.success("Filled in your order form", {
      description: "Review the size on the Trade screen and place it when you're ready.",
    });
    router.push("/trade");
  }

  const trendCls = sd
    ? sd.trend.direction === "up"
      ? "bg-positive/15 text-positive"
      : sd.trend.direction === "down"
        ? "bg-negative/15 text-negative"
        : "bg-surface-2/60 text-muted"
    : "";

  return (
    <div className="flex h-full flex-col">
      <InstrumentBar />

      <div className="flex-1 overflow-y-auto px-4 py-5 lg:px-6">
        <div className="mx-auto max-w-3xl">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold text-fg">
                <Brain size={20} className="text-primary" /> Market-analysis agents
              </h2>
              <p className="mt-1 text-sm text-muted">
                An <span className="text-fg">Analyst</span> studies {instrument.name} and a senior{" "}
                <span className="text-fg">Reviewer</span> double-checks it, then gives you one clear
                recommendation. Educational — not financial advice.
              </p>
            </div>
            {busy ? (
              <Button onClick={stop} size="lg" variant="secondary">
                <Square size={14} /> Stop
              </Button>
            ) : (
              <Button onClick={run} disabled={ai.isLoading || !configured} size="lg">
                {ran ? "Re-run analysis" : `Analyze ${instrument.ticker}`}
              </Button>
            )}
          </div>

          {/* Rules indicator (only once we know the answer — no loading flash) */}
          {rules.data && (
            <div className="mt-3 flex items-center gap-2 text-xs">
              <ScrollText size={13} className="text-muted" />
              {rulesActive ? (
                <span className="text-fg">
                  Using <span className="font-medium">your trading rules</span>.{" "}
                  <Link href="/settings" className="text-primary hover:underline">
                    Edit
                  </Link>
                </span>
              ) : (
                <span className="text-muted">
                  Using the agent&apos;s own method.{" "}
                  <Link href="/settings" className="text-primary hover:underline">
                    Add your trading rules
                  </Link>{" "}
                  to have it follow yours.
                </span>
              )}
            </div>
          )}

          {/* What the deterministic engine sees — grounds the agents (free, polled) */}
          {sd && (
            <div className="mt-4 rounded-xl border border-border bg-surface-2/30 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Activity size={13} className="text-muted" /> What the engine sees
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                <span className={cn("rounded px-1.5 py-0.5 font-medium capitalize", trendCls)}>
                  {sd.trend.direction} {(sd.trend.confidence * 100).toFixed(0)}%
                </span>
                <span className="text-muted">· {sd.levels.length} key levels</span>
                <span className="text-muted">
                  · {sd.signal.state === "buy" ? "buy setup" : "standing down"}
                </span>
                <span className="ml-auto tabular text-muted">{fmtPrice(sd.current_price)}</span>
              </div>
            </div>
          )}

          {/* No-key state — only once we know there's no key (not while loading) */}
          {ai.data && !configured && (
            <div className="mt-4 rounded-xl border border-border bg-surface-2/40 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-fg">
                <Sparkles size={15} className="text-primary" /> Wake up your agents
              </div>
              <p className="mt-1 text-sm text-muted">
                The agents need an AI key to run. Add one on the{" "}
                <Link href="/settings" className="text-primary hover:underline">
                  Settings
                </Link>{" "}
                page.
              </p>
            </div>
          )}

          {/* Results */}
          {ran && configured && (
            <div className="mt-5 space-y-4">
              <StageCard
                title="Analyst"
                icon={<Brain size={15} />}
                accent="text-primary"
                active={active === "analyst"}
                tools={tools.analyst}
                text={analyst}
                placeholder="Reading the trend, levels and momentum…"
              />
              <StageCard
                title="Reviewer"
                icon={<ShieldCheck size={15} />}
                accent="text-accent"
                active={active === "reviewer"}
                tools={tools.reviewer}
                text={reviewer}
                placeholder="Waiting for the analyst to finish…"
                badge={
                  verdict ? (
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                        VERDICT_STYLE[verdict] ?? "bg-surface-2/60 text-muted"
                      )}
                    >
                      {verdict}
                    </span>
                  ) : null
                }
                footer={
                  <>
                    {usedRules && (
                      <p className="text-[11px] text-muted">
                        ✓ Judged against your own trading rules.
                      </p>
                    )}
                    {proposal && (
                      <Button size="sm" variant="secondary" onClick={sendToTicket}>
                        Send to order form
                      </Button>
                    )}
                  </>
                }
              />

              {usage && !busy && (
                <p className="text-center text-[11px] text-muted">
                  Used ~{(usage.input_tokens + usage.output_tokens).toLocaleString()} tokens · the
                  Reviewer runs on a deeper, costlier model.
                </p>
              )}
            </div>
          )}

          {!ran && configured && (
            <div className="mt-6 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
              Press <span className="font-medium text-fg">Analyze {instrument.ticker}</span> to send
              the two agents in.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StageCard({
  title,
  icon,
  accent,
  active,
  tools,
  text,
  placeholder,
  badge,
  footer,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  active: boolean;
  tools: string[];
  text: string;
  placeholder: string;
  badge?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface/70 p-4">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
          <span className={accent}>{icon}</span>
          {title}
        </span>
        {badge}
        {active && <Loader2 size={13} className="ml-auto animate-spin text-muted" />}
      </div>

      {tools.length > 0 && (
        <p className="mt-1.5 text-[11px] text-muted">
          {tools.map((t) => TOOL_LABELS[t] ?? t).join(" · ")}
        </p>
      )}

      <div className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-fg">
        {text || <span className="text-muted">{active ? placeholder : "—"}</span>}
      </div>

      {footer && <div className="mt-3 flex items-center justify-between gap-2">{footer}</div>}
    </div>
  );
}
