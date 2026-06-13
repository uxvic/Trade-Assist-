"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface Account {
  account_id: string;
  cash: string;
  equity: string;
  buying_power: string;
  currency: string;
}

export interface Position {
  symbol: string;
  qty: string;
  avg_cost: string;
  market_price: string;
  unrealized_pnl: string;
  realized_pnl: string;
}

export interface SymbolInfo {
  symbol: string;
  name: string;
  ticker: string;
}

export interface Quote {
  symbol: string;
  last: string;
  bid: string | null;
  ask: string | null;
  ts: string;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderResult {
  id: string;
  symbol: string;
  side: string;
  type: string;
  qty: string;
  status: string;
  filled_qty: string;
  avg_fill_price: string | null;
  reject_reason: string | null;
  risk_assessment: {
    passed: boolean;
    position_pct: number;
    notional: number;
    reasons: string[];
    warnings: string[];
  } | null;
}

export interface AISettings {
  configured: boolean;
  provider: string;
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------
async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
export function useAccount() {
  return useQuery({
    queryKey: ["account"],
    queryFn: () => http<Account>("/api/paper/account"),
    refetchInterval: 5000,
  });
}

export function usePositions() {
  return useQuery({
    queryKey: ["positions"],
    queryFn: () => http<Position[]>("/api/paper/positions"),
    refetchInterval: 6000,
  });
}

export function useSymbols() {
  return useQuery({
    queryKey: ["symbols"],
    queryFn: () => http<{ symbols: SymbolInfo[] }>("/api/market/symbols"),
    staleTime: Infinity,
  });
}

export function useQuote(symbol: string | undefined) {
  return useQuery({
    queryKey: ["quote", symbol],
    queryFn: () => http<Quote>(`/api/market/quote/${symbol}`),
    enabled: !!symbol,
    refetchInterval: 4000,
    retry: 1,
  });
}

export function useCandles(symbol: string | undefined, timeframe = "1m", limit = 150) {
  return useQuery({
    queryKey: ["candles", symbol, timeframe, limit],
    queryFn: () =>
      http<{ candles: Candle[] }>(
        `/api/market/candles/${symbol}?timeframe=${timeframe}&limit=${limit}`
      ),
    enabled: !!symbol,
    refetchInterval: 15000,
    retry: 1,
  });
}

export function useAISettings() {
  return useQuery({
    queryKey: ["ai-settings"],
    queryFn: () => http<AISettings>("/api/settings/ai"),
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
export interface PlaceOrderInput {
  symbol: string;
  side: "buy" | "sell";
  type?: "market" | "limit" | "stop";
  notional?: number;
  qty?: number;
}

export function usePlaceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PlaceOrderInput) =>
      http<OrderResult>("/api/paper/orders", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account"] });
      qc.invalidateQueries({ queryKey: ["positions"] });
    },
  });
}

export function useResetAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => http<{ status: string }>("/api/paper/reset", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });
}

export function useSetAIKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { provider: string; api_key: string }) =>
      http<AISettings>("/api/settings/ai", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-settings"] }),
  });
}

// ---------------------------------------------------------------------------
// Coach streaming (SSE)
// ---------------------------------------------------------------------------
export interface AgentEvent {
  type: "text" | "tool_call" | "tool_result" | "done" | "error" | "no_key";
  text?: string;
  name?: string;
  message?: string;
  [k: string]: unknown;
}

export async function* streamChat(
  message: string,
  history: { role: string; content: string }[],
  signal?: AbortSignal
): AsyncGenerator<AgentEvent> {
  const res = await fetch("/api/agent/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, history }),
    signal,
  });

  if (res.status === 503) {
    yield { type: "no_key" };
    return;
  }
  if (!res.body) {
    yield { type: "error", message: "No response stream from the coach." };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      try {
        yield JSON.parse(line.slice(5).trim()) as AgentEvent;
      } catch {
        /* ignore malformed chunk */
      }
    }
  }
}
