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

export interface InstrumentInfo {
  symbol: string;
  name: string;
  ticker: string;
  asset_class: string;
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

export function useInstruments(assetClass: string, search: string) {
  return useQuery({
    queryKey: ["instruments", assetClass, search],
    queryFn: () =>
      http<{ instruments: InstrumentInfo[] }>(
        `/api/market/instruments?asset_class=${assetClass}&search=${encodeURIComponent(search)}`
      ),
    staleTime: 60_000,
  });
}

export function useQuote(assetClass: string, symbol: string | undefined) {
  return useQuery({
    queryKey: ["quote", assetClass, symbol],
    queryFn: () => http<Quote>(`/api/market/quote/${symbol}?asset_class=${assetClass}`),
    enabled: !!symbol,
    refetchInterval: 4000,
    retry: 1,
  });
}

export function useCandles(
  assetClass: string,
  symbol: string | undefined,
  timeframe = "1m",
  limit = 150
) {
  return useQuery({
    queryKey: ["candles", assetClass, symbol, timeframe, limit],
    queryFn: () =>
      http<{ candles: Candle[] }>(
        `/api/market/candles/${symbol}?asset_class=${assetClass}&timeframe=${timeframe}&limit=${limit}`
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
  asset_class: string;
  side: "buy" | "sell";
  type?: "market" | "limit" | "stop";
  notional?: number;
  qty?: number;
  limit_price?: number;
  stop_price?: number;
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
export interface TradeProposal {
  symbol?: string;
  asset_class?: string;
  side?: "buy" | "sell";
  notional?: number;
  entry?: number;
  stop?: number;
  target?: number;
  leverage?: number;
  rationale?: string;
  risk?: string;
}

export interface AgentEvent {
  type: "text" | "tool_call" | "tool_result" | "done" | "error" | "no_key";
  text?: string;
  name?: string;
  message?: string;
  input?: Record<string, unknown>;
  [k: string]: unknown;
}

async function* _streamSSE(
  url: string,
  body: unknown,
  signal?: AbortSignal
): AsyncGenerator<AgentEvent> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
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

export function streamChat(
  message: string,
  history: { role: string; content: string }[],
  intensity = "reads",
  signal?: AbortSignal
): AsyncGenerator<AgentEvent> {
  return _streamSSE("/api/agent/chat", { message, history, intensity }, signal);
}

export interface ObserveContext {
  symbol: string;
  assetClass: string;
  timeframe: string;
  name: string;
  intensity: string;
}

export function streamObserve(ctx: ObserveContext, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
  return _streamSSE(
    "/api/agent/observe",
    {
      symbol: ctx.symbol,
      asset_class: ctx.assetClass,
      timeframe: ctx.timeframe,
      name: ctx.name,
      intensity: ctx.intensity,
    },
    signal
  );
}
