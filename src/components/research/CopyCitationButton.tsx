"use client";

import * as React from "react";
import { LuCheck, LuCopy } from "react-icons/lu";

/**
 * A tiny "Copy citation" button on each supervisor-page reference card. Copies
 * the plain-text formatted citation (in the project's referencing style) so
 * the supervisor can paste it into their own notes. Print-hidden because the
 * printed page shows the full metadata already.
 */
export function CopyCitationButton({ citation }: { citation: string }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(citation);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — user can copy the DOI link instead */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy the formatted citation"
      className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground print:hidden"
    >
      {copied ? <LuCheck className="size-3.5" aria-hidden /> : <LuCopy className="size-3.5" aria-hidden />}
      {copied ? "Copied" : "Copy citation"}
    </button>
  );
}
