"use client";

import { Menu, Wallet } from "lucide-react";

import { NotificationCenter } from "@/components/NotificationCenter";
import { Badge } from "@/components/ui/badge";
import { useAccount } from "@/lib/api";
import { fmtUSD } from "@/lib/format";

const TITLES: Record<string, { title: string; subtitle: string }> = {
  "/home": { title: "Home", subtitle: "Here's where you are" },
  "/trade": { title: "Trade", subtitle: "Practice with real prices" },
  "/bot": { title: "Bot", subtitle: "How the strategy bot is doing" },
  "/learn": { title: "Learn", subtitle: "Build the basics, step by step" },
  "/coach": { title: "Coach", subtitle: "Ask anything, anytime" },
  "/settings": { title: "Settings", subtitle: "Your account & AI coach" },
};

export function TopBar({ pathname, onMenu }: { pathname: string; onMenu?: () => void }) {
  const account = useAccount();
  const key = Object.keys(TITLES).find((k) => pathname.startsWith(k)) ?? "/home";
  const { title, subtitle } = TITLES[key];

  return (
    <header className="flex h-16 items-center justify-between gap-2 border-b border-border px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={onMenu}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted hover:text-fg md:hidden"
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold leading-tight text-fg">{title}</h1>
          <p className="truncate text-xs text-muted">{subtitle}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <Badge variant="warn" className="hidden sm:inline-flex">
          Practice money
        </Badge>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2 sm:px-3">
          <Wallet size={16} className="text-muted" />
          <span className="text-sm font-semibold tabular text-fg">
            {account.data ? fmtUSD(account.data.equity) : "—"}
          </span>
        </div>
        <NotificationCenter />
      </div>
    </header>
  );
}
