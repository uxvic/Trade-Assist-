"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { type AuthUser, useAppStore } from "./store";

/** The bearer token + a 401 handler, shared by http() and the SSE stream. */
function authHeaders(): Record<string, string> {
  const token = useAppStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

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
/** Shown when the request can't reach the FastAPI backend at all (the dev proxy
 *  surfaces a refused connection as a 500 with a non-JSON body). */
const UNREACHABLE = "Can't reach the server — is the backend running on :8000? Run ./scripts/dev.sh";

async function http<T>(path: string, init?: RequestInit, timeoutMs = 20000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...authHeaders(), ...init?.headers },
      // Never hang forever on a dead/slow backend — bound every request.
      signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    // Either our timeout fired or fetch threw (backend down → connection refused).
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new Error("The server took too long to respond — is the backend running?");
    }
    throw new Error(UNREACHABLE);
  }
  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    useAppStore.getState().clearAuth(); // session expired → back to the login gate
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      // Non-JSON error body → almost always the Next dev proxy failing to reach
      // the backend (a refused connection surfaces as a 500). Make it actionable
      // instead of the cryptic "Internal Server Error".
      if (res.status >= 500) detail = UNREACHABLE;
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export function useSignup() {
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      http<AuthResponse>("/api/auth/signup", { method: "POST", body: JSON.stringify(input) }),
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      http<AuthResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(input) }),
  });
}

export async function fetchMe(): Promise<AuthUser> {
  return http<AuthUser>("/api/auth/me");
}

export function useSendFeedback() {
  return useMutation({
    mutationFn: (input: { message: string; page: string }) =>
      http<{ status: string }>("/api/feedback", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
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
// Strategy engine + bot
// ---------------------------------------------------------------------------
export interface StrategyLevelInfo {
  price: number;
  type: string;
  strength: number;
  source_tf: string;
  touches: number;
  last_touch_ts: number;
}

export interface TrendInfo {
  direction: string;
  confidence: number;
  reasons: string[];
  ma50: number | null;
  ma200: number | null;
}

export interface ProposedTradeInfo {
  side: string;
  entry: number;
  stop: number;
  target: number;
  rr: number;
  risk_per_unit: number;
  exit_policy: string;
  rationale: string;
}

export interface AiSecondOpinion {
  market_read: string | null;
  agrees_with_bot: boolean | null;
  available?: boolean;
}

export interface StrategyAnalysis {
  symbol: string;
  asset_class: string;
  as_of: number;
  current_price: number;
  trend: TrendInfo;
  levels: StrategyLevelInfo[];
  signal: { state: string; reason: string; confirmations: Record<string, boolean> };
  proposed_trade: ProposedTradeInfo | null;
  ai_second_opinion: AiSecondOpinion | null;
}

/** Deterministic analysis only (cheap, no LLM) — safe to poll. */
export function useStrategyAnalysis(assetClass: string, symbol: string | undefined) {
  return useQuery({
    queryKey: ["strategy", assetClass, symbol],
    queryFn: () =>
      http<StrategyAnalysis>(
        `/api/strategy/analyze?asset_class=${assetClass}&symbol=${symbol}`
      ),
    enabled: !!symbol,
    refetchInterval: 30000,
    retry: 1,
  });
}

/** One-shot AI second opinion (costs a token call) — triggered by a button. */
export async function fetchAiRead(assetClass: string, symbol: string): Promise<AiSecondOpinion> {
  const res = await http<StrategyAnalysis>(
    `/api/strategy/analyze?asset_class=${assetClass}&symbol=${symbol}&include_ai=true`,
    undefined,
    90000 // an LLM call — give it room before timing out
  );
  return res.ai_second_opinion ?? { market_read: null, agrees_with_bot: null };
}

export function useCompare() {
  return useQuery({
    queryKey: ["compare"],
    queryFn: () =>
      http<{
        user: { equity: number; pnl: number };
        bot: { equity: number; pnl: number; win_rate: number; trades_n: number; open_n: number };
      }>("/api/strategy/compare"),
    refetchInterval: 15000,
  });
}

// ---------------------------------------------------------------------------
// Live bot console (continuously-running trader)
// ---------------------------------------------------------------------------
export interface BotNote {
  ts: number;
  kind: string; // "analysis" | "watch" | "signal" | "enter" | "exit" | "ai"
  text: string;
}

export interface BotPosition {
  symbol: string;
  qty: number;
  avg_cost: number;
  market_price: number;
  unrealized_pnl: number;
  entry: number | null;
  stop: number | null;
  target: number | null;
  opened_at: number | null;
}

export interface BotCall {
  trend: TrendInfo;
  signal: {
    state: string;
    reason: string;
    level: StrategyLevelInfo | null;
    confirmations: Record<string, boolean>;
  };
  proposed_trade: ProposedTradeInfo | null;
  levels: StrategyLevelInfo[];
  current_price: number;
  as_of: number;
}

export interface BotFeed {
  symbol: string;
  asset_class: string;
  call: BotCall | null;
  notes: BotNote[];
  position: BotPosition | null;
}

/** The live bot console polls this — cheap, deterministic, "always running". */
export function useBotFeed(assetClass: string, symbol: string | undefined) {
  return useQuery({
    queryKey: ["bot-feed", assetClass, symbol],
    queryFn: () =>
      http<BotFeed>(`/api/strategy/bot/feed?asset_class=${assetClass}&symbol=${symbol}`),
    enabled: !!symbol,
    refetchInterval: 15000,
    retry: 1,
  });
}

/** On-demand AI colour commentary on the bot's read (costs a token call). */
export async function fetchBotCommentary(
  assetClass: string,
  symbol: string
): Promise<{ commentary: string | null; available: boolean }> {
  return http(
    `/api/strategy/bot/commentary?asset_class=${assetClass}&symbol=${symbol}`,
    undefined,
    90000 // an LLM call — give it room before timing out
  );
}

export interface BotEvent {
  ts: number;
  symbol: string | null;
  asset_class: string | null;
  kind: string;
  text: string;
  notify: number;
}

/** Notify-worthy bot events (setups/entries/exits) for the activity centre. */
export function useBotNotifications() {
  return useQuery({
    queryKey: ["bot-notifications"],
    queryFn: () =>
      http<{ notifications: BotEvent[] }>("/api/strategy/bot/notifications?limit=50"),
    refetchInterval: 15000,
  });
}

/** The bot's full activity log (all kinds) — for the Bot page. */
export function useBotEvents(symbol?: string) {
  const q = symbol ? `&symbol=${symbol}` : "";
  return useQuery({
    queryKey: ["bot-events", symbol ?? "all"],
    queryFn: () => http<{ events: BotEvent[] }>(`/api/strategy/bot/events?limit=200${q}`),
    refetchInterval: 20000,
  });
}

export interface BotTrade {
  trade_id: string;
  symbol: string;
  asset_class: string;
  side: string;
  qty: number;
  entry: number;
  stop: number;
  target: number;
  rationale: string;
  opened_at: number;
  closed_at: number | null;
  exit_reason: string | null;
  pnl: number | null;
  status: string;
}

/** The bot's track record (durable across restarts) + aggregate stats. */
export function useBotTrades() {
  return useQuery({
    queryKey: ["bot-trades"],
    queryFn: () =>
      http<{
        trades: BotTrade[];
        stats: {
          trades_n: number;
          open_n: number;
          wins: number;
          win_rate: number;
          realized_pnl: number;
        };
        watching: [string, string][];
      }>("/api/strategy/bot/trades"),
    refetchInterval: 20000,
  });
}

// ---------------------------------------------------------------------------
// Forecast lens (honest, on-demand — NOT a trading signal)
// ---------------------------------------------------------------------------
export interface ForecastPoint {
  ts: number;
  value: number;
}

export interface ForecastScorecard {
  n: number;
  directional_acc: number | null; // % of matured forecasts that called direction right
  beat_naive_pct: number | null; // % that landed closer than "price stays put"
  verdict: string; // honest, plain-language read on the track record
}

export interface Forecast {
  symbol: string;
  asset_class: string;
  timeframe: string;
  as_of: number;
  made_price: number;
  horizon: number;
  history: ForecastPoint[];
  point: ForecastPoint[]; // median projection
  lower: ForecastPoint[]; // P10 band
  upper: ForecastPoint[]; // P90 band
  scorecard: ForecastScorecard;
}

/** One-shot probabilistic forecast (loads a heavy model server-side; slow). */
export async function fetchForecast(
  assetClass: string,
  symbol: string,
  timeframe = "1m",
  horizon = 24
): Promise<Forecast> {
  return http<Forecast>(
    `/api/forecast?asset_class=${assetClass}&symbol=${symbol}` +
      `&timeframe=${timeframe}&horizon=${horizon}`,
    undefined,
    90000 // loads a heavy model server-side — give it room before timing out
  );
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

export interface EmailSettings {
  configured: boolean;
  recipient: string | null;
  digest: boolean;
}

export function useEmailSettings() {
  return useQuery({
    queryKey: ["email-settings"],
    queryFn: () => http<EmailSettings>("/api/settings/email"),
  });
}

export function useSetEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      api_key?: string;
      recipient?: string;
      sender?: string;
      digest?: boolean;
    }) =>
      http<EmailSettings>("/api/settings/email", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-settings"] }),
  });
}

// ---------------------------------------------------------------------------
// Trading rules (the user's own method; shapes the analysis agents)
// ---------------------------------------------------------------------------
export interface TradingRules {
  rules_text: string;
  use_rules: boolean;
  updated_at: number;
}

export function useTradingRules() {
  return useQuery({
    queryKey: ["trading-rules"],
    queryFn: () => http<TradingRules>("/api/settings/rules"),
  });
}

export function useSaveTradingRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { rules_text: string; use_rules: boolean }) =>
      http<TradingRules>("/api/settings/rules", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trading-rules"] }),
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
  type: "text" | "tool_call" | "tool_result" | "done" | "error" | "no_key" | "stage";
  text?: string;
  name?: string;
  message?: string;
  input?: Record<string, unknown>;
  // Market-analysis pipeline extras:
  stage?: "analyst" | "reviewer"; // which agent this event belongs to
  label?: string; // human label carried on a "stage" event
  verdict?: "CONSIDER" | "WAIT" | "AVOID" | null; // reviewer's call (on final "done")
  used_rules?: boolean; // whether the user's own rules shaped the result
  usage?: { input_tokens: number; output_tokens: number }; // cumulative token use (on "done")
  [k: string]: unknown;
}

async function* _streamSSE(
  url: string,
  body: unknown,
  signal?: AbortSignal
): AsyncGenerator<AgentEvent> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
    signal,
  });

  if (res.status === 401) {
    useAppStore.getState().clearAuth();
    yield { type: "error", message: "Your session expired — please sign in again." };
    return;
  }
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

/** Two-agent pipeline: Analyst studies the market → Reviewer recommends. Events
 *  are tagged with a `stage` ("analyst" | "reviewer"). */
export function streamMarketAnalysis(
  symbol: string,
  assetClass: string,
  timeframe: string,
  signal?: AbortSignal
): AsyncGenerator<AgentEvent> {
  return _streamSSE(
    "/api/agent/analyze",
    { symbol, asset_class: assetClass, timeframe },
    signal
  );
}
