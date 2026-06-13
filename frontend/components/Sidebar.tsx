"use client";

import { BookOpen, GraduationCap, Home, LineChart, MessageCircle, Settings, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const NAV = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/trade", label: "Trade", icon: LineChart },
  { href: "/learn", label: "Learn", icon: BookOpen },
  { href: "/coach", label: "Coach", icon: MessageCircle },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface/50 p-3">
      <Link href="/home" className="flex items-center gap-2.5 px-2 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-fg">
          <GraduationCap size={18} />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-fg">Trade-Assist</div>
          <div className="text-[11px] text-muted">Learn by doing</div>
        </div>
      </Link>

      <nav className="mt-4 flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-surface-2 text-fg"
                  : "text-muted hover:bg-surface-2/60 hover:text-fg"
              )}
            >
              <Icon size={18} className={active ? "text-primary" : ""} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-xl border border-border bg-surface-2/40 p-3">
        <div className="flex items-center gap-2 text-xs font-medium text-fg">
          <ShieldCheck size={14} className="text-positive" />
          Practice money
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          Everything here is simulated. Educational only — not financial advice.
        </p>
      </div>
    </aside>
  );
}
