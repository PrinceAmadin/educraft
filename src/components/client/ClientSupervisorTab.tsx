"use client";

import * as React from "react";
import { LuCheck, LuCopy, LuExternalLink, LuMail, LuMessageCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Client dashboard tab: share the finished research with a supervisor via a
 * public link that needs no sign-in. Three send options, all zero-cost:
 * WhatsApp (opens a contact chooser so the client picks their supervisor),
 * email (opens the mail client), and copy. The URL is generated at
 * PASS-time and stays the same forever (a research re-run mints a fresh one).
 */
export function ClientSupervisorTab({
  projectCode,
  projectTitle,
  supervisorUrl,
  supervisorViews,
  supervisorFirstViewedAt,
  preview = false,
}: {
  projectCode: string;
  projectTitle: string;
  supervisorUrl: string | null;
  supervisorViews: number;
  supervisorFirstViewedAt: string | null;
  preview?: boolean;
}) {
  const defaultMessage = React.useMemo(() => {
    if (!supervisorUrl) return "";
    return [
      "Hello,",
      "",
      `Here is the reference bibliography for my project — ${projectTitle} (${projectCode}). You can open it in your browser; no sign-in is needed:`,
      supervisorUrl,
      "",
      "The papers we found free copies of are downloadable straight from the page; the paywalled ones link to their DOI so you can open them through the university library.",
      "",
      "Thank you.",
    ].join("\n");
  }, [projectCode, projectTitle, supervisorUrl]);

  const [message, setMessage] = React.useState(defaultMessage);
  React.useEffect(() => setMessage(defaultMessage), [defaultMessage]);
  const [copied, setCopied] = React.useState<"link" | "message" | null>(null);

  if (!supervisorUrl) {
    return (
      <div className="rounded-2xl bg-zone p-5 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Reference bibliography — not ready yet</p>
        <p className="mt-1">
          Your specialist is still gathering references for your project. Once the research step finishes, a shareable
          link will appear here for you to send to your supervisor.
        </p>
      </div>
    );
  }

  const subject = `Reference bibliography for ${projectTitle} (${projectCode})`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const mailHref = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;

  async function copy(what: "link" | "message", value: string) {
    if (preview) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard blocked — the text is still selectable */
    }
  }

  const opened =
    supervisorFirstViewedAt != null
      ? `Your supervisor has opened this ${supervisorViews} time${supervisorViews === 1 ? "" : "s"}.`
      : null;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-base font-semibold text-foreground">Share your reference list with your supervisor</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The link opens a professional bibliography page. Your supervisor can read the papers we hold copies of, and open
          the paywalled ones through your university library — all in one place, no sign-in.
        </p>
      </section>

      <section className="space-y-2">
        <p className="text-sm font-medium text-foreground">The supervisor link</p>
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-zone p-3 text-sm">
          <a
            href={supervisorUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 break-all font-mono text-primary hover:underline"
          >
            {supervisorUrl}
            <LuExternalLink className="size-3.5 shrink-0" aria-hidden />
          </a>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => copy("link", supervisorUrl)}
            disabled={preview}
          >
            {copied === "link" ? <LuCheck className="size-4" aria-hidden /> : <LuCopy className="size-4" aria-hidden />}
            {copied === "link" ? "Copied" : "Copy link"}
          </Button>
        </div>
        {opened ? <p className="text-xs text-muted-foreground">{opened}</p> : <p className="text-xs text-muted-foreground">Your supervisor hasn&apos;t opened this yet.</p>}
      </section>

      <section className="space-y-3">
        <p className="text-sm font-medium text-foreground">A short note you can send with the link</p>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={10}
          disabled={preview}
          className="text-sm leading-relaxed"
          aria-label="Message to your supervisor"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" asChild disabled={preview || !message.trim()}>
            <a href={waHref} target="_blank" rel="noopener noreferrer">
              <LuMessageCircle className="size-4" aria-hidden />
              Send on WhatsApp
            </a>
          </Button>
          <Button type="button" variant="outline" asChild disabled={preview || !message.trim()}>
            <a href={mailHref}>
              <LuMail className="size-4" aria-hidden />
              Send by email
            </a>
          </Button>
          <Button type="button" variant="outline" onClick={() => copy("message", message)} disabled={preview || !message.trim()}>
            {copied === "message" ? <LuCheck className="size-4" aria-hidden /> : <LuCopy className="size-4" aria-hidden />}
            {copied === "message" ? "Copied" : "Copy message"}
          </Button>
        </div>
      </section>
    </div>
  );
}
