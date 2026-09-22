"use client";

import { LuBell, LuBellOff, LuLogOut } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { usePush } from "@/hooks/use-push";
import { signOutAndClear } from "@/lib/pwa/sign-out";

/** Phone notifications for this device, and sign out. */
export function ClientAccountActions() {
  const push = usePush();

  return (
    <div className="space-y-5">
      <div>
        {push.state === "on" || push.state === "off" ? (
          <Button
            type="button"
            variant="outline"
            disabled={push.busy}
            onClick={() => void (push.state === "on" ? push.disable() : push.enable())}
          >
            {push.state === "on" ? <LuBellOff className="size-4" aria-hidden /> : <LuBell className="size-4" aria-hidden />}
            {push.state === "on" ? "Turn off notifications on this phone" : "Turn on notifications on this phone"}
          </Button>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            {push.state === "blocked"
              ? "Notifications are blocked in this browser's settings. Allow them there to hear when your work moves forward."
              : "This browser can't show notifications. Install the app from your browser menu to get them."}
          </p>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        className="text-danger hover:bg-danger/10 hover:text-danger"
        onClick={() => void signOutAndClear()}
      >
        <LuLogOut className="size-4" aria-hidden />
        Sign out
      </Button>
    </div>
  );
}
