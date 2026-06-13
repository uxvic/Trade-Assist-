"use client";

import { TrendingUp, Wallet } from "lucide-react";

import { MarketOverview } from "@/components/MarketOverview";
import { NextStepCard } from "@/components/NextStepCard";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount, useSymbols } from "@/lib/api";
import { fmtSignedUSD, fmtUSD, pnlTone } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const START = 100000;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function HomePage() {
  const name = useAppStore((s) => s.name);
  const account = useAccount();
  const symbols = useSymbols();

  const equity = account.data ? Number(account.data.equity) : null;
  const pnl = equity !== null ? equity - START : null;
  const tone = pnl !== null ? pnlTone(pnl) : "flat";

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h2 className="text-2xl font-semibold text-fg">
        {greeting()}
        {name ? `, ${name}` : ""}.
      </h2>
      <p className="mt-1 text-muted">Here's where you are today.</p>

      {/* Stat cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-muted">
              <Wallet size={20} />
            </div>
            <div>
              <div className="text-sm text-muted">Practice account value</div>
              {equity !== null ? (
                <div className="text-2xl font-semibold tabular text-fg">{fmtUSD(equity)}</div>
              ) : (
                <Skeleton className="mt-1 h-7 w-28" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4">
            <div
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-xl",
                tone === "negative" ? "bg-negative/15 text-negative" : "bg-positive/15 text-positive"
              )}
            >
              <TrendingUp size={20} />
            </div>
            <div>
              <div className="text-sm text-muted">Total profit / loss</div>
              {pnl !== null ? (
                <div
                  className={cn(
                    "text-2xl font-semibold tabular",
                    tone === "positive" && "text-positive",
                    tone === "negative" && "text-negative",
                    tone === "flat" && "text-fg"
                  )}
                >
                  {fmtSignedUSD(pnl)}
                </div>
              ) : (
                <Skeleton className="mt-1 h-7 w-28" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Next step */}
      <div className="mt-4">
        <NextStepCard />
      </div>

      {/* Live markets */}
      <Card className="mt-4">
        <CardContent>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-fg">Live markets</h3>
            <span className="text-xs text-muted">Tap a coin to trade it</span>
          </div>
          {symbols.data ? (
            <MarketOverview symbols={symbols.data.symbols} />
          ) : (
            <div className="space-y-2 py-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
