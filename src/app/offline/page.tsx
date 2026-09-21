import type { Metadata } from "next";
import { LuWifiOff } from "react-icons/lu";
import { LogoLockup } from "@/components/shared/Logo";

export const metadata: Metadata = { title: "Offline" };

/**
 * What the service worker shows when there is no signal and no safe saved copy of
 * the page (money pages and admin pages are never saved). Deliberately plain: it
 * has to render from the cache, so the retry is one inline script rather than a
 * client component whose JavaScript might not be there.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <LogoLockup href="/dashboard" size="sm" />
      <LuWifiOff className="h-10 w-10 text-muted-foreground" aria-hidden />
      <div className="space-y-2">
        <h1 className="text-xl font-bold text-foreground">Reconnecting…</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          There&apos;s no signal right now. This page is never saved on your phone, so it will load again by itself as soon as
          you&apos;re back online.
        </p>
      </div>
      <a
        href=""
        className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground"
      >
        Try again
      </a>
      <script dangerouslySetInnerHTML={{ __html: "addEventListener('online',function(){location.reload()})" }} />
    </main>
  );
}
