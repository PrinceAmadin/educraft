"use client";

import * as React from "react";
import { LuCheck, LuCopy } from "react-icons/lu";
import { Button } from "@/components/ui/button";

/**
 * Copies a slot's full shareable link (this site's origin + the slot path).
 * The link is what an ambassador sends to students: it opens WhatsApp with
 * "I was referred by {name}…" already typed.
 */
export function CopyLinkButton({
  path,
  label = "Copy",
  className,
}: {
  path: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard blocked (older browsers, insecure origin): fall back to a
      // hidden textarea so the copy still works.
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(ta);
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={copy}
      className={className}
      aria-label={copied ? "Link copied" : `${label} link ${path}`}
    >
      {copied ? <LuCheck className="size-4 text-success" aria-hidden /> : <LuCopy className="size-4" aria-hidden />}
      {copied ? "Copied" : label}
    </Button>
  );
}
