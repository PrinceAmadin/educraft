"use client";

import * as React from "react";
import { LuCheck, LuLoaderCircle, LuPencil, LuRefreshCw, LuX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SurfaceHeader } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import { panelCall, useOrigin, usePanel } from "@/components/ambassador-panel/context";
import { CopyButton, Empty, Notice, shortDate } from "@/components/ambassador-panel/shared";
import type { PanelApplication } from "@/lib/ambassador-panel/types";

type Overrides = { fullName: string; universityAbbr: string; email: string };

/** New recruits from the public application form — approve, correct, or reject. */
export function ApplicationsTab() {
  const { data, readOnly, flash, reload } = usePanel();
  const origin = useOrigin();
  const [edits, setEdits] = React.useState<Record<string, Overrides>>({});
  const [rejecting, setRejecting] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const applyLink = origin ? `${origin}/ambassador-panel/apply` : "";

  const dropEdit = (id: string) =>
    setEdits((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  async function approve(app: PanelApplication) {
    setBusy(app.slotId);
    try {
      const res = await panelCall<{ slotId: string; email: string; emailSent: boolean }>("approve-application", {
        slotId: app.slotId,
        ...(edits[app.slotId] ?? {}),
      });
      flash(
        "success",
        res.emailSent
          ? `Slot ${res.slotId} approved. Welcome email sent to ${res.email}.`
          : `Slot ${res.slotId} approved and active. Add GMAIL_APP_PASSWORD to send welcome emails.`
      );
      dropEdit(app.slotId);
      await reload();
    } catch (e) {
      flash("danger", e instanceof Error ? e.message : "Could not approve.");
    } finally {
      setBusy(null);
    }
  }

  async function reject(app: PanelApplication) {
    setBusy(app.slotId);
    try {
      const res = await panelCall<{ emailSent: boolean }>("reject-application", { slotId: app.slotId, reason });
      flash("success", `Slot ${app.slotId} application rejected.${res.emailSent ? " The applicant was emailed." : ""}`);
      setRejecting(null);
      setReason("");
      await reload();
    } catch (e) {
      flash("danger", e instanceof Error ? e.message : "Could not reject.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <SurfaceHeader
        title="Ambassador applications"
        description="New recruits apply through the public form. Approving one activates their slot and emails their referral link."
        action={
          <div className="flex flex-wrap items-center gap-1">
            <CopyButton value={applyLink} label="Copy form link" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                await reload();
                setRefreshing(false);
              }}
            >
              <LuRefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} aria-hidden />
              Refresh
            </Button>
          </div>
        }
      />

      {data.applications.length === 0 ? (
        <Empty>No pending applications. Share the application link with new ambassadors.</Empty>
      ) : (
        <ul className="space-y-4">
          {data.applications.map((app) => {
            const edit = edits[app.slotId];
            const isRejecting = rejecting === app.slotId;
            return (
              <li key={app.slotId} className="surface p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-mono text-sm font-medium text-primary">EduCraftA-{app.slotId}</span>
                    <span className="text-[15px] font-semibold text-foreground">{app.fullName}</span>
                  </p>
                  <span className="text-[13px] text-muted-foreground">Submitted {shortDate(app.submittedAt)}</span>
                </div>

                <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ["University", `${app.universityFull} (${app.universityAbbr})`],
                    ["Email", app.email],
                    ["Phone", app.phone],
                    ["Bank", app.bankName],
                    ["Account number", app.accountNumber],
                    ["Account name", app.accountName],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="meta-label">{label}</dt>
                      <dd className={label === "Account number" ? "mt-0.5 font-mono text-foreground" : "mt-0.5 break-words text-foreground"}>
                        {value || "—"}
                      </dd>
                    </div>
                  ))}
                </dl>

                {edit ? (
                  <div className="mt-5 space-y-3 rounded-2xl bg-zone p-4">
                    <p className="text-[13px] font-medium text-foreground">Correct before approving</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <Field label="Full name" htmlFor={`ea-name-${app.slotId}`}>
                        <Input
                          id={`ea-name-${app.slotId}`}
                          value={edit.fullName}
                          onChange={(e) => setEdits((p) => ({ ...p, [app.slotId]: { ...edit, fullName: e.target.value } }))}
                          className="bg-card"
                        />
                      </Field>
                      <Field label="University abbreviation" htmlFor={`ea-uni-${app.slotId}`}>
                        <Input
                          id={`ea-uni-${app.slotId}`}
                          value={edit.universityAbbr}
                          onChange={(e) => setEdits((p) => ({ ...p, [app.slotId]: { ...edit, universityAbbr: e.target.value } }))}
                          className="bg-card"
                        />
                      </Field>
                      <Field label="Email" htmlFor={`ea-email-${app.slotId}`}>
                        <Input
                          id={`ea-email-${app.slotId}`}
                          type="email"
                          value={edit.email}
                          onChange={(e) => setEdits((p) => ({ ...p, [app.slotId]: { ...edit, email: e.target.value } }))}
                          className="bg-card"
                        />
                      </Field>
                    </div>
                  </div>
                ) : null}

                {isRejecting ? (
                  <div className="mt-5">
                    <Field label="Reason (optional — emailed to the applicant)" htmlFor={`rej-${app.slotId}`}>
                      <Textarea
                        id={`rej-${app.slotId}`}
                        rows={2}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. Details could not be verified."
                      />
                    </Field>
                  </div>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-2">
                  {isRejecting ? (
                    <>
                      <Button size="sm" variant="destructive" disabled={readOnly || busy !== null} onClick={() => reject(app)}>
                        {busy === app.slotId ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuX className="size-4" aria-hidden />}
                        Confirm rejection
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" disabled={readOnly || busy !== null} onClick={() => approve(app)}>
                        {busy === app.slotId ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuCheck className="size-4" aria-hidden />}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={readOnly}
                        onClick={() =>
                          edit
                            ? dropEdit(app.slotId)
                            : setEdits((p) => ({
                                ...p,
                                [app.slotId]: { fullName: app.fullName, universityAbbr: app.universityAbbr, email: app.email },
                              }))
                        }
                      >
                        <LuPencil className="size-4" aria-hidden />
                        {edit ? "Cancel corrections" : "Correct details"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger hover:bg-danger/10 hover:text-danger"
                        disabled={readOnly}
                        onClick={() => {
                          setRejecting(app.slotId);
                          setReason("");
                        }}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {data.applications.length > 0 ? (
        <Notice>
          Approving stamps the slot active on the roster immediately — there is no separate deploy step any more.
        </Notice>
      ) : null}
    </div>
  );
}
