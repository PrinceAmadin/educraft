"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleCheck, LuLock, LuLockOpen, LuTriangleAlert, LuInfo } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Surface } from "@/components/ui/surface";
import { Field } from "@/components/forms/Field";
import { FormSection } from "@/components/forms/FormSection";
import { FormActions } from "@/components/forms/FormActions";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEPARTMENTS, MODE_NAMES, type ResearchModeNumber, type SectionKey } from "@/lib/generation/department-map";
import {
  MODE_SHORT,
  allowedModes,
  defaultSectionFor,
  getDepartmentModeDefault,
  isModeNumber,
  sectionLabel,
  sectionOptionsFor,
  validateModeDecision,
  type ModeDecision,
} from "@/lib/mode-classifier";
import { INTAKE_MODE_LABEL } from "@/lib/constants";
import type { ModeCard as ModeCardData } from "@/lib/services/research-mode";
import { cn, formatDateTime } from "@/lib/utils";

/** Every department in Table A the COO can confirm (group labels are never a department). */
const DEPARTMENT_NAMES = DEPARTMENTS.filter((d) => !d.group)
  .map((d) => d.name)
  .sort((a, b) => a.localeCompare(b));

const RECOMMENDED_BY: Record<string, string> = {
  LOCKED_DEPARTMENT: "Fixed for this department",
  CLIENT_ANSWER: "From the client's answer",
  KEYWORDS: "From the topic's keywords",
  INTAKE_FIELDS: "From the project type the client picked",
  DEPARTMENT_DEFAULT: "The department's default",
};

const ISSUE_TEXT: Record<string, string> = {
  UNKNOWN: "Not in the department list: confirm the department below",
  GROUP: "Not a specific department: confirm the department below",
  NO_DEFAULT: "No default for this department: the COO picks the mode",
};

type Form = {
  department: string;
  modeNumber: number;
  section: SectionKey | "";
  referencingStyle: string;
  customStyleText: string;
  chapter3: string;
  chapter4: string;
  notes: string;
};

function formFrom(card: ModeCardData): Form {
  const d = card.decision;
  return {
    department: d.department,
    modeNumber: isModeNumber(d.modeNumber) ? d.modeNumber : 0,
    section: d.section ?? "",
    referencingStyle: d.referencingStyle,
    customStyleText: d.customStyleText ?? "",
    chapter3: d.thematicTitles?.chapter3 ?? "",
    chapter4: d.thematicTitles?.chapter4 ?? "",
    notes: card.approval?.notes ?? "",
  };
}

function decisionFrom(form: Form): ModeDecision & { notes: string | null } {
  return {
    department: form.department,
    modeNumber: form.modeNumber,
    section: form.section || null,
    referencingStyle: form.referencingStyle,
    customStyleText: form.referencingStyle === "CUSTOM" ? form.customStyleText : null,
    thematicTitles: form.modeNumber === 1 ? { chapter3: form.chapter3, chapter4: form.chapter4 } : null,
    notes: form.notes.trim() || null,
  };
}

function modeLine(n: ResearchModeNumber): string {
  return `Mode ${n}: ${MODE_NAMES[n]}`;
}

/**
 * The COO's research-mode card (Report tab). It shows what the system recommends
 * and why (department default, the topic's keywords, the client's own answer) with
 * any disagreement spelled out, and takes the COO's decision: department, mode,
 * section where one must be picked, referencing style and, for a thematic report,
 * the chapter titles. Approving locks it; it can be reopened only until the first
 * chapter is generated. The rules shown live are the ones the server enforces.
 */
export function ModeCard({ initial }: { initial: ModeCardData }) {
  const router = useRouter();
  const [card, setCard] = React.useState(initial);
  const [form, setForm] = React.useState<Form>(() => formFrom(initial));
  const [busy, setBusy] = React.useState<"approve" | "save" | "reopen" | null>(null);
  const [problems, setProblems] = React.useState<string[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [reopenOpen, setReopenOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setProblems([]);
    setMessage(null);
  };

  // Live rules, from the same pure classifier the API uses.
  const entry = getDepartmentModeDefault(form.department).entry;
  const allowed = entry ? allowedModes(entry) : [];
  const mode = isModeNumber(form.modeNumber) ? form.modeNumber : null;
  const sectionOptions = mode ? sectionOptionsFor(entry, mode) : [];
  const ownSection = mode ? defaultSectionFor(entry, mode) : null;
  const validation = validateModeDecision(decisionFrom(form));
  const liveProblems = validation.ok ? [] : validation.problems;
  const locked = card.isLocked;
  const departmentChoices = DEPARTMENT_NAMES.includes(form.department) || !form.department ? DEPARTMENT_NAMES : [form.department, ...DEPARTMENT_NAMES];

  async function send(path: string, method: "POST" | "PUT", body: unknown, kind: "approve" | "save" | "reopen") {
    setBusy(kind);
    setProblems([]);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/projects/${card.projectId}/${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (data?.error === "MODE_LOCKED") setMessage(data.message ?? "The mode is locked.");
        else if (Array.isArray(data?.problems)) setProblems(data.problems);
        else setMessage(data?.error ?? "That did not work. Try again.");
        return false;
      }
      setCard(data as ModeCardData);
      setForm(formFrom(data as ModeCardData));
      setMessage(kind === "approve" ? "Approved and locked." : kind === "save" ? "Saved. Not approved yet." : "Reopened. You can change it now.");
      router.refresh(); // the project's timeline shows the change
      return true;
    } catch {
      setMessage("Could not reach the server. Check your connection and try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  const statusChip = card.lockReason === "GENERATION_STARTED"
    ? { icon: LuLock, text: "Locked: chapters generated", tone: "bg-zone text-foreground" }
    : card.status === "APPROVED"
      ? { icon: LuCircleCheck, text: "Approved and locked", tone: "bg-success/15 text-success" }
      : card.status === "DRAFT"
        ? { icon: LuInfo, text: "Saved, not approved", tone: "bg-gold/15 text-gold" }
        : { icon: LuInfo, text: "Recommended", tone: "bg-primary/10 text-primary" };
  const StatusIcon = statusChip.icon;

  if (!card.reportProject) {
    return (
      <Surface tone="zone" padding="md">
        <p className="text-sm text-muted-foreground">This service is not a written report, so it has no research mode.</p>
      </Surface>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      {/* What the system recommends, and the state of the decision */}
      <section className="space-y-2" aria-labelledby="mode-heading">
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow">Research mode</span>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", statusChip.tone)}>
            <StatusIcon className="size-3.5" aria-hidden />
            {statusChip.text}
          </span>
        </div>
        <h2 id="mode-heading" className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {card.modeNumber ? modeLine(card.modeNumber) : "No mode yet"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {card.recommendation.modeNumber
            ? `${RECOMMENDED_BY[card.recommendation.by ?? ""] ?? "Recommended"}: Mode ${card.recommendation.modeNumber} (${MODE_SHORT[card.recommendation.modeNumber]}).`
            : "Nothing in the project points to a mode: pick one below."}{" "}
          {card.confidence === "HIGH" ? "The signals agree." : card.confidence === "LOW" && card.conflictDetected ? "The signals disagree: check below." : null}
        </p>
        {card.approval ? (
          <p className="text-sm text-muted-foreground">
            Approved by {card.approval.by ?? "the COO"}
            {card.approval.at ? `, ${formatDateTime(card.approval.at)}` : ""}.
          </p>
        ) : null}
      </section>

      {/* The three signals */}
      <Surface tone="zone" padding="md" as="section" aria-label="What the recommendation is based on">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <dt className="meta-label">Department default</dt>
            <dd className="text-sm text-foreground">
              {card.departmentDefault && card.department.matched
                ? `${card.department.matched}: Mode ${card.departmentDefault} (${MODE_SHORT[card.departmentDefault]})`
                : ISSUE_TEXT[card.department.issue ?? ""] ?? "None"}
              {card.department.lockedMode ? <span className="block text-xs text-muted-foreground">Always this mode</span> : null}
              {card.department.entered && card.department.entered !== card.department.matched ? (
                <span className="block text-xs text-muted-foreground">Client typed: {card.department.entered}</span>
              ) : null}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="meta-label">Client&apos;s answer</dt>
            <dd className="text-sm text-foreground">
              {card.clientIntakeAnswer
                ? INTAKE_MODE_LABEL[card.clientIntakeAnswer as keyof typeof INTAKE_MODE_LABEL]
                : card.clientAnswerFrom
                  ? card.clientAnswerFrom
                  : "Not answered"}
              {card.clientAnswerSource === "INTAKE_FIELDS" ? <span className="block text-xs text-muted-foreground">Read from the older form fields</span> : null}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="meta-label">Topic keywords</dt>
            <dd className="text-sm text-foreground">
              {card.keywordTriggers.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {card.keywordTriggers.map((t) => (
                    <li key={`${t.trigger}-${t.mode}`} className="rounded-full bg-background px-2 py-0.5 text-xs">
                      {t.trigger} <span className="text-muted-foreground">· Mode {t.mode}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                "None found"
              )}
            </dd>
          </div>
        </dl>
      </Surface>

      {card.conflicts.length || card.notes.length ? (
        <section className="space-y-2 rounded-2xl bg-gold/10 p-4" aria-label="Conflicts">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <LuTriangleAlert className="size-4 text-gold" aria-hidden />
            {card.conflicts.length ? "The signals disagree" : "Worth checking"}
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
            {[...card.conflicts, ...card.notes].map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* The decision */}
      <form
        className="space-y-10"
        onSubmit={(e) => {
          e.preventDefault();
          void send("mode", "POST", decisionFrom(form), "approve");
        }}
      >
        <FormSection
          title="Decision"
          description={locked ? "Locked. Reopen it to change anything (only until chapters are generated)." : "Confirm or change what the system recommends, then approve."}
        >
          <fieldset disabled={locked} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Department" htmlFor="mode-department" required>
              <Select id="mode-department" value={form.department} onChange={(e) => set("department", e.target.value)}>
                {!form.department ? <option value="">Pick the department</option> : null}
                {departmentChoices.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Mode" htmlFor="mode-number" required>
              <Select
                id="mode-number"
                value={form.modeNumber ? String(form.modeNumber) : ""}
                onChange={(e) => {
                  set("modeNumber", Number(e.target.value));
                  set("section", "");
                }}
              >
                {!form.modeNumber ? <option value="">Pick a mode</option> : null}
                {card.modes.map((m) => (
                  <option key={m.value} value={m.value} disabled={allowed.length > 0 && !allowed.includes(m.value)}>
                    {modeLine(m.value)}
                  </option>
                ))}
              </Select>
            </Field>
            {mode && sectionOptions.length ? (
              <Field
                label="Section of the chapter prompts"
                htmlFor="mode-section"
                required={!ownSection}
                hint={
                  locked
                    ? undefined
                    : ownSection
                      ? "Leave on the department's own unless the project needs another"
                      : form.section
                        ? undefined
                        : "This department and mode need a section: pick one"
                }
              >
                <Select id="mode-section" value={form.section} onChange={(e) => set("section", e.target.value as SectionKey | "")}>
                  <option value="">{ownSection ? `Department's own: ${sectionLabel(ownSection)}` : "Pick a section"}</option>
                  {sectionOptions
                    .filter((s) => s !== ownSection)
                    .map((s) => (
                      <option key={s} value={s}>
                        {sectionLabel(s)}
                      </option>
                    ))}
                </Select>
              </Field>
            ) : null}
            <Field
              label="Referencing style"
              htmlFor="mode-style"
              required
              hint={[
                card.referencingStyle.suggested ? `Suggested for the department: ${card.referencingStyle.options.find((o) => o.value === card.referencingStyle.suggested)?.label}` : null,
                card.referencingStyle.client ? `The client chose ${card.referencingStyle.options.find((o) => o.value === card.referencingStyle.client)?.label ?? card.referencingStyle.client}` : null,
              ]
                .filter(Boolean)
                .join(". ")}
            >
              <Select id="mode-style" value={form.referencingStyle} onChange={(e) => set("referencingStyle", e.target.value)}>
                {card.referencingStyle.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            {form.referencingStyle === "CUSTOM" ? (
              <Field label="The supervisor's format" htmlFor="mode-custom-style" required className="sm:col-span-2">
                <Textarea id="mode-custom-style" rows={3} value={form.customStyleText} onChange={(e) => set("customStyleText", e.target.value)} />
              </Field>
            ) : null}
          </fieldset>
        </FormSection>

        {form.modeNumber === 1 ? (
          <FormSection title="Thematic chapter titles" description="A thematic report is written to these titles: both are needed before approval.">
            <fieldset disabled={locked} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Chapter 3 title" htmlFor="mode-ch3" required>
                <Input id="mode-ch3" value={form.chapter3} maxLength={200} onChange={(e) => set("chapter3", e.target.value)} />
              </Field>
              <Field label="Chapter 4 title" htmlFor="mode-ch4" required>
                <Input id="mode-ch4" value={form.chapter4} maxLength={200} onChange={(e) => set("chapter4", e.target.value)} />
              </Field>
            </fieldset>
          </FormSection>
        ) : null}

        {!locked ? (
          <Field label="Note for the timeline" htmlFor="mode-notes" hint="Optional: why this mode, for whoever reads the project later">
            <Textarea id="mode-notes" rows={2} value={form.notes} maxLength={1000} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        ) : null}

        {!locked && (problems.length || liveProblems.length) ? (
          <div className="space-y-1.5" role="status" aria-live="polite">
            <p className="text-sm font-medium text-foreground">Before approving</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {(problems.length ? problems : liveProblems).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {message ? (
          <p role="status" aria-live="polite" className="text-sm text-foreground">
            {message}
          </p>
        ) : null}

        <FormActions>
          {locked ? (
            card.canReopen ? (
              <Button type="button" variant="outline" onClick={() => setReopenOpen(true)} disabled={busy !== null}>
                <LuLockOpen aria-hidden />
                Reopen
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Chapters have been generated with this mode, so it can no longer change.</p>
            )
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy !== null || !form.department || !form.modeNumber}
                onClick={() => void send("mode/change", "PUT", decisionFrom(form), "save")}
              >
                {busy === "save" ? "Saving…" : "Save draft"}
              </Button>
              <Button type="submit" disabled={busy !== null || liveProblems.length > 0}>
                <LuLock aria-hidden />
                {busy === "approve" ? "Approving…" : "Approve and lock"}
              </Button>
            </>
          )}
        </FormActions>
      </form>

      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen the research mode?</DialogTitle>
            <DialogDescription>
              It unlocks the decision so it can be changed. Nothing has been generated yet, so no chapter is affected. The reason goes on the
              project&apos;s timeline.
            </DialogDescription>
          </DialogHeader>
          <Field label="Why" htmlFor="mode-reopen-reason" required>
            <Textarea id="mode-reopen-reason" rows={3} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setReopenOpen(false)} disabled={busy !== null}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy !== null || reason.trim().length < 3}
              onClick={async () => {
                const ok = await send("mode/reopen", "POST", { reason }, "reopen");
                if (ok) {
                  setReopenOpen(false);
                  setReason("");
                }
              }}
            >
              {busy === "reopen" ? "Reopening…" : "Reopen"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
