"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlaceOrder, useQuote } from "@/lib/api";
import { fmtNumber, fmtPrice, fmtUSD } from "@/lib/format";
import { cn } from "@/lib/utils";

const CHIPS = [25, 100, 500];

export function OrderTicket({
  symbol,
  name,
  ticker,
  assetClass,
}: {
  symbol: string;
  name: string;
  ticker: string;
  assetClass: string;
}) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("100");
  const { data: quote } = useQuote(assetClass, symbol);
  const place = usePlaceOrder();

  const price = quote ? Number(quote.last) : null;
  const usd = Number(amount) || 0;
  const estQty = price ? usd / price : null;

  function submit() {
    if (usd <= 0) {
      toast.error("Enter an amount first.");
      return;
    }
    place.mutate(
      { symbol, asset_class: assetClass, side, type: "market", notional: usd },
      {
        onSuccess: (order) => {
          if (order.status === "filled") {
            toast.success(`${side === "buy" ? "Bought" : "Sold"} ${fmtUSD(usd)} of ${name}`, {
              description: `Filled at ${fmtUSD(order.avg_fill_price ?? 0)} per ${ticker}`,
            });
          } else if (order.status === "rejected") {
            const reason =
              order.risk_assessment?.reasons?.[0] ?? order.reject_reason ?? "Order rejected.";
            toast.error("That didn't go through", { description: reason });
          } else {
            toast(`Order ${order.status}`);
          }
        },
        onError: (e) => toast.error("Something went wrong", { description: (e as Error).message }),
      }
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Buy / Sell toggle */}
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface-2/40 p-1">
        <button
          onClick={() => setSide("buy")}
          className={cn(
            "rounded-lg py-2 text-sm font-semibold transition-colors",
            side === "buy" ? "bg-positive text-white" : "text-muted hover:text-fg"
          )}
        >
          Buy
        </button>
        <button
          onClick={() => setSide("sell")}
          className={cn(
            "rounded-lg py-2 text-sm font-semibold transition-colors",
            side === "sell" ? "bg-negative text-white" : "text-muted hover:text-fg"
          )}
        >
          Sell
        </button>
      </div>

      {/* Amount */}
      <div>
        <label className="text-xs font-medium text-muted">How much (in dollars)?</label>
        <div className="relative mt-1.5">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
          <Input
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-12 pl-7 text-lg font-semibold"
          />
        </div>
        <div className="mt-2 flex gap-2">
          {CHIPS.map((c) => (
            <button
              key={c}
              onClick={() => setAmount(String(c))}
              className="flex-1 rounded-lg border border-border bg-surface-2/40 py-1.5 text-xs font-medium text-muted transition-colors hover:border-primary/40 hover:text-fg"
            >
              ${c}
            </button>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="rounded-xl border border-border bg-surface-2/40 px-4 py-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted">You'll {side === "buy" ? "get" : "sell"}</span>
          <span className="font-semibold tabular text-fg">
            {estQty !== null ? `≈ ${fmtNumber(estQty, 6)} ${ticker}` : "—"}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-muted">Current price</span>
          <span className="tabular text-fg">{price !== null ? fmtPrice(price) : "—"}</span>
        </div>
      </div>

      <Button
        variant={side === "buy" ? "positive" : "destructive"}
        size="lg"
        disabled={place.isPending}
        onClick={submit}
      >
        {place.isPending
          ? "Placing…"
          : `${side === "buy" ? "Buy" : "Sell"} ${fmtUSD(usd)} of ${name}`}
      </Button>
      <p className="text-center text-xs text-muted">
        Practice money · checked by your risk manager before it goes through
      </p>
    </div>
  );
}
