"use client";

import {
  BookOpen,
  Bot,
  GraduationCap,
  Home,
  LineChart,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/trade", label: "Trade", icon: LineChart },
  { href: "/bot", label: "Bot", icon: Bot },
  { href: "/learn", label: "Learn", icon: BookOpen },
  { href: "/coach", label: "Coach", icon: MessageCircle },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  // Collapsing only applies on desktop; the mobile drawer always shows full width.
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggle = useAppStore((s) => s.toggleSidebar);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onClose} aria-hidden />
      )}
      <aside
        className={cn(
          "flex w-60 shrink-0 flex-col border-r border-border bg-surface p-3 md:bg-surface/50",
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:shadow-soft max-md:transition-transform",
          open ? "max-md:translate-x-0" : "max-md:-translate-x-full",
          collapsed && "md:w-16 md:items-center md:px-2"
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <Link href="/home" className="flex items-center gap-2.5 px-2 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-fg">
              <GraduationCap size={18} />
            </div>
            <div className={cn("leading-tight", collapsed && "md:hidden")}>
              <div className="text-sm font-semibold text-fg">Trade-Assist</div>
              <div className="text-[11px] text-muted">Learn by doing</div>
            </div>
          </Link>
          {/* Desktop-only collapse toggle */}
          <button
            onClick={toggle}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2/60 hover:text-fg md:flex",
              collapsed && "md:hidden"
            )}
          >
            <PanelLeftClose size={16} />
          </button>
        </div>

        {/* When collapsed, a standalone expand button sits under the logo */}
        {collapsed && (
          <button
            onClick={toggle}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            className="mt-1 hidden h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2/60 hover:text-fg md:flex"
          >
            <PanelLeftOpen size={18} />
          </button>
        )}

        <nav className="mt-4 flex w-full flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  collapsed && "md:justify-center md:px-0",
                  active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2/60 hover:text-fg"
                )}
              >
                <Icon size={18} className={cn("shrink-0", active && "text-primary")} />
                <span className={cn(collapsed && "md:hidden")}>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div
          className={cn(
            "mt-auto rounded-xl border border-border bg-surface-2/40 p-3",
            collapsed && "md:hidden"
          )}
        >
          <div className="flex items-center gap-2 text-xs font-medium text-fg">
            <ShieldCheck size={14} className="text-positive" />
            Practice money
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Everything here is simulated. Educational only — not financial advice.
          </p>
        </div>
      </aside>
    </>
  );
}
