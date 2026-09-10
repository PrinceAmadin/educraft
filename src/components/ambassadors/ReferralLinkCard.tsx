"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { referralLink } from "@/lib/ambassador";

export function ReferralLinkCard({ code }: { code: string }) {
  const [link, setLink] = React.useState(`/intake?ref=${code}`);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    try {
      setLink(referralLink(window.location.origin, code));
    } catch {
      /* keep the relative fallback */
    }
  }, [code]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the field is selectable */
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Referral link</h2>
        <span className="font-mono text-xs text-muted-foreground">{code}</span>
      </div>
      <div className="mt-2 flex items-stretch gap-2">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-border bg-input px-3 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Referral link"
        />
        <Button type="button" size="sm" variant="outline" onClick={copy} className="shrink-0">
          {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
