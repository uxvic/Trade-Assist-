"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { type PlaceOrderInput, usePlaceOrder, usePositions } from "@/lib/api";
import { fmtSignedUSD, pnlTone } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function PositionManager() {
  const instrument = useAppStore((s) => s.instrument);
  const { data } = usePositions();
  const place = usePlaceOrder();

  const pos = data?.find((p) => p.symbol === instrument.symbol);
  if (!pos) return null;

  const qty = Number(pos.qty);
  const avg = Number(pos.avg_cost);
  const tone = pnlTone(pos.unrealized_pnl);

  function act(input: PlaceOrderInput, label: string) {
    place.mutate(input, {
      onSuccess: (o) =>
        o.status !== "rejected"
          ? toast.success(label)
          : toast.error("Didn't go through", {
              description: o.risk_assessment?.reasons?.[0] ?? o.reject_reason ?? "",
            }),
      onError: (e) => toast.error("Error", { description: (e as Error).message }),
    });
  }

  const base = { symbol: instrument.symbol, asset_class: instrument.assetClass } as const;

  return (
    <div className="rounded-xl border border-border bg-surface-2/30 p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-fg">Managing {instrument.ticker}</span>
        <span
          className={cn(
            "tabular font-semibold",
            tone === "positive" && "text-positive",
            tone === "negative" && "text-negative",
            tone === "flat" && "text-muted"
          )}
        >
          {fmtSignedUSD(pos.unrealized_pnl)}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          disabled={place.isPending}
          onClick={() =>
            act({ ...base, side: "sell", type: "stop", qty, stop_price: avg }, "Stop set at breakeven")
          }
        >
          Stop @ B/E
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={place.isPending}
          onClick={() => act({ ...base, side: "sell", type: "market", qty: qty / 2 }, "Took partial profit")}
        >
          Take ½
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={place.isPending}
          onClick={() => act({ ...base, side: "sell", type: "market", qty }, "Closed position")}
        >
          Exit
        </Button>
      </div>
    </div>
  );
}
