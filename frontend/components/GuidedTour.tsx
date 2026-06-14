"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Clock, LineChart, Search, Sparkles, Wallet } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";

const STEPS = [
  {
    icon: Search,
    title: "Pick what to trade",
    body: "Top-left, choose Crypto or Forex and search any pair — Bitcoin, EUR/USD, gold and more.",
  },
  {
    icon: Clock,
    title: "Change the timeframe",
    body: "Switch between 1-minute and daily candles to zoom into the action or see the bigger picture.",
  },
  {
    icon: LineChart,
    title: "Read the chart",
    body: "Green candles closed higher, red closed lower. The thin wicks show how far price reached.",
  },
  {
    icon: Wallet,
    title: "Place a practice trade",
    body: "On the right, type a dollar amount and Buy or Sell. It's practice money — and your risk manager checks every order.",
  },
  {
    icon: Sparkles,
    title: "Lean on your coach",
    body: "Tap “Get a read” for an expert view of what's happening — or switch to Co-pilot for one-tap trade ideas.",
  },
];

export function GuidedTour() {
  const tourSeen = useAppStore((s) => s.tourSeen);
  const setTourSeen = useAppStore((s) => s.setTourSeen);
  const [step, setStep] = useState(0);

  if (tourSeen) return null;

  const s = STEPS[step];
  const Icon = s.icon;
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
      <div className="w-full max-w-md">
        <div className="mb-5 flex items-center justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-7 bg-primary" : "w-1.5 bg-surface-2"
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl border border-border bg-surface p-7 shadow-soft"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-fg">
              <Icon size={24} />
            </div>
            <h2 className="text-lg font-semibold text-fg">{s.title}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.body}</p>

            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={() => setTourSeen(true)}
                className="text-sm text-muted hover:text-fg"
              >
                Skip tour
              </button>
              <Button onClick={() => (last ? setTourSeen(true) : setStep((v) => v + 1))}>
                {last ? "Start trading" : "Next"}
                <ArrowRight size={16} />
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
