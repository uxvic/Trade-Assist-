"use client";

import { Check, Clock } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LESSONS } from "@/lib/lessons";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function LearnPage() {
  const completed = useAppStore((s) => s.completedLessons);
  const complete = useAppStore((s) => s.completeLesson);
  const [activeId, setActiveId] = useState(LESSONS[0].id);

  const active = LESSONS.find((l) => l.id === activeId) ?? LESSONS[0];
  const isDone = completed.includes(active.id);
  const doneCount = completed.filter((id) => LESSONS.some((l) => l.id === id)).length;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-fg">Learn the basics</h2>
        <p className="mt-1 text-muted">
          Short, plain-language lessons. {doneCount} of {LESSONS.length} done.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Lesson list */}
        <div className="flex flex-col gap-2">
          {LESSONS.map((l, i) => {
            const done = completed.includes(l.id);
            const activeRow = l.id === activeId;
            return (
              <button
                key={l.id}
                onClick={() => setActiveId(l.id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                  activeRow
                    ? "border-primary/40 bg-surface-2/60"
                    : "border-border hover:bg-surface-2/40"
                )}
              >
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    done ? "bg-positive text-white" : "bg-surface-2 text-muted"
                  )}
                >
                  {done ? <Check size={15} /> : i + 1}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-fg">{l.title}</div>
                  <div className="flex items-center gap-1 text-xs text-muted">
                    <Clock size={11} /> {l.minutes} min
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Lesson content */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent>
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <Clock size={12} /> {active.minutes} min read
              </div>
              <h3 className="mt-1 text-xl font-semibold text-fg">{active.title}</h3>
              <div className="mt-4 space-y-4">
                {active.body.map((para, i) => (
                  <p key={i} className="text-[15px] leading-relaxed text-muted">
                    {para}
                  </p>
                ))}
              </div>
              <div className="mt-6 border-t border-border pt-5">
                {isDone ? (
                  <div className="flex items-center gap-2 text-sm font-medium text-positive">
                    <Check size={16} /> Completed
                  </div>
                ) : (
                  <Button onClick={() => complete(active.id)}>
                    <Check size={16} /> Mark as complete
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
