"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { TradeProposal } from "./api";

export interface Instrument {
  symbol: string;
  name: string;
  ticker: string;
  assetClass: string;
}

export type CoachIntensity = "reads" | "suggestions" | "copilot";
export type CopilotStyle = "panel" | "session";
export type ChartView = "trade" | "forecast";
export type IdeaTab = "coach" | "bot" | "forecast";

const DEFAULT_INSTRUMENT: Instrument = {
  symbol: "BTCUSDT",
  name: "Bitcoin",
  ticker: "BTC",
  assetClass: "crypto",
};

export interface AuthUser {
  id: number;
  email: string;
}

interface AppState {
  hasHydrated: boolean;
  token: string | null;
  user: AuthUser | null;
  onboarded: boolean;
  name: string;
  level: string; // "new" | "rusty" | "intermediate"
  instrument: Instrument; // the active tab
  openInstruments: Instrument[];
  timeframe: string;
  chartView: ChartView; // trade chart vs. the AI forecast lens (not persisted)
  showBotPlan: boolean; // overlay the bot's levels + plan on the trade chart
  coachIntensity: CoachIntensity;
  copilotStyle: CopilotStyle;
  suggestedTrade: TradeProposal | null; // pre-fills the order ticket (set by "Place order")
  coachIdea: TradeProposal | null; // the coach's latest drafted idea (Ideas panel · Coach tab)
  ideaTab: IdeaTab; // which Ideas-panel tab is active
  tourSeen: boolean;
  completedLessons: string[];
  lastSeenNotifAt: number; // epoch secs of the newest notification the user has seen
  desktopAlerts: boolean; // fire browser notifications on new bot events
  sidebarCollapsed: boolean; // minimise the left nav to icons to free up screen

  setHydrated: () => void;
  setAuth: (token: string, user: AuthUser) => void;
  clearAuth: () => void;
  completeOnboarding: (name: string, level?: string) => void;
  resetOnboarding: () => void;
  setInstrument: (instrument: Instrument) => void;
  closeInstrument: (symbol: string) => void;
  setTimeframe: (timeframe: string) => void;
  setChartView: (view: ChartView) => void;
  toggleBotPlan: () => void;
  toggleSidebar: () => void;
  setCoachIntensity: (intensity: CoachIntensity) => void;
  setCopilotStyle: (style: CopilotStyle) => void;
  setSuggestedTrade: (trade: TradeProposal | null) => void;
  setCoachIdea: (trade: TradeProposal | null) => void;
  setIdeaTab: (tab: IdeaTab) => void;
  setTourSeen: (seen: boolean) => void;
  completeLesson: (id: string) => void;
  markNotificationsSeen: (ts: number) => void;
  setDesktopAlerts: (on: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      hasHydrated: false,
      token: null,
      user: null,
      onboarded: false,
      name: "",
      level: "rusty",
      instrument: DEFAULT_INSTRUMENT,
      openInstruments: [DEFAULT_INSTRUMENT],
      timeframe: "1m",
      chartView: "trade",
      showBotPlan: true,
      coachIntensity: "reads",
      copilotStyle: "panel",
      suggestedTrade: null,
      coachIdea: null,
      ideaTab: "coach",
      tourSeen: false,
      completedLessons: [],
      lastSeenNotifAt: 0,
      desktopAlerts: false,
      sidebarCollapsed: false,

      setHydrated: () => set({ hasHydrated: true }),
      setAuth: (token, user) => set({ token, user }),
      clearAuth: () => set({ token: null, user: null }),
      completeOnboarding: (name, level) =>
        set({ onboarded: true, name: name.trim() || "there", ...(level ? { level } : {}) }),
      resetOnboarding: () => set({ onboarded: false }),
      setInstrument: (instrument) =>
        set((s) => ({
          instrument,
          suggestedTrade: null,
          coachIdea: null,
          // New picks land at the front; already-open ones stay put (no reordering).
          openInstruments: s.openInstruments.some((i) => i.symbol === instrument.symbol)
            ? s.openInstruments
            : [instrument, ...s.openInstruments],
        })),
      closeInstrument: (symbol) =>
        set((s) => {
          const remaining = s.openInstruments.filter((i) => i.symbol !== symbol);
          const list = remaining.length ? remaining : [DEFAULT_INSTRUMENT];
          const active =
            s.instrument.symbol === symbol ? list[list.length - 1] : s.instrument;
          return { openInstruments: list, instrument: active, suggestedTrade: null, coachIdea: null };
        }),
      setTimeframe: (timeframe) => set({ timeframe }),
      setChartView: (chartView) => set({ chartView }),
      toggleBotPlan: () => set((s) => ({ showBotPlan: !s.showBotPlan })),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setCoachIntensity: (coachIntensity) => set({ coachIntensity }),
      setCopilotStyle: (copilotStyle) => set({ copilotStyle }),
      setSuggestedTrade: (suggestedTrade) => set({ suggestedTrade }),
      setCoachIdea: (coachIdea) => set({ coachIdea }),
      setIdeaTab: (ideaTab) => set({ ideaTab }),
      setTourSeen: (tourSeen) => set({ tourSeen }),
      completeLesson: (id) =>
        set((s) =>
          s.completedLessons.includes(id)
            ? s
            : { completedLessons: [...s.completedLessons, id] }
        ),
      markNotificationsSeen: (ts) =>
        set((s) => ({ lastSeenNotifAt: Math.max(s.lastSeenNotifAt, ts) })),
      setDesktopAlerts: (desktopAlerts) => set({ desktopAlerts }),
    }),
    {
      name: "trade-assist",
      version: 2,
      // Don't persist transient runtime state (a stale suggestion shouldn't
      // re-appear on reload).
      partialize: (s) => ({
        token: s.token,
        user: s.user,
        onboarded: s.onboarded,
        name: s.name,
        level: s.level,
        instrument: s.instrument,
        openInstruments: s.openInstruments,
        timeframe: s.timeframe,
        showBotPlan: s.showBotPlan,
        sidebarCollapsed: s.sidebarCollapsed,
        coachIntensity: s.coachIntensity,
        copilotStyle: s.copilotStyle,
        tourSeen: s.tourSeen,
        completedLessons: s.completedLessons,
        lastSeenNotifAt: s.lastSeenNotifAt,
        desktopAlerts: s.desktopAlerts,
        ideaTab: s.ideaTab,
      }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    }
  )
);
