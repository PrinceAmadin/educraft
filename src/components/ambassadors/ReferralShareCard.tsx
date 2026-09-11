"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { LuMessageCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ReferralShareCard({
  code,
  link,
  qrDataUrl,
}: {
  code: string;
  link: string;
  qrDataUrl: string;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* field is selectable as a fallback */
    }
  }

  const waHref = `https://wa.me/?text=${encodeURIComponent(
    `Get affordable academic help from EduCraft — start here: ${link}`
  )}`;

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          My referral link
        </h2>
        <span className="font-mono text-xs text-muted-foreground">{code}</span>
      </div>

      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <Input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-sm"
            aria-label="Referral link"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={copy}>
              {copied ? (
                <Check className="size-4 text-success" aria-hidden />
              ) : (
                <Copy className="size-4" aria-hidden />
              )}
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={waHref} target="_blank" rel="noopener noreferrer">
                <LuMessageCircle className="size-4" aria-hidden />
                Share on WhatsApp
              </a>
            </Button>
          </div>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element -- generated data URI */}
        <img
          src={qrDataUrl}
          alt={`QR code for ${link}`}
          width={112}
          height={112}
          className="shrink-0 rounded-lg border border-border bg-white p-1"
        />
      </div>
    </div>
  );
}
