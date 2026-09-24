"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LuCircleAlert, LuCopy, LuLoaderCircle, LuPlus, LuRefreshCw } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import { UniversityCombobox, type UniversityOption } from "@/components/forms/UniversityCombobox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ACADEMIC_LEVELS } from "@/lib/constants";
import { buildReferralCode, tierLabel } from "@/lib/ambassadors/tier-utils";
import { referralLink } from "@/lib/ambassador";
import { createDirectoryAmbassadorSchema, type CreateDirectoryAmbassadorInput } from "@/lib/validations/ambassador-platform";
import type { AmbassadorTier } from "@prisma/client";

export interface CoreOption {
  id: string;
  fullName: string;
  tier: AmbassadorTier;
  subCount: number;
}

/**
 * "New ambassador" (Phase 3 Section 2): name, WhatsApp, school, department,
 * level, Core or Sub (and whose), a note, and a previewed BLE-LAG-847 code.
 * The server keeps the previewed code when it is still free.
 */
export function NewAmbassadorDialog({ universities, cores, partnerships = [] }: { universities: UniversityOption[]; cores: CoreOption[]; partnerships?: { id: string; organisationName: string; school: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [created, setCreated] = React.useState<{ ambassadorId: string; referralCode: string; fullName: string } | null>(null);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <LuPlus className="size-4" aria-hidden />
        New ambassador
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setCreated(null);
        }}
      >
        <DialogContent className="max-w-xl">
          {open && created ? (
            <Created {...created} onClose={() => setOpen(false)} />
          ) : open ? (
            <NewForm
              universities={universities}
              cores={cores}
              partnerships={partnerships}
              onCreated={(c) => {
                setCreated(c);
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

function Created({ ambassadorId, referralCode, fullName, onClose }: { ambassadorId: string; referralCode: string; fullName: string; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false);
  const link = React.useMemo(() => referralLink(typeof window === "undefined" ? "" : window.location.origin, referralCode), [referralCode]);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{fullName} added</DialogTitle>
        <DialogDescription>
          Ambassador <span className="font-mono">{ambassadorId}</span>. Share their referral link with them on WhatsApp.
        </DialogDescription>
      </DialogHeader>
      <div className="rounded-2xl bg-zone p-4">
        <p className="meta-label">Referral code</p>
        <p className="mt-1 font-mono text-lg font-semibold text-foreground">{referralCode}</p>
        <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{link}</p>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          <LuCopy className="size-4" aria-hidden />
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Button type="button" onClick={onClose}>
          Done
        </Button>
      </div>
    </>
  );
}

function NewForm({
  universities,
  cores,
  partnerships,
  onCreated,
  onCancel,
}: {
  universities: UniversityOption[];
  cores: CoreOption[];
  partnerships: { id: string; organisationName: string; school: string }[];
  onCreated: (c: { ambassadorId: string; referralCode: string; fullName: string }) => void;
  onCancel: () => void;
}) {
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [coreQuery, setCoreQuery] = React.useState("");
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateDirectoryAmbassadorInput>({
    resolver: zodResolver(createDirectoryAmbassadorSchema),
    defaultValues: { fullName: "", phone: "", email: "", universityId: "", department: "", level: "", isCore: true, coreAmbassadorId: "", partnershipId: "", notes: "", referralCode: "" },
  });

  const isCore = watch("isCore");
  const fullName = watch("fullName");
  const universityId = watch("universityId");
  const referralCode = watch("referralCode");
  const uni = universities.find((u) => u.id === universityId);

  function generate() {
    if (!fullName.trim() || !uni) return;
    setValue("referralCode", buildReferralCode(fullName, uni.abbreviation), { shouldDirty: true });
  }

  const needle = coreQuery.trim().toLowerCase();
  const coreOptions = needle ? cores.filter((c) => c.fullName.toLowerCase().includes(needle)) : cores;

  const onSubmit = async (data: CreateDirectoryAmbassadorInput) => {
    setSubmitError(null);
    try {
      const res = await fetch("/api/admin/ambassadors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, coreAmbassadorId: data.isCore ? "" : data.coreAmbassadorId }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; ambassadorId?: string; referralCode?: string } | null;
      if (!res.ok || !body?.ambassadorId || !body.referralCode) throw new Error(body?.error ?? "Could not add the ambassador.");
      onCreated({ ambassadorId: body.ambassadorId, referralCode: body.referralCode, fullName: data.fullName });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not add the ambassador.");
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add ambassador</DialogTitle>
        <DialogDescription>A Core ambassador stands alone and can build a team from Silver. A Sub works under a Core.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="na-name" error={errors.fullName?.message} required className="sm:col-span-2">
            <Input id="na-name" autoComplete="off" {...register("fullName")} />
          </Field>
          <Field label="WhatsApp number" htmlFor="na-phone" error={errors.phone?.message} required>
            <Input id="na-phone" inputMode="tel" placeholder="0803 123 4567" {...register("phone")} />
          </Field>
          <Field label="Email" htmlFor="na-email" error={errors.email?.message} hint="Needed for their portal sign-in">
            <Input id="na-email" type="email" inputMode="email" {...register("email")} />
          </Field>
          <Field label="School / university" htmlFor="na-uni" error={errors.universityId?.message} required className="sm:col-span-2">
            <Controller
              control={control}
              name="universityId"
              render={({ field }) => <UniversityCombobox id="na-uni" universities={universities} value={field.value} onChange={field.onChange} onBlur={field.onBlur} allowOther={false} />}
            />
          </Field>
          <Field label="Department / faculty" htmlFor="na-dept" error={errors.department?.message}>
            <Input id="na-dept" {...register("department")} />
          </Field>
          <Field label="Academic level" htmlFor="na-level" error={errors.level?.message}>
            <Select id="na-level" {...register("level")}>
              <option value="">Select</option>
              {ACADEMIC_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Core ambassador?</legend>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: true, label: "Yes — Core", hint: "Works alone, may lead a team" },
              { v: false, label: "No — Sub", hint: "Works under a Core" },
            ].map((o) => (
              <label
                key={String(o.v)}
                className={`flex min-h-12 cursor-pointer flex-col justify-center rounded-xl px-3 py-2 text-sm transition-colors ${isCore === o.v ? "bg-primary/10 text-primary" : "bg-zone text-foreground hover:bg-elevated"}`}
              >
                <input type="radio" className="sr-only" checked={isCore === o.v} onChange={() => setValue("isCore", o.v, { shouldDirty: true })} />
                <span className="font-medium">{o.label}</span>
                <span className="text-xs text-muted-foreground">{o.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {!isCore ? (
          <Field label="Their Core ambassador" htmlFor="na-core" error={errors.coreAmbassadorId?.message} required hint="Only Cores at Silver or above with a free slot are listed">
            <div className="space-y-2">
              <Input value={coreQuery} onChange={(e) => setCoreQuery(e.target.value)} placeholder="Search by name" aria-label="Search Core ambassadors" />
              <Select id="na-core" {...register("coreAmbassadorId")}>
                <option value="">Select a Core</option>
                {coreOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} · {tierLabel(c.tier)} · {c.subCount}/10 subs
                  </option>
                ))}
              </Select>
              {cores.length === 0 ? <p className="text-xs text-muted-foreground">No Core is at Silver yet, so a Sub cannot be placed. Add them as a Core for now.</p> : null}
            </div>
          </Field>
        ) : null}

        {partnerships.length > 0 ? (
          <Field label="Came in through" htmlFor="na-channel" error={errors.partnershipId?.message} hint="Their projects count on the partnership">
            <Select id="na-channel" {...register("partnershipId")}>
              <option value="">Direct recruitment by the HOG</option>
              {partnerships.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.organisationName} ({p.school})
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label="Bio / note" htmlFor="na-notes" error={errors.notes?.message}>
          <Textarea id="na-notes" rows={2} maxLength={1000} {...register("notes")} />
        </Field>

        <div className="rounded-2xl bg-zone p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="meta-label">Referral code</p>
              <p className="mt-0.5 font-mono text-base font-semibold text-foreground">{referralCode || <span className="text-subtle">Generated on save</span>}</p>
              {errors.referralCode?.message ? <p className="text-xs text-danger">{errors.referralCode.message}</p> : null}
            </div>
            <Button type="button" size="sm" variant="outline" onClick={generate} disabled={!fullName.trim() || !uni}>
              <LuRefreshCw className="size-4" aria-hidden />
              Generate referral code
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Three letters of the name, three of the school, three digits (BLE-LAG-847). Needs a name and a school.</p>
        </div>

        {submitError ? (
          <p className="flex items-center gap-1.5 text-sm text-danger" role="alert">
            <LuCircleAlert className="size-4" aria-hidden />
            {submitError}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
            Save ambassador
          </Button>
        </div>
      </form>
    </>
  );
}
