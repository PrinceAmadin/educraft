"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * EduCraft-styled replacements for the native browser `window.confirm` and
 * `alert`, served imperatively so a call site keeps its familiar shape:
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Remove this?", tone: "danger" }))) return;
 *
 * The dialog itself does no async work — it resolves the moment a button is
 * pressed; the caller's own busy/error handling runs after the await. Mount
 * <ConfirmProvider> once near the root (see src/app/providers.tsx).
 */

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" renders the action button in the destructive (red) variant. */
  tone?: "default" | "danger";
};

export type AlertOptions = {
  title: string;
  description?: string;
  okLabel?: string;
};

type Request =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: "alert"; options: AlertOptions; resolve: () => void };

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: AlertOptions) => Promise<void>;
};

const ConfirmContext = React.createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = React.useState<Request | null>(null);

  const confirm = React.useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setRequest({ kind: "confirm", options, resolve });
      }),
    []
  );

  const alert = React.useCallback(
    (options: AlertOptions) =>
      new Promise<void>((resolve) => {
        setRequest({ kind: "alert", options, resolve });
      }),
    []
  );

  // `result` is only meaningful for a confirm; an alert ignores it. Resolving a
  // promise more than once is a no-op, so React StrictMode's double-invoked
  // updater is harmless here.
  const settle = React.useCallback((result: boolean) => {
    setRequest((current) => {
      if (current) {
        if (current.kind === "confirm") current.resolve(result);
        else current.resolve();
      }
      return null;
    });
  }, []);

  const value = React.useMemo(() => ({ confirm, alert }), [confirm, alert]);

  const danger = request?.kind === "confirm" && request.options.tone === "danger";

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Dialog
        open={request !== null}
        onOpenChange={(next) => {
          if (!next) settle(false);
        }}
      >
        {request ? (
          <DialogContent
            className="max-w-md"
            // When a description is rendered Radix wires aria-describedby itself;
            // otherwise this explicit undefined opts out of its dev warning.
            aria-describedby={undefined}
          >
            <DialogHeader>
              <DialogTitle>{request.options.title}</DialogTitle>
              {request.options.description ? (
                <DialogDescription>{request.options.description}</DialogDescription>
              ) : null}
            </DialogHeader>

            <div className="flex justify-end gap-2">
              {request.kind === "confirm" ? (
                <>
                  <Button type="button" variant="outline" onClick={() => settle(false)}>
                    {request.options.cancelLabel ?? "Cancel"}
                  </Button>
                  <Button
                    type="button"
                    variant={danger ? "destructive" : "default"}
                    onClick={() => settle(true)}
                  >
                    {request.options.confirmLabel ?? "Confirm"}
                  </Button>
                </>
              ) : (
                <Button type="button" onClick={() => settle(false)}>
                  {request.options.okLabel ?? "OK"}
                </Button>
              )}
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
  return ctx.confirm;
}

export function useAlert() {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useAlert must be used within a ConfirmProvider");
  return ctx.alert;
}
