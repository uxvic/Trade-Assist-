"use client";

import { Bot, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { useState } from "react";

import { CoachDock } from "@/components/coach/CoachDock";
import { BotConsole } from "@/components/strategy/BotConsole";
import { cn } from "@/lib/utils";

type Tab = "coach" | "bot";

/**
 * One tucked-away home for the two AI helpers. Consolidating Coach + Bot into a
 * single collapsible drawer (collapsed by default) keeps the hero chart and the
 * order ticket the focus — you open it only when you want a second opinion.
 */
export function AssistantPanel({
  open,
  onOpenChange,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}) {
  const [tab, setTab] = useState<Tab>("coach");

  function pick(next: Tab) {
    setTab(next);
    if (!open) onOpenChange(true);
  }

  return (
    <div className={cn("flex min-h-0 flex-col border-t border-border", className)}>
      {/* Header: consolidated Coach | Bot tabs + a clear show/hide control. */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-1.5">
        <div className="flex gap-0.5 rounded-lg border border-border bg-surface-2/40 p-1">
          <TabButton active={open && tab === "coach"} onClick={() => pick("coach")} icon={Sparkles} label="Coach" />
          <TabButton active={open && tab === "bot"} onClick={() => pick("bot")} icon={Bot} label="Bot" />
        </div>
        <button
          onClick={() => onOpenChange(!open)}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted transition-colors hover:text-fg"
        >
          {open ? (
            <>
              Hide <ChevronDown size={15} />
            </>
          ) : (
            <>
              Show <ChevronUp size={15} />
            </>
          )}
        </button>
      </div>

      {open && (
        <div className={cn("min-h-0 flex-1", tab === "coach" && "overflow-y-auto")}>
          {tab === "coach" ? <CoachDock /> : <BotConsole />}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Bot;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"
      )}
    >
      <Icon size={13} className={active ? "text-accent" : undefined} />
      {label}
    </button>
  );
}
