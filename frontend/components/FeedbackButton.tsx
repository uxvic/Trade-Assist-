"use client";

import { MessageSquarePlus, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useSendFeedback } from "@/lib/api";

export function FeedbackButton() {
  const pathname = usePathname();
  const send = useSendFeedback();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  function submit() {
    if (!message.trim()) {
      toast.error("Write a quick note first.");
      return;
    }
    send.mutate(
      { message: message.trim(), page: pathname },
      {
        onSuccess: () => {
          setMessage("");
          setOpen(false);
          toast.success("Thanks — feedback sent!");
        },
        onError: (e) => toast.error("Couldn't send", { description: (e as Error).message }),
      }
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-border bg-surface/90 px-4 py-2.5 text-sm font-medium text-fg shadow-soft backdrop-blur transition-colors hover:border-primary/50"
        aria-label="Send feedback"
      >
        <MessageSquarePlus size={16} className="text-primary" /> Feedback
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:items-center sm:justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-soft">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-fg">Send feedback</h3>
              <button onClick={() => setOpen(false)} className="text-muted hover:text-fg">
                <X size={18} />
              </button>
            </div>
            <p className="mb-3 text-sm text-muted">
              Found a bug or have an idea? Tell the team — it goes straight to them.
            </p>
            <textarea
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="What's on your mind?"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={send.isPending}>
                {send.isPending ? "Sending…" : "Send"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
