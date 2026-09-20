"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuLoaderCircle } from "react-icons/lu";

/**
 * Runs in the visitor's browser and asks the server to lock the link to this
 * device. Kept out of the page render so crawlers and link previews, which
 * only fetch HTML, can never take the link.
 */
export function ProBonoClaim({ token }: { token: string }) {
  const router = useRouter();
  const [failed, setFailed] = React.useState(false);
  const started = React.useRef(false);

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetch(`/api/probono/${encodeURIComponent(token)}/claim`, { method: "POST" })
      .then((res) => {
        if (!res.ok && res.status !== 404) throw new Error("claim failed");
        router.refresh();
      })
      .catch(() => setFailed(true));
  }, [token, router]);

  if (failed) {
    return (
      <p role="alert" className="text-sm text-danger">
        We could not open this link. Check your connection and reload the page.
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <LuLoaderCircle className="size-4 animate-spin" aria-hidden />
      Opening your form…
    </p>
  );
}
