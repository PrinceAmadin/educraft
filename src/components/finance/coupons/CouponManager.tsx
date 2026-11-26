"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LuCheck, LuPlus, LuTicket, LuTriangleAlert, LuX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Surface } from "@/components/ui/surface";
import { Field } from "@/components/forms/Field";
import { FormActions } from "@/components/forms/FormActions";
import { FormSection } from "@/components/forms/FormSection";
import { formatNaira } from "@/lib/utils";
import { cn } from "@/lib/utils";

export interface CouponRow {
  id: string;
  code: string;
  label: string | null;
  percentOff: number | null;
  amountOffNgn: number | null;
  friendPercentOff: number | null;
  serviceCodes: string[];
  minOrderNgn: number | null;
  expiresAt: string | null;
  maxRedemptions: number | null;
  expectedReferrals: number | null;
  note: string | null;
  status: string;
  createdByRole: string;
  overrideCap: boolean;
  overrideReason: string | null;
  decisionNote: string | null;
  owner: { id: string; clientId: string; fullName: string } | null;
  timesUsed: number;
  discountGiven: number;
  broughtIn: number;
}

interface Props {
  coupons: CouponRow[];
  cooNeedsApproval: boolean;
  ceilings: { directMaxPercent: number; referredMaxPercent: number };
  isFounder: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Live",
  PENDING_APPROVAL: "Waiting for the CEO",
  REVOKED: "Withdrawn",
  DRAFT: "Not switched on",
};

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "text-success",
  PENDING_APPROVAL: "text-gold",
  REVOKED: "text-text-tertiary",
  DRAFT: "text-text-tertiary",
};

export function CouponManager({ coupons, cooNeedsApproval, ceilings, isFounder }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function send(url: string, body: unknown, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, {
        method: url.endsWith("/coupons") ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "That didn't work. Try again.");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function toggleApproval(next: boolean) {
    setBusy("approval");
    setError(null);
    try {
      const res = await fetch("/api/admin/coupons/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cooNeedsApproval: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "That didn't work. Try again.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const waiting = coupons.filter((c) => c.status === "PENDING_APPROVAL");
  const rest = coupons.filter((c) => c.status !== "PENDING_APPROVAL");

  return (
    <div className="space-y-8">
      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger">
          <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {/* What the maths allows, so nobody has to guess */}
      <Surface tone="zone" padding="md" className="space-y-1">
        <p className="meta-label">The deepest a code can go on its own</p>
        <p className="text-sm text-text-secondary">
          A direct order can carry{" "}
          <span className="font-mono font-medium text-text-primary">{ceilings.directMaxPercent}%</span> off; one that
          came through an ambassador can carry{" "}
          <span className="font-mono font-medium text-text-primary">{ceilings.referredMaxPercent}%</span>. Past that the
          order cannot pay the people working on it out of its own price, and only the CEO can approve the difference
          coming from the buckets.
        </p>
      </Surface>

      {isFounder ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-text-primary">The COO&apos;s codes</p>
            <p className="text-sm text-text-secondary">
              {cooNeedsApproval
                ? "They give nothing away until you approve each one."
                : "They go live the moment he creates them."}
            </p>
          </div>
          <Button
            variant={cooNeedsApproval ? "default" : "outline"}
            disabled={busy === "approval"}
            onClick={() => toggleApproval(!cooNeedsApproval)}
          >
            {cooNeedsApproval ? "Let him grant them directly" : "Require my approval"}
          </Button>
        </div>
      ) : null}

      {waiting.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-text-primary">
            {isFounder ? "Waiting for your approval" : "Waiting for the CEO"}
          </h2>
          <div className="divide-y divide-border">
            {waiting.map((c) => (
              <CouponLine key={c.id} coupon={c}>
                {isFounder ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busy === c.id}
                      onClick={() => send(`/api/admin/coupons/${c.id}`, { action: "approve" }, c.id)}
                    >
                      <LuCheck className="mr-1.5 size-4" aria-hidden />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === c.id}
                      onClick={() => send(`/api/admin/coupons/${c.id}`, { action: "reject" }, c.id)}
                    >
                      <LuX className="mr-1.5 size-4" aria-hidden />
                      Refuse
                    </Button>
                  </div>
                ) : null}
              </CouponLine>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-text-primary">Codes</h2>
          <Button variant="outline" onClick={() => setShowForm((v) => !v)}>
            <LuPlus className="mr-1.5 size-4" aria-hidden />
            {showForm ? "Close" : "New code"}
          </Button>
        </div>

        {showForm ? (
          <NewCouponForm
            isFounder={isFounder}
            ceilings={ceilings}
            busy={busy === "create"}
            onCreate={async (body) => {
              const ok = await send("/api/admin/coupons", body, "create");
              if (ok) setShowForm(false);
              return ok;
            }}
          />
        ) : null}

        {rest.length === 0 ? (
          <p className="flex items-center gap-2 py-6 text-sm text-text-tertiary">
            <LuTicket className="size-4" aria-hidden />
            No codes yet.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {rest.map((c) => (
              <CouponLine key={c.id} coupon={c}>
                {c.status === "ACTIVE" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === c.id}
                    onClick={() => send(`/api/admin/coupons/${c.id}`, { action: "revoke" }, c.id)}
                  >
                    Withdraw
                  </Button>
                ) : null}
              </CouponLine>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function offLabel(c: CouponRow): string {
  if (c.percentOff != null) return `${c.percentOff}% off`;
  if (c.amountOffNgn != null) return `${formatNaira(c.amountOffNgn)} off`;
  return "nothing off";
}

function CouponLine({ coupon: c, children }: { coupon: CouponRow; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 py-4">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-medium text-text-primary">{c.code}</span>
          <span className={cn("text-xs font-medium", STATUS_TONE[c.status])}>
            {STATUS_LABEL[c.status] ?? c.status}
          </span>
          {c.overrideCap ? (
            <span className="text-xs font-medium text-gold">CEO override</span>
          ) : null}
        </div>
        <p className="text-sm text-text-secondary">
          {offLabel(c)}
          {c.owner ? ` for ${c.owner.fullName} (${c.owner.clientId})` : " for anyone with the code"}
          {c.friendPercentOff != null ? ` · ${c.friendPercentOff}% for whoever they bring` : ""}
        </p>
        {c.label ? <p className="text-sm text-text-secondary">{c.label}</p> : null}
        <p className="text-xs text-text-tertiary">
          Used <span className="font-mono">{c.timesUsed}</span>
          {c.maxRedemptions != null ? <span className="font-mono"> of {c.maxRedemptions}</span> : null} · given away{" "}
          <span className="font-mono">{formatNaira(c.discountGiven)}</span> · brought in{" "}
          <span className="font-mono">{c.broughtIn}</span>
          {c.expectedReferrals != null ? <span className="font-mono"> of {c.expectedReferrals}</span> : null}
        </p>
        {c.overrideReason ? <p className="text-xs text-text-tertiary">Reason: {c.overrideReason}</p> : null}
      </div>
      {children}
    </div>
  );
}

function NewCouponForm({
  isFounder,
  ceilings,
  busy,
  onCreate,
}: {
  isFounder: boolean;
  ceilings: { directMaxPercent: number; referredMaxPercent: number };
  busy: boolean;
  onCreate: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [code, setCode] = useState("");
  const [percentOff, setPercentOff] = useState("");
  const [friendPercentOff, setFriendPercentOff] = useState("");
  const [ownerClientId, setOwnerClientId] = useState("");
  const [expectedReferrals, setExpectedReferrals] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("1");
  const [label, setLabel] = useState("");
  const [overrideCap, setOverrideCap] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const pct = Number(percentOff);
  const overCeiling = percentOff !== "" && Number.isFinite(pct) && pct > ceilings.directMaxPercent;

  return (
    <form
      className="space-y-6 py-2"
      onSubmit={async (e) => {
        e.preventDefault();
        await onCreate({
          code,
          label: label || null,
          percentOff: percentOff ? Number(percentOff) : null,
          friendPercentOff: friendPercentOff ? Number(friendPercentOff) : null,
          ownerClientId: ownerClientId || null,
          expectedReferrals: expectedReferrals ? Number(expectedReferrals) : null,
          maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
          overrideCap: overrideCap || undefined,
          overrideReason: overrideCap ? overrideReason : null,
        });
      }}
    >
      <FormSection title="The code" description="What the client types at checkout.">
        <Field label="Code" htmlFor="coupon-code" required>
          <Input
            id="coupon-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="BRING10"
            required
          />
        </Field>
        <Field label="Percentage off" htmlFor="coupon-pct" required>
          <Input
            id="coupon-pct"
            type="number"
            min={1}
            max={100}
            value={percentOff}
            onChange={(e) => setPercentOff(e.target.value)}
            placeholder="50"
            required
          />
        </Field>
        <Field label="What is it for?" htmlFor="coupon-label">
          <Input
            id="coupon-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Brings 10 students"
          />
        </Field>
      </FormSection>

      <FormSection
        title="Who it belongs to"
        description="Tie it to one client and only their own order gets the discount. Anyone else who types it is recorded as having been brought in by them — which is how a client who does not want to be an ambassador still gets the credit."
      >
        <Field
          label="Client's internal id"
          htmlFor="coupon-owner"
          hint="Leave blank to let anyone with the code use it."
        >
          <Input id="coupon-owner" value={ownerClientId} onChange={(e) => setOwnerClientId(e.target.value)} />
        </Field>
        <Field
          label="Percentage for whoever they bring"
          htmlFor="coupon-friend"
          hint="Leave blank and the people they bring pay full price — they are still recorded as theirs."
        >
          <Input
            id="coupon-friend"
            type="number"
            min={1}
            max={100}
            value={friendPercentOff}
            onChange={(e) => setFriendPercentOff(e.target.value)}
          />
        </Field>
        <Field label="Clients promised" htmlFor="coupon-expected" hint="So you can see promised against delivered.">
          <Input
            id="coupon-expected"
            type="number"
            min={1}
            max={500}
            value={expectedReferrals}
            onChange={(e) => setExpectedReferrals(e.target.value)}
            placeholder="10"
          />
        </Field>
        <Field label="How many times it can be used" htmlFor="coupon-max" hint="Leave blank for no limit.">
          <Input
            id="coupon-max"
            type="number"
            min={1}
            value={maxRedemptions}
            onChange={(e) => setMaxRedemptions(e.target.value)}
          />
        </Field>
      </FormSection>

      {overCeiling ? (
        <Surface tone="zone" padding="md" className="space-y-3">
          <p className="flex items-start gap-2 text-sm text-text-secondary">
            <LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
            {ceilings.directMaxPercent}% is the deepest an order can fund on its own. Beyond that the difference comes
            out of the buckets.
          </p>
          {isFounder ? (
            <>
              <label className="flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={overrideCap}
                  onChange={(e) => setOverrideCap(e.target.checked)}
                  className="size-4"
                />
                I am funding the difference anyway
              </label>
              {overrideCap ? (
                <Field label="Why it is worth it" htmlFor="coupon-reason" required>
                  <Textarea
                    id="coupon-reason"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    required
                  />
                </Field>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-text-secondary">Only the CEO can approve a code that deep.</p>
          )}
        </Surface>
      ) : null}

      <FormActions>
        <Button type="submit" disabled={busy || !code || !percentOff}>
          {busy ? "Creating…" : isFounder ? "Create and switch on" : "Send for approval"}
        </Button>
      </FormActions>
    </form>
  );
}
