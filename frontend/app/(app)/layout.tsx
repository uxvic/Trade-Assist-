"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { AuthGate } from "@/components/AuthGate";
import { FeedbackButton } from "@/components/FeedbackButton";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { fetchMe } from "@/lib/api";
import { useAppStore } from "@/lib/store";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hasHydrated = useAppStore((s) => s.hasHydrated);
  const token = useAppStore((s) => s.token);
  const onboarded = useAppStore((s) => s.onboarded);
  const clearAuth = useAppStore((s) => s.clearAuth);

  // Validate a stored token on boot; drop it if the server rejects it.
  useEffect(() => {
    if (hasHydrated && token) {
      fetchMe().catch(() => clearAuth());
    }
  }, [hasHydrated, token, clearAuth]);

  // Wait for the persisted store to load to avoid a flash / hydration mismatch.
  if (!hasHydrated) {
    return <div className="min-h-screen bg-bg" />;
  }

  if (!token) {
    return <AuthGate />;
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
      <FeedbackButton />
    </div>
  );
}
