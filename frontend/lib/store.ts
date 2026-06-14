"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Instrument {
  symbol: string;
  name: string;
  ticker: string;
  assetClass: string;
}

export type CoachIntensity = "reads" | "suggestions" | "copilot";

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
  instrument: Instrument;
  timeframe: string;
  coachIntensity: CoachIntensity;
  tourSeen: boolean;
  completedLessons: string[];

  setHydrated: () => void;
  completeOnboarding: (name: string, level?: string) => void;
  resetOnboarding: () => void;
  setInstrument: (instrument: Instrument) => void;
  setTimeframe: (timeframe: string) => void;
  setCoachIntensity: (intensity: CoachIntensity) => void;
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
      timeframe: "1m",
      coachIntensity: "reads",
      tourSeen: false,
      completedLessons: [],

      setHydrated: () => set({ hasHydrated: true }),
      completeOnboarding: (name, level) =>
        set({ onboarded: true, name: name.trim() || "there", ...(level ? { level } : {}) }),
      resetOnboarding: () => set({ onboarded: false }),
      setInstrument: (instrument) => set({ instrument }),
      setTimeframe: (timeframe) => set({ timeframe }),
      setCoachIntensity: (coachIntensity) => set({ coachIntensity }),
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
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    }
  )
);
