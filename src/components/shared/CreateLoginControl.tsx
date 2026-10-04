"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, CircleCheck, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/Field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { createLoginSchema, type CreateLoginInput } from "@/lib/validations/portal-access";

/**
 * Grants portal access — creates the User row and links it back to the
 * worker/ambassador profile. Without this there is no way for either role to
 * ever sign in (the profile's `userId` had nothing that ever set it).
 *
 * When `canLink` is set, the record's email already belongs to a login (the same
 * person holding another role, e.g. an executive): we link onto that one login
 * instead of creating a second set of credentials, so no password is asked for.
 */
export function CreateLoginControl({
  endpoint,
  hasLogin,
  prefillEmail,
  canLink = false,
}: {
  endpoint: string;
  hasLogin: boolean;
  prefillEmail: string;
  canLink?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [linking, setLinking] = React.useState(false);
  const [linkError, setLinkError] = React.useState<string | null>(null);

  if (hasLogin) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
        <CircleCheck className="size-3.5" aria-hidden />
        Portal login active
      </span>
    );
  }

  if (canLink) {
    const linkNow = async () => {
      setLinkError(null);
      setLinking(true);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: prefillEmail, link: true }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Could not link the login.");
        }
        router.refresh();
      } catch (err) {
        setLinkError(err instanceof Error ? err.message : "Could not link the login.");
        setLinking(false);
      }
    };
    return (
      <div className="inline-flex flex-col items-start gap-1">
        <Button type="button" size="sm" variant="outline" onClick={linkNow} disabled={linking}>
          {linking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
          Link to existing login
        </Button>
        {linkError ? (
          <p className="flex items-start gap-1.5 text-xs text-danger">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {linkError}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <KeyRound className="size-4" aria-hidden />
        Create login
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {open ? (
            <LoginForm
              endpoint={endpoint}
              prefillEmail={prefillEmail}
              onDone={() => {
                setOpen(false);
                router.refresh();
              }}
              onCancel={() => setOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function LoginForm({
  endpoint,
  prefillEmail,
  onDone,
  onCancel,
}: {
  endpoint: string;
  prefillEmail: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateLoginInput>({
    resolver: zodResolver(createLoginSchema),
    defaultValues: { email: prefillEmail, password: "" },
  });

  const onSubmit = async (data: CreateLoginInput) => {
    setSubmitError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not create a login.");
      }
      onDone();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not create a login.");
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Create portal login</DialogTitle>
        <DialogDescription>They can sign in immediately with this password.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Field label="Email" required htmlFor="login-email" error={errors.email?.message}>
          <Input id="login-email" type="email" inputMode="email" autoComplete="off" {...register("email")} />
        </Field>
        <Field
          label="Password"
          required
          htmlFor="login-password"
          error={errors.password?.message}
          hint="At least 8 characters — share it with them securely"
        >
          <Input id="login-password" type="password" autoComplete="new-password" {...register("password")} />
        </Field>

        {submitError ? (
          <p className="flex items-start gap-2 text-sm text-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {submitError}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Create login
          </Button>
        </div>
      </form>
    </>
  );
}
