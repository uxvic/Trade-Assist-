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

const DEFAULT_INSTRUMENT: Instrument = {
  symbol: "BTCUSDT",
  name: "Bitcoin",
  ticker: "BTC",
  assetClass: "crypto",
};

interface AppState {
  hasHydrated: boolean;
  onboarded: boolean;
  name: string;
  level: string; // "new" | "rusty" | "intermediate"
  instrument: Instrument; // the active tab
  openInstruments: Instrument[];
  timeframe: string;
  coachIntensity: CoachIntensity;
  copilotStyle: CopilotStyle;
  suggestedTrade: TradeProposal | null;
  tourSeen: boolean;
  completedLessons: string[];

  setHydrated: () => void;
  completeOnboarding: (name: string, level?: string) => void;
  resetOnboarding: () => void;
  setInstrument: (instrument: Instrument) => void;
  closeInstrument: (symbol: string) => void;
  setTimeframe: (timeframe: string) => void;
  setCoachIntensity: (intensity: CoachIntensity) => void;
  setCopilotStyle: (style: CopilotStyle) => void;
  setSuggestedTrade: (trade: TradeProposal | null) => void;
  setTourSeen: (seen: boolean) => void;
  completeLesson: (id: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      hasHydrated: false,
      onboarded: false,
      name: "",
      level: "rusty",
      instrument: DEFAULT_INSTRUMENT,
      openInstruments: [DEFAULT_INSTRUMENT],
      timeframe: "1m",
      coachIntensity: "reads",
      copilotStyle: "panel",
      suggestedTrade: null,
      tourSeen: false,
      completedLessons: [],

      setHydrated: () => set({ hasHydrated: true }),
      completeOnboarding: (name, level) =>
        set({ onboarded: true, name: name.trim() || "there", ...(level ? { level } : {}) }),
      resetOnboarding: () => set({ onboarded: false }),
      setInstrument: (instrument) =>
        set((s) => ({
          instrument,
          suggestedTrade: null,
          openInstruments: s.openInstruments.some((i) => i.symbol === instrument.symbol)
            ? s.openInstruments
            : [...s.openInstruments, instrument],
        })),
      closeInstrument: (symbol) =>
        set((s) => {
          const remaining = s.openInstruments.filter((i) => i.symbol !== symbol);
          const list = remaining.length ? remaining : [DEFAULT_INSTRUMENT];
          const active =
            s.instrument.symbol === symbol ? list[list.length - 1] : s.instrument;
          return { openInstruments: list, instrument: active, suggestedTrade: null };
        }),
      setTimeframe: (timeframe) => set({ timeframe }),
      setCoachIntensity: (coachIntensity) => set({ coachIntensity }),
      setCopilotStyle: (copilotStyle) => set({ copilotStyle }),
      setSuggestedTrade: (suggestedTrade) => set({ suggestedTrade }),
      setTourSeen: (tourSeen) => set({ tourSeen }),
      completeLesson: (id) =>
        set((s) =>
          s.completedLessons.includes(id)
            ? s
            : { completedLessons: [...s.completedLessons, id] }
        ),
    }),
    {
      name: "trade-assist",
      version: 2,
      // Don't persist transient runtime state (a stale suggestion shouldn't
      // re-appear on reload).
      partialize: (s) => ({
        onboarded: s.onboarded,
        name: s.name,
        level: s.level,
        instrument: s.instrument,
        openInstruments: s.openInstruments,
        timeframe: s.timeframe,
        coachIntensity: s.coachIntensity,
        copilotStyle: s.copilotStyle,
        tourSeen: s.tourSeen,
        completedLessons: s.completedLessons,
      }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    }
  )
);
