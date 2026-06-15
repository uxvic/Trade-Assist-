"use client";

import { Bell, Check, KeyRound, LogOut, RefreshCw, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  useAISettings,
  useEmailSettings,
  useResetAccount,
  useSetAIKey,
  useSetEmail,
} from "@/lib/api";
import { useAppStore } from "@/lib/store";

export default function SettingsPage() {
  const ai = useAISettings();
  const setKey = useSetAIKey();
  const resetAccount = useResetAccount();
  const resetOnboarding = useAppStore((s) => s.resetOnboarding);
  const email = useEmailSettings();
  const setEmail = useSetEmail();
  const user = useAppStore((s) => s.user);
  const clearAuth = useAppStore((s) => s.clearAuth);
  const qc = useQueryClient();

  function signOut() {
    void fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    qc.clear();
    clearAuth();
  }

  const [apiKey, setApiKey] = useState("");
  const [emailKey, setEmailKey] = useState("");
  const [recipient, setRecipient] = useState("");

  function saveEmail() {
    if (!emailKey.trim() || !recipient.trim()) {
      toast.error("Add both a Resend API key and your email address.");
      return;
    }
    setEmail.mutate(
      { api_key: emailKey.trim(), recipient: recipient.trim(), digest: true },
      {
        onSuccess: (s) => {
          setEmailKey("");
          if (s.configured) toast.success("Email alerts are on — you'll hear from the bot.");
        },
        onError: (e) => toast.error("Couldn't save", { description: (e as Error).message }),
      }
    );
  }

  function saveKey() {
    if (!apiKey.trim()) {
      toast.error("Paste your API key first.");
      return;
    }
    setKey.mutate(
      { provider: "claude", api_key: apiKey.trim() },
      {
        onSuccess: (s) => {
          setApiKey("");
          if (s.configured) toast.success("Your coach is now active!");
        },
        onError: (e) => toast.error("Couldn't save key", { description: (e as Error).message }),
      }
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h2 className="text-2xl font-semibold text-fg">Settings</h2>

      {/* AI coach */}
      <Card className="mt-6">
        <CardContent>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Sparkles size={20} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-fg">AI Coach</h3>
                {ai.data?.configured ? (
                  <Badge variant="positive">
                    <Check size={12} /> Active
                  </Badge>
                ) : (
                  <Badge>Not set up</Badge>
                )}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Paste an Anthropic (Claude) API key to power your coach. It's kept in memory on
                your machine only — never saved to disk or shared. Get a key at{" "}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  console.anthropic.com
                </a>
                .
              </p>

              <div className="mt-4 flex gap-2">
                <Input
                  type="password"
                  placeholder="sk-ant-…"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveKey()}
                />
                <Button onClick={saveKey} disabled={setKey.isPending}>
                  <KeyRound size={16} /> {setKey.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Email alerts */}
      <Card className="mt-4">
        <CardContent>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
              <Bell size={20} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-fg">Email alerts</h3>
                {email.data?.configured ? (
                  <Badge variant="positive">
                    <Check size={12} /> On
                  </Badge>
                ) : (
                  <Badge>Off</Badge>
                )}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Get emailed when the bot spots a setup, enters or exits — plus a daily summary —
                so it reaches you even when this tab is closed. Paste a free{" "}
                <a
                  href="https://resend.com/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  Resend
                </a>{" "}
                API key. Kept in memory only, never saved to disk.
              </p>
              {email.data?.configured && email.data.recipient && (
                <p className="mt-2 text-xs text-muted">
                  Sending to <span className="text-fg">{email.data.recipient}</span>.
                </p>
              )}

              <div className="mt-4 space-y-2">
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder="re_… (Resend API key)"
                    value={emailKey}
                    onChange={(e) => setEmailKey(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveEmail()}
                  />
                  <Button onClick={saveEmail} disabled={setEmail.isPending}>
                    <Bell size={16} /> {setEmail.isPending ? "Saving…" : "Turn on"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Practice account */}
      <Card className="mt-4">
        <CardContent>
          <h3 className="text-base font-semibold text-fg">Practice account</h3>
          <p className="mt-1 text-sm text-muted">
            Start fresh with a clean $100,000 practice balance. This clears your positions.
          </p>
          <Button
            variant="secondary"
            className="mt-4"
            disabled={resetAccount.isPending}
            onClick={() =>
              resetAccount.mutate(undefined, {
                onSuccess: () => toast.success("Practice account reset to $100,000."),
              })
            }
          >
            <RefreshCw size={16} /> Reset practice account
          </Button>
        </CardContent>
      </Card>

      {/* Onboarding */}
      <Card className="mt-4">
        <CardContent>
          <h3 className="text-base font-semibold text-fg">Welcome tour</h3>
          <p className="mt-1 text-sm text-muted">See the intro screens again.</p>
          <Button variant="secondary" className="mt-4" onClick={resetOnboarding}>
            Replay the welcome
          </Button>
        </CardContent>
      </Card>

      {/* Account */}
      <Card className="mt-4">
        <CardContent>
          <h3 className="text-base font-semibold text-fg">Account</h3>
          <p className="mt-1 text-sm text-muted">
            {user ? (
              <>
                Signed in as <span className="text-fg">{user.email}</span>.
              </>
            ) : (
              "Signed in."
            )}
          </p>
          <Button variant="secondary" className="mt-4" onClick={signOut}>
            <LogOut size={16} /> Sign out
          </Button>
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-xs text-muted">
        Trade-Assist · Educational use only · Not financial advice · Paper trading only
      </p>
    </div>
  );
}
