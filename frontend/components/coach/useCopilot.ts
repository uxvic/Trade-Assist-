"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { type TradeProposal, streamObserve, usePlaceOrder } from "@/lib/api";
import { fmtUSD } from "@/lib/format";
import { useAppStore } from "@/lib/store";

import { useCoachStream } from "./useCoachStream";

/** Shared co-pilot orchestration: scan, optional live watch, execute, used by
 * both the in-desk panel and the takeover session. */
export function useCopilot() {
  const instrument = useAppStore((s) => s.instrument);
  const timeframe = useAppStore((s) => s.timeframe);
  const name = useAppStore((s) => s.name);
  const stream = useCoachStream();
  const place = usePlaceOrder();

  const [watching, setWatching] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const scan = useCallback(() => {
    stream.run(
      streamObserve({
        symbol: instrument.symbol,
        assetClass: instrument.assetClass,
        timeframe,
        name,
        intensity: "copilot",
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrument.symbol, instrument.assetClass, timeframe, name]);

  useEffect(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    if (watching) {
      scan();
      timer.current = setInterval(scan, 30000);
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [watching, scan]);

  function applyProposal(p: TradeProposal) {
    const notional = p.notional ?? 100;
    place.mutate(
      {
        symbol: p.symbol ?? instrument.symbol,
        asset_class: p.asset_class ?? instrument.assetClass,
        side: p.side ?? "buy",
        type: "market",
        notional,
      },
      {
        onSuccess: (o) =>
          o.status === "filled"
            ? toast.success(`Executed: ${p.side} ${fmtUSD(notional)} of ${instrument.name}`)
            : toast.error("Didn't go through", {
                description: o.risk_assessment?.reasons?.[0] ?? o.reject_reason ?? "",
              }),
        onError: (e) => toast.error("Error", { description: (e as Error).message }),
      }
    );
  }

  return {
    ...stream,
    instrument,
    timeframe,
    watching,
    setWatching,
    scan,
    applyProposal,
    placing: place.isPending,
  };
}
