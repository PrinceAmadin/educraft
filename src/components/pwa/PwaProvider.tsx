"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { Plus, Share } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Chrome/Edge/Android's install event; not in the DOM lib. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaContextValue {
  /** True when the app can be installed from here (a prompt is ready, or it's iOS Safari). */
  canInstall: boolean;
  /** Running as the installed app already. */
  installed: boolean;
  promptInstall: () => Promise<void>;
}

const PwaContext = React.createContext<PwaContextValue>({
  canInstall: false,
  installed: false,
  promptInstall: async () => undefined,
});

export const usePwa = () => React.useContext(PwaContext);

function detectIos(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

function detectStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Registers the service worker, keeps it told who is signed in (so saved pages
 * never cross between people), tracks online/offline on <html data-offline>, and
 * owns the install prompt for the whole app.
 */
export function PwaProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? null;

  const deferred = React.useRef<BeforeInstallPromptEvent | null>(null);
  const [hasPrompt, setHasPrompt] = React.useState(false);
  const [isIos, setIsIos] = React.useState(false);
  const [installed, setInstalled] = React.useState(false);
  const [iosHelpOpen, setIosHelpOpen] = React.useState(false);

  // Service worker: production only — in dev it would serve stale bundles.
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  // Tell the worker who is signed in, so saved pages are kept per person. "Signed out" is
  // only sent once the server confirms it: with no signal next-auth cannot fetch the
  // session and reports null too, and acting on that would wipe the saved pages exactly
  // when they are needed. (Explicit sign-out wipes them itself — see signOutAndClear.)
  React.useEffect(() => {
    if (status === "loading" || !("serviceWorker" in navigator)) return;
    let cancelled = false;

    const send = (id: string | null) =>
      navigator.serviceWorker.ready.then((reg) => {
        if (!cancelled) reg.active?.postMessage({ type: "session", userId: id });
      });

    if (userId) {
      void send(userId);
    } else {
      void fetch("/api/auth/session", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error("session unavailable"))))
        .then((body: { user?: unknown } | null) => {
          if (!body?.user) void send(null);
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [status, userId]);

  // Offline flag for CSS (greys out submit buttons while there's no signal).
  React.useEffect(() => {
    const apply = () => document.documentElement.toggleAttribute("data-offline", !navigator.onLine);
    apply();
    window.addEventListener("online", apply);
    window.addEventListener("offline", apply);
    return () => {
      window.removeEventListener("online", apply);
      window.removeEventListener("offline", apply);
    };
  }, []);

  // Install prompt state.
  React.useEffect(() => {
    setIsIos(detectIos());
    setInstalled(detectStandalone());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred.current = e as BeforeInstallPromptEvent;
      setHasPrompt(true);
    };
    const onInstalled = () => {
      deferred.current = null;
      setHasPrompt(false);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = React.useCallback(async () => {
    const event = deferred.current;
    if (event) {
      deferred.current = null;
      setHasPrompt(false);
      await event.prompt();
      await event.userChoice.catch(() => undefined);
      return;
    }
    // iOS has no install API: show the Share → Add to Home Screen steps.
    setIosHelpOpen(true);
  }, []);

  const value = React.useMemo(
    () => ({ canInstall: !installed && (hasPrompt || isIos), installed, promptInstall }),
    [installed, hasPrompt, isIos, promptInstall]
  );

  return (
    <PwaContext.Provider value={value}>
      {children}

      <Dialog open={iosHelpOpen} onOpenChange={setIosHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install EduCraft HQ</DialogTitle>
            <DialogDescription>Add it to your home screen and open it like any other app.</DialogDescription>
          </DialogHeader>
          <ol className="space-y-4 text-sm text-foreground">
            <li className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zone font-mono text-xs">1</span>
              <span className="pt-0.5">
                Open this page in <strong>Safari</strong>, then tap the <Share className="mx-0.5 inline h-4 w-4 align-text-bottom" />{" "}
                <strong>Share</strong> button.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zone font-mono text-xs">2</span>
              <span className="pt-0.5">
                Scroll down and tap <Plus className="mx-0.5 inline h-4 w-4 align-text-bottom" /> <strong>Add to Home Screen</strong>.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zone font-mono text-xs">3</span>
              <span className="pt-0.5">
                Tap <strong>Add</strong>. Open EduCraft from your home screen from now on.
              </span>
            </li>
          </ol>
        </DialogContent>
      </Dialog>
    </PwaContext.Provider>
  );
}
