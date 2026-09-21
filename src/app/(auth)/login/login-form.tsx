"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { z } from "zod";
import { LuCircleAlert, LuCircleCheck, LuEye, LuEyeOff, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

/** The form sits directly on the page — fields carry the affordance, not a card. */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");

  const [showPassword, setShowPassword] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: searchParams.get("email") ?? "", password: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setFormError(null);

    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });

    if (!result || result.error) {
      setFormError("Incorrect email or password. Please try again.");
      return;
    }

    // /dashboard reads the session server-side and forwards to the right portal.
    router.push(callbackUrl ?? "/dashboard");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {searchParams.get("passwordSet") && !formError && (
        <div role="status" className="flex items-start gap-2.5 rounded-lg bg-zone px-3.5 py-3 text-sm text-foreground">
          <LuCircleCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            Password saved. Sign in with{" "}
            {searchParams.get("email") ? <strong className="font-medium">{searchParams.get("email")}</strong> : "your email"} and your new
            password.
          </span>
        </div>
      )}

      {formError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg bg-danger/10 px-3.5 py-3 text-sm text-danger"
        >
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{formError}</span>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@educraft.ng"
          aria-invalid={!!errors.email}
          {...register("email")}
        />
        {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            className="pr-12"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-subtle transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showPassword ? (
              <LuEyeOff className="size-[18px]" aria-hidden />
            ) : (
              <LuEye className="size-[18px]" aria-hidden />
            )}
          </button>
        </div>
        {errors.password && <p className="text-xs text-danger">{errors.password.message}</p>}
      </div>

      <Button type="submit" size="lg" className="mt-2 w-full" disabled={isSubmitting}>
        {isSubmitting && <LuLoaderCircle className="size-4 animate-spin" aria-hidden />}
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-sm text-muted-foreground">
        First time signing in, or forgot your password?{" "}
        <Link href="/login/set-password" className="font-medium text-primary underline-offset-4 hover:underline">
          Set it with an email code
        </Link>
      </p>
    </form>
  );
}
