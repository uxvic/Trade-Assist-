"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, GraduationCap, LineChart, MessageCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/lib/store";

export function OnboardingFlow() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  const next = () => setStep((s) => s + 1);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute bottom-0 right-10 h-72 w-72 rounded-full bg-accent/15 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-8 bg-primary" : "w-2 bg-surface-2"
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="rounded-2xl border border-border bg-surface/80 p-8 shadow-soft backdrop-blur"
          >
            {step === 0 && (
              <div className="text-center">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-fg">
                  <GraduationCap size={28} />
                </div>
                <h1 className="text-2xl font-semibold text-fg">Welcome to Trade-Assist</h1>
                <p className="mt-3 text-[15px] leading-relaxed text-muted">
                  Learn to trade the way you actually learn anything — by doing it. You'll
                  practice with fake money on real live prices, and an AI coach will guide and
                  explain every step.
                </p>
                <div className="mt-6 space-y-3 text-left">
                  <Feature icon={LineChart} text="Trade Bitcoin & more with real market prices" />
                  <Feature icon={MessageCircle} text="An AI coach that teaches as you go" />
                  <Feature icon={ShieldCheck} text="100% practice money — you can't lose a cent" />
                </div>
                <Button className="mt-7 w-full" size="lg" onClick={next}>
                  Get started <ArrowRight size={18} />
                </Button>
              </div>
            )}

            {step === 1 && (
              <div>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-positive/15 text-positive">
                  <ShieldCheck size={24} />
                </div>
                <h2 className="text-xl font-semibold text-fg">A quick, important note</h2>
                <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted">
                  <p>
                    This is a <span className="text-fg font-medium">learning tool</span>. Every
                    trade you make uses <span className="text-fg font-medium">practice money</span>
                    — none of it is real, and nothing here can cost you anything.
                  </p>
                  <p>
                    It is <span className="text-fg font-medium">educational only</span> and is{" "}
                    <span className="text-fg font-medium">not financial advice</span>. The coach
                    helps you understand and decide for yourself — it won't tell you what to buy.
                  </p>
                </div>
                <Button className="mt-7 w-full" size="lg" onClick={next}>
                  I understand — let's learn <ArrowRight size={18} />
                </Button>
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="text-xl font-semibold text-fg">What should I call you?</h2>
                <p className="mt-2 text-[15px] text-muted">
                  So your coach can greet you properly.
                </p>
                <Input
                  autoFocus
                  className="mt-5 h-12 text-base"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && completeOnboarding(name)}
                />
                <Button
                  className="mt-6 w-full"
                  size="lg"
                  onClick={() => completeOnboarding(name)}
                >
                  Enter Trade-Assist <ArrowRight size={18} />
                </Button>
                <button
                  onClick={() => completeOnboarding("")}
                  className="mt-3 w-full text-center text-sm text-muted hover:text-fg"
                >
                  Skip for now
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Feature({ icon: Icon, text }: { icon: typeof LineChart; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/40 px-4 py-3">
      <Icon size={18} className="shrink-0 text-primary" />
      <span className="text-sm text-fg">{text}</span>
    </div>
  );
}
