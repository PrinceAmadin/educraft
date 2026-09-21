"use client";

import * as React from "react";
import { BellRing, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwa } from "@/components/pwa/PwaProvider";
import { usePush } from "@/hooks/use-push";

const DISMISS_KEY = "ec:pwa-banner-dismissed";
const QUIET_DAYS = 14;

function recentlyDismissed(kind: string): boolean {
  try {
    const at = Number(localStorage.getItem(`${DISMISS_KEY}:${kind}`));
    return Boolean(at) && Date.now() - at < QUIET_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/**
 * One quiet nudge at the top of the dashboard: install the app first, then (once it
 * is installed) turn on notifications. Each can be dismissed for two weeks.
 */
export function PwaBanner() {
  const { canInstall, installed, promptInstall } = usePwa();
  const push = usePush();
  const [hidden, setHidden] = React.useState<Record<string, boolean>>({});

  // localStorage isn't readable on the server; read it after mount.
  React.useEffect(() => {
    setHidden({ install: recentlyDismissed("install"), push: recentlyDismissed("push") });
  }, []);

  const dismiss = (kind: string) => {
    try {
      localStorage.setItem(`${DISMISS_KEY}:${kind}`, String(Date.now()));
    } catch {
      /* storage blocked: it just comes back next visit */
    }
    setHidden((h) => ({ ...h, [kind]: true }));
  };

  const kind = canInstall && hidden.install === false ? "install" : installed && push.state === "off" && hidden.push === false ? "push" : null;
  if (!kind) return null;

  const Icon = kind === "install" ? Download : BellRing;

  return (
    <div className="mb-5 flex items-center gap-3 rounded-xl bg-zone px-4 py-3">
      <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 text-sm text-foreground">
        {kind === "install" ? (
          <>
            <span className="font-medium">Install EduCraft HQ</span>
            <span className="hidden text-muted-foreground sm:inline"> to open your dashboard straight from your home screen.</span>
          </>
        ) : (
          <>
            <span className="font-medium">Turn on notifications</span>
            <span className="hidden text-muted-foreground sm:inline"> to hear about assignments and updates as they happen.</span>
          </>
        )}
      </p>
      <Button
        size="sm"
        disabled={kind === "push" && push.busy}
        onClick={() => (kind === "install" ? void promptInstall() : void push.enable())}
      >
        {kind === "install" ? "Install" : "Turn on"}
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={() => dismiss(kind)}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
