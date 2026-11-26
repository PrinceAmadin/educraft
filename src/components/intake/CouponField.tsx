"use client";

import * as React from "react";
import { useFormContext } from "react-hook-form";
import { LuCheck, LuTicket } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/Field";
import { formatNaira } from "@/lib/utils";
import type { IntakeSubmitInput } from "@/lib/validations/intake";

export interface AppliedCoupon {
  code: string;
  discountAmount: number;
  message: string;
}

/**
 * "Have a code?" on the review step. The server prices it — this never works
 * the discount out itself — and the figure it returns is only a quote: the real
 * charge is priced again when the order is placed.
 */
export function CouponField({
  serviceCode,
  coupon,
  onCoupon,
}: {
  serviceCode: string;
  coupon: AppliedCoupon | null;
  onCoupon: (coupon: AppliedCoupon | null) => void;
}) {
  const { getValues, setValue } = useFormContext<IntakeSubmitInput>();
  const [code, setCode] = React.useState("");
  const [checking, setChecking] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  async function apply() {
    const typed = code.trim();
    if (!typed) return;
    setChecking(true);
    setProblem(null);
    try {
      const v = getValues();
      const res = await fetch("/api/intake/coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: typed,
          serviceCode,
          serviceVariantId: v.serviceVariantId || null,
          chapters: v.chapters ?? undefined,
          isExpressDelivery: Boolean(v.isExpressDelivery),
          referralCode: v.referralCode || null,
          email: v.email || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setProblem(data.reason || "We couldn't apply that code.");
        onCoupon(null);
        setValue("couponCode", "");
        return;
      }
      onCoupon({ code: data.code, discountAmount: data.discountAmount, message: data.message });
      setValue("couponCode", data.code);
    } catch {
      setProblem("We couldn't reach EduCraft just then. Try again.");
    } finally {
      setChecking(false);
    }
  }

  function remove() {
    onCoupon(null);
    setValue("couponCode", "");
    setCode("");
    setProblem(null);
  }

  if (coupon) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-zone p-4 text-sm">
        <span className="flex items-center gap-2 text-foreground">
          <LuCheck className="size-4 text-success" aria-hidden />
          <span className="font-mono font-medium">{coupon.code}</span>
          <span className="text-muted-foreground">
            {coupon.discountAmount > 0 ? `− ${formatNaira(coupon.discountAmount)}` : coupon.message}
          </span>
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={remove}>
          Remove
        </Button>
      </div>
    );
  }

  return (
    <Field label="Have a code?" htmlFor="couponCode" hint="Only if EduCraft gave you one." error={problem ?? undefined}>
      <div className="flex gap-2">
        <Input
          id="couponCode"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Enter your code"
          autoComplete="off"
          className="flex-1"
        />
        <Button type="button" variant="outline" onClick={apply} disabled={checking || !code.trim()}>
          <LuTicket className="mr-1.5 size-4" aria-hidden />
          {checking ? "Checking…" : "Apply"}
        </Button>
      </div>
    </Field>
  );
}
