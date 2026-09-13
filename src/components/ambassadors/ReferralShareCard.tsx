"use client";

import * as React from "react";
import { LuCheck, LuCopy, LuMessageCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** The ambassador's one tool — link, copy, WhatsApp share and QR — in a quiet zone. */
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
    <section aria-labelledby="referral-heading" className="rounded-2xl bg-zone p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="referral-heading" className="text-[15px] font-semibold text-foreground">
          My referral link
        </h2>
        <span className="font-mono text-xs text-muted-foreground">{code}</span>
      </div>

      <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <Input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="bg-card font-mono text-sm"
            aria-label="Referral link"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={copy}>
              {copied ? <LuCheck className="size-4" aria-hidden /> : <LuCopy className="size-4" aria-hidden />}
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
          className="shrink-0 self-start rounded-lg bg-white p-1.5 shadow-soft sm:self-auto"
        />
      </div>
    </section>
  );
}
