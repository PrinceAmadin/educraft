"use client";

import * as React from "react";
import { LuCheck, LuCopy } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { buildClientResearchMessage, greetingForHour, nigeriaHour } from "@/lib/client-research-message";
import type { ResearchSummary } from "@/lib/services/research-summary";

/**
 * Management-only (this tab lives on the admin project page, which workers
 * can't reach). A ready-to-send message with the real numbers filled in —
 * editable before copying, since each client conversation is slightly different.
 */
export function ClientUpdateTab({
  clientFullName,
  projectCode,
  clientId,
  documentsUrl,
  shared,
  summary,
}: {
  clientFullName: string;
  projectCode: string;
  clientId: string;
  documentsUrl: string;
  /** The research is visible in the client's Documents tab (so the link has something to show). */
  shared: boolean;
  summary: ResearchSummary | null;
}) {
  const [text, setText] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  // Built after mount: the greeting depends on the viewer's clock.
  React.useEffect(() => {
    if (!summary) return;
    setText(
      buildClientResearchMessage({
        clientFullName,
        projectCode,
        clientId,
        documentsUrl,
        summary,
        greeting: greetingForHour(nigeriaHour()),
      })
    );
  }, [clientFullName, projectCode, clientId, documentsUrl, summary]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the text is selectable */
    }
  }

  if (!summary) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing to send yet. This message appears once the worker has finished the research step for this
        project.
      </p>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Research update for the client</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Filled in from this project&apos;s research results. Edit anything you like, then copy. Only
          management can see this.
        </p>
        {!shared ? (
          <p className="mt-2 rounded-xl bg-gold/10 p-3 text-xs text-foreground">
            Share the research from the Documents tab first, so the client finds the papers when they open the link.
          </p>
        ) : null}
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={16}
        aria-label="Client research update message"
        className="text-sm leading-relaxed"
      />
      <Button type="button" onClick={copy} disabled={!text}>
        {copied ? <LuCheck className="size-4" aria-hidden /> : <LuCopy className="size-4" aria-hidden />}
        {copied ? "Copied" : "Copy message"}
      </Button>
    </section>
  );
}
