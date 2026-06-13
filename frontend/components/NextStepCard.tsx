"use client";

import { ArrowRight, BookOpen, LineChart, MessageCircle } from "lucide-react";
import Link from "next/link";

import { usePositions } from "@/lib/api";
import { LESSONS } from "@/lib/lessons";
import { useAppStore } from "@/lib/store";

export function NextStepCard() {
  const completedLessons = useAppStore((s) => s.completedLessons);
  const positions = usePositions();

  const nextLesson = LESSONS.find((l) => !completedLessons.includes(l.id));
  const hasPositions = (positions.data?.length ?? 0) > 0;

  let step: { icon: typeof BookOpen; label: string; title: string; href: string; cta: string };

  if (nextLesson && completedLessons.length === 0) {
    step = {
      icon: BookOpen,
      label: "Start here",
      title: `Lesson: ${nextLesson.title}`,
      href: "/learn",
      cta: `${nextLesson.minutes} min read`,
    };
  } else if (!hasPositions) {
    step = {
      icon: LineChart,
      label: "Your next step",
      title: "Place your first practice trade",
      href: "/trade",
      cta: "Open the trade desk",
    };
  } else if (nextLesson) {
    step = {
      icon: BookOpen,
      label: "Keep learning",
      title: `Lesson: ${nextLesson.title}`,
      href: "/learn",
      cta: `${nextLesson.minutes} min read`,
    };
  } else {
    step = {
      icon: MessageCircle,
      label: "Your next step",
      title: "Ask your coach what to focus on next",
      href: "/coach",
      cta: "Chat with your coach",
    };
  }

  const Icon = step.icon;

  return (
    <Link
      href={step.href}
      className="group relative block overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-surface to-surface p-5 shadow-soft transition-all hover:border-primary/50"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg">
          <Icon size={22} />
        </div>
        <div className="flex-1">
          <div className="text-xs font-medium uppercase tracking-wide text-primary">
            {step.label}
          </div>
          <div className="mt-0.5 text-lg font-semibold text-fg">{step.title}</div>
          <div className="mt-1 flex items-center gap-1 text-sm text-muted">
            {step.cta}
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}
