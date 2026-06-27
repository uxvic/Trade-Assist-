"use client";

import { Brain, Loader2, ScrollText, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { TOOL_LABELS } from "@/components/coach/useCoachStream";
import { InstrumentBar } from "@/components/InstrumentBar";
import { Button } from "@/components/ui/button";
import {
  type TradeProposal,
  streamMarketAnalysis,
  useAISettings,
  useTradingRules,
} from "@/lib/api";
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

  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<Stage | null>(null);
  const [analyst, setAnalyst] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [tools, setTools] = useState<Record<Stage, string[]>>({ analyst: [], reviewer: [] });
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [usedRules, setUsedRules] = useState(false);
  const [proposal, setProposal] = useState<TradeProposal | null>(null);
  const [noKey, setNoKey] = useState(false);
  const [ran, setRan] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const rulesActive = !!rules.data?.use_rules && !!rules.data?.rules_text.trim();
  const configured = ai.data?.configured;

  async function run() {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setRan(true);
    setNoKey(false);
    setAnalyst("");
    setReviewer("");
    setTools({ analyst: [], reviewer: [] });
    setVerdict(null);
    setUsedRules(false);
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
          setNoKey(true);
          break;
        }
        if (ev.type === "stage" && ev.stage) {
          curStage = ev.stage;
          setActive(ev.stage);
          continue;
        }
        const stage: Stage = (ev.stage as Stage) ?? curStage;
        if (ev.type === "text" && ev.text) {
          const t = ev.text;
          if (stage === "reviewer") setReviewer((o) => o + t);
          else setAnalyst((o) => o + t);
        } else if (ev.type === "tool_call" && ev.name) {
          const name = ev.name;
          setTools((prev) =>
            prev[stage].includes(name) ? prev : { ...prev, [stage]: [...prev[stage], name] }
          );
          if (name === "propose_trade" && ev.input) setProposal(ev.input as TradeProposal);
        } else if (ev.type === "done") {
          if ("verdict" in ev) setVerdict((ev.verdict as Verdict) ?? null);
          if (ev.used_rules) setUsedRules(true);
        } else if (ev.type === "error") {
          setReviewer((o) => o + `\n\n⚠️ ${ev.message ?? "Something went wrong."}`);
        }
      }
    } catch (e) {
      setReviewer((o) => o + `\n\n⚠️ ${(e as Error).message}`);
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
            <Button onClick={run} disabled={busy || !configured} size="lg">
              {busy ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Analyzing…
                </>
              ) : ran ? (
                "Re-run analysis"
              ) : (
                `Analyze ${instrument.ticker}`
              )}
            </Button>
          </div>

          {/* Rules indicator */}
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

          {/* No-key state */}
          {(!configured || noKey) && (
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
          {ran && configured && !noKey && (
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
        <span className={cn("flex items-center gap-1.5 text-sm font-semibold text-fg")}>
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
