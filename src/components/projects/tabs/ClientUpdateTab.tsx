"use client";

import * as React from "react";
import { LuCheck, LuCopy, LuMessageCircle, LuEye } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { buildClientResearchMessage, greetingForHour, nigeriaHour } from "@/lib/client-research-message";
import { toWaNumber, waLink } from "@/lib/whatsapp";
import type { ResearchSummary } from "@/lib/services/research-summary";

/**
 * Management-only (this tab lives on the admin project page, which workers
 * can't reach). A ready-to-send message with the real numbers filled in —
 * editable before copying, since each client conversation is slightly different.
 * The message now carries the public supervisor URL, so the client can forward
 * it straight to their supervisor with no sign-in on the other side.
 */
export function ClientUpdateTab({
  clientFullName,
  projectCode,
  clientId,
  clientPhone,
  documentsUrl,
  supervisorUrl,
  supervisorViews,
  supervisorFirstViewedAt,
  supervisorLastViewedAt,
  shared,
  summary,
}: {
  clientFullName: string;
  projectCode: string;
  clientId: string;
  clientPhone: string | null;
  documentsUrl: string;
  /** Public supervisor URL (null before research passes or on old jobs without a token — but the backfill mints them). */
  supervisorUrl: string | null;
  /** Access counters, so we can show whether the supervisor has actually opened it. */
  supervisorViews: number;
  supervisorFirstViewedAt: string | null;
  supervisorLastViewedAt: string | null;
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
        supervisorUrl,
        summary,
        greeting: greetingForHour(nigeriaHour()),
      })
    );
  }, [clientFullName, projectCode, clientId, documentsUrl, supervisorUrl, summary]);

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

  const wa = toWaNumber(clientPhone);
  const whatsappHref = wa && text ? waLink(wa, text) : null;

  const accessLine = supervisorUrl
    ? supervisorFirstViewedAt
      ? `Supervisor opened this ${supervisorViews} time${supervisorViews === 1 ? "" : "s"}${supervisorLastViewedAt ? `, last on ${new Date(supervisorLastViewedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}.`
      : "Supervisor hasn't opened this yet."
    : null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Research update for the client</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Filled in from this project&apos;s research results. Edit anything you like, then copy or send by
          WhatsApp. Only management can see this.
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
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={copy} disabled={!text}>
          {copied ? <LuCheck className="size-4" aria-hidden /> : <LuCopy className="size-4" aria-hidden />}
          {copied ? "Copied" : "Copy message"}
        </Button>
        {whatsappHref ? (
          <Button type="button" variant="outline" asChild disabled={!text}>
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
              <LuMessageCircle className="size-4" aria-hidden />
              Send on WhatsApp
            </a>
          </Button>
        ) : (
          <Button type="button" variant="outline" disabled title={!wa ? "No WhatsApp number on file for this client." : "The message is empty."}>
            <LuMessageCircle className="size-4" aria-hidden />
            Send on WhatsApp
          </Button>
        )}
      </div>
      {accessLine ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LuEye className="size-3.5" aria-hidden /> {accessLine}
        </p>
      ) : null}
    </section>
  );
}
