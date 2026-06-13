"use client";

import { usePathname } from "next/navigation";

import { OnboardingFlow } from "@/components/OnboardingFlow";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { useAppStore } from "@/lib/store";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hasHydrated = useAppStore((s) => s.hasHydrated);
  const onboarded = useAppStore((s) => s.onboarded);

  // Wait for the persisted store to load to avoid a flash / hydration mismatch.
  if (!hasHydrated) {
    return <div className="min-h-screen bg-bg" />;
  }

  if (!onboarded) {
    return <OnboardingFlow />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar pathname={pathname} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
