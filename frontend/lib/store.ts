"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AppState {
  hasHydrated: boolean;
  onboarded: boolean;
  name: string;
  selectedSymbol: string;
  completedLessons: string[];
  setHydrated: () => void;
  completeOnboarding: (name: string) => void;
  resetOnboarding: () => void;
  setSymbol: (symbol: string) => void;
  completeLesson: (id: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      hasHydrated: false,
      onboarded: false,
      name: "",
      selectedSymbol: "BTCUSDT",
      completedLessons: [],
      setHydrated: () => set({ hasHydrated: true }),
      completeOnboarding: (name) => set({ onboarded: true, name: name.trim() || "there" }),
      resetOnboarding: () => set({ onboarded: false }),
      setSymbol: (symbol) => set({ selectedSymbol: symbol }),
      completeLesson: (id) =>
        set((s) =>
          s.completedLessons.includes(id)
            ? s
            : { completedLessons: [...s.completedLessons, id] }
        ),
    }),
    {
      name: "trade-assist",
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    }
  )
);
