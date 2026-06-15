"use client";

import { GraduationCap } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLogin, useSignup } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function AuthGate() {
  const setAuth = useAppStore((s) => s.setAuth);
  const login = useLogin();
  const signup = useSignup();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = mode === "login" ? login : signup;

  function submit() {
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    mutation.mutate(
      { email: email.trim(), password },
      {
        onSuccess: (res) => setAuth(res.token, res.user),
        onError: (e) => setError((e as Error).message),
      }
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute bottom-0 right-10 h-72 w-72 rounded-full bg-accent/15 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface/80 p-8 shadow-soft backdrop-blur">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-fg">
            <GraduationCap size={24} />
          </div>
          <h1 className="text-xl font-semibold text-fg">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {mode === "login"
              ? "Sign in to your practice account."
              : "Your own practice account with $100,000 to learn with."}
          </p>
        </div>

        <div className="space-y-3">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <Input
            type="password"
            placeholder={mode === "signup" ? "Password (8+ characters)" : "Password"}
            value={password}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          {error && <p className="text-sm text-negative">{error}</p>}
          <Button className="w-full" size="lg" disabled={mutation.isPending} onClick={submit}>
            {mutation.isPending
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </Button>
        </div>

        <p className="mt-5 text-center text-sm text-muted">
          {mode === "login" ? "New here?" : "Already have an account?"}{" "}
          <button
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError(null);
            }}
            className={cn("font-medium text-primary hover:underline")}
          >
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </p>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted">
          Practice money only · Educational use · Not financial advice
        </p>
      </div>
    </div>
  );
}
