"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** The one public URL where a prospective worker registers — surfaced here so it doesn't have to be shared from memory. */
export function WorkerRegistrationLinkCard() {
  const [link, setLink] = React.useState("/apply/worker");
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    setLink(`${window.location.origin}/apply/worker`);
  }, []);

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
    <div className="surface p-4">
      <h2 className="text-sm font-semibold text-foreground">Worker registration link</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Send this to anyone who should apply — they set their own password and land in{" "}
        <span className="font-medium text-foreground">Applications</span> below for you to approve.
      </p>
      <div className="mt-3 flex items-stretch gap-2">
        <Input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 font-mono text-xs"
          aria-label="Worker registration link"
        />
        <Button type="button" size="sm" variant="outline" onClick={copy} className="shrink-0">
          {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
