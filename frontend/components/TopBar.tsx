"use client";

import { Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useAccount } from "@/lib/api";
import { fmtUSD } from "@/lib/format";

const TITLES: Record<string, { title: string; subtitle: string }> = {
  "/home": { title: "Home", subtitle: "Here's where you are" },
  "/trade": { title: "Trade", subtitle: "Practice with real prices" },
  "/learn": { title: "Learn", subtitle: "Build the basics, step by step" },
  "/coach": { title: "Coach", subtitle: "Ask anything, anytime" },
  "/settings": { title: "Settings", subtitle: "Your account & AI coach" },
};

export function TopBar({ pathname }: { pathname: string }) {
  const account = useAccount();
  const key = Object.keys(TITLES).find((k) => pathname.startsWith(k)) ?? "/home";
  const { title, subtitle } = TITLES[key];

  return (
    <header className="flex h-16 items-center justify-between border-b border-border px-6">
      <div>
        <h1 className="text-lg font-semibold leading-tight text-fg">{title}</h1>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>

      <div className="flex items-center gap-3">
        <Badge variant="warn">Practice money</Badge>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
          <Wallet size={16} className="text-muted" />
          <span className="text-sm font-semibold tabular text-fg">
            {account.data ? fmtUSD(account.data.equity) : "—"}
          </span>
        </div>
      </div>
    </header>
  );
}
