"use client";

import { Bell, LogIn, LogOut, Target } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { type BotEvent, useBotNotifications } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const KIND: Record<string, { icon: typeof Bell; color: string }> = {
  signal: { icon: Target, color: "text-amber-400" },
  enter: { icon: LogIn, color: "text-positive" },
  exit: { icon: LogOut, color: "text-negative" },
};

function fmtTime(ts: number) {
  return new Date(ts * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NotificationCenter() {
  const { data } = useBotNotifications();
  const lastSeen = useAppStore((s) => s.lastSeenNotifAt);
  const markSeen = useAppStore((s) => s.markNotificationsSeen);
  const desktopAlerts = useAppStore((s) => s.desktopAlerts);
  const setDesktopAlerts = useAppStore((s) => s.setDesktopAlerts);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const firedUpTo = useRef<number>(-1);

  const items = useMemo(() => data?.notifications ?? [], [data]);
  const newestTs = items[0]?.ts ?? 0;
  const unread = items.filter((n) => n.ts > lastSeen).length;

  // Fire desktop notifications for genuinely-new events (never historical ones).
  useEffect(() => {
    if (!items.length) return;
    if (firedUpTo.current < 0) {
      firedUpTo.current = newestTs; // first load → baseline, don't fire
      return;
    }
    if (!desktopAlerts || typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    const fresh = items.filter((n) => n.ts > firedUpTo.current).slice(0, 3);
    for (const n of fresh) {
      new Notification("Trade-Assist bot", { body: n.text });
    }
    if (fresh.length) firedUpTo.current = newestTs;
  }, [items, newestTs, desktopAlerts]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && newestTs) markSeen(newestTs);
  }

  async function enableAlerts() {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") await Notification.requestPermission();
    setDesktopAlerts(Notification.permission === "granted");
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggleOpen}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:text-fg"
        aria-label="Bot activity"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-fg">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-border bg-surface shadow-soft">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold text-fg">Bot activity</span>
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted">
              <input
                type="checkbox"
                checked={desktopAlerts}
                onChange={(e) => (e.target.checked ? enableAlerts() : setDesktopAlerts(false))}
                className="accent-primary"
              />
              Desktop alerts
            </label>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted">
                Nothing yet. The bot will flag setups, entries and exits here.
              </div>
            ) : (
              items.map((n: BotEvent, i) => {
                const meta = KIND[n.kind] ?? KIND.signal;
                const Icon = meta.icon;
                return (
                  <div
                    key={`${n.ts}-${i}`}
                    className={cn(
                      "flex gap-2.5 border-b border-border/50 px-3 py-2.5 last:border-0",
                      n.ts > lastSeen && "bg-primary/5"
                    )}
                  >
                    <Icon size={15} className={cn("mt-0.5 shrink-0", meta.color)} />
                    <div className="min-w-0">
                      <div className="text-[13px] leading-snug text-fg">{n.text}</div>
                      <div className="mt-0.5 text-[10px] tabular text-muted">{fmtTime(n.ts)}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
