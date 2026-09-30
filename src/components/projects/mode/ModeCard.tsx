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
import { DEPARTMENTS, MODE_NAMES, getDegreeFromDepartment, type ResearchModeNumber, type SectionKey } from "@/lib/generation/department-map";
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
import { validateAim, validateObjectives } from "@/lib/generation/objectives-rules";
import { objectivesCheckKey } from "@/lib/generation/objectives-check-rules";
import { sourceKindForDepartment } from "@/lib/research/source-policy";
import { modeMismatchLine, objectivesModeMismatch } from "@/lib/research/source-stage-view";
import type { ModeCard as ModeCardData } from "@/lib/services/research-mode";
import { ObjectivesSection, type BriefAction } from "./ObjectivesSection";
import { SourcesSection, type ManualSourceDraft } from "./SourcesSection";
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
  /** The aim as edited (every report states one, since 30 Sept 2026). */
  aim: string;
  /** D3b: the objectives as edited, and the ids of the ticked cases or archival sources. */
  objectives: string[];
  selected: string[];
};

function briefForm(card: ModeCardData): Pick<Form, "aim" | "objectives" | "selected"> {
  const b = card.brief;
  return {
    aim: b?.aim ?? "",
    objectives: b?.objectives ?? [],
    selected: b ? b.points.flatMap((p) => p.sources.filter((s) => s.selected).map((s) => s.id)) : [],
  };
}

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
    ...briefForm(card),
  };
}

type Decision = ModeDecision & { notes: string | null; aim?: string | null; objectives?: string[]; selectedSourceIds?: string[] };

function decisionFrom(form: Form, card?: ModeCardData): Decision {
  // The aim, objectives and ticks travel with the decision once the brief is ready (saved or approved together).
  const brief = card?.brief?.status === "READY" ? card.brief : null;
  return {
    ...(brief
      ? { aim: form.aim.trim() || null, objectives: form.objectives, ...(brief.sourceKind ? { selectedSourceIds: form.selected } : {}) }
      : {}),
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
  const [busy, setBusy] = React.useState<"approve" | "save" | "reopen" | BriefAction | "add" | "remove" | null>(null);
  const [problems, setProblems] = React.useState<string[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [reopenOpen, setReopenOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  /** A report approved without an aim: the aim being written for it (starts as the suggestion). */
  const [lockedAim, setLockedAim] = React.useState(initial.brief?.draftedAim ?? "");

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
  const locked = card.isLocked;
  // D3b: the brief's own blockers (not ready, stopped, department changed) and the objectives as typed.
  const brief = card.brief;
  const objectivesCheck = validateObjectives(form.objectives);
  const aimCheck = validateAim(form.aim);
  const objectivesProblems =
    brief?.status === "READY"
      ? [
          ...(form.aim.trim() ? (aimCheck.ok ? [] : aimCheck.problems) : ["Write the aim, or press Draft the aim: every report states one aim before its objectives."]),
          ...(objectivesCheck.ok ? [] : objectivesCheck.problems),
        ]
      : [];
  const modeMismatch = brief && !locked ? objectivesModeMismatch(brief, form.modeNumber || null) : null;
  const briefProblems = brief
    ? brief.notStarted
      ? ["Draft the aim and objectives first: press Draft aim and objectives."]
      : brief.stopped
        ? ["The objectives and source search stopped. Press Carry on."]
        : brief.running
          ? ["The objectives and sources are still being prepared."]
          : sourceKindForDepartment(form.department) !== brief.sourceKind
            ? ["The department you picked calls for a different source search: save the draft, then press Start again."]
            : modeMismatch
              ? [modeMismatchLine(modeMismatch)]
              : objectivesProblems
    : [];
  const liveProblems = [...(validation.ok ? [] : validation.problems), ...briefProblems];
  const briefEditable = !locked && brief?.status === "READY";
  const selectedSet = React.useMemo(() => new Set(form.selected), [form.selected]);

  // The independent check is judged against what is on the card now: an edit makes a stored check stale at once.
  const checkKey = objectivesCheckKey({
    title: card.projectTitle ?? "",
    department: form.department,
    degree: getDegreeFromDepartment(form.department),
    modeNumber: (mode ?? 1) as ResearchModeNumber,
    aim: form.aim.trim() || null,
    objectives: form.objectives,
  });

  // While a run the COO started is working (a draft, or the independent check), the card asks for news every
  // 5 seconds (the server runs it). A brief that has not been started (PENDING or none) is never polled.
  const waiting = Boolean(brief?.running || brief?.checkRunning);
  // The form takes the server's aim and objectives only when a draft has just finished, never during a check
  // (the COO may be typing while the check runs).
  const draftRunning = React.useRef(Boolean(brief?.running));
  React.useEffect(() => {
    draftRunning.current = Boolean(brief?.running);
  }, [brief?.running]);
  React.useEffect(() => {
    if (!waiting) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/admin/projects/${card.projectId}/mode`, { cache: "no-store" });
        if (!res.ok || stop) return;
        const next = (await res.json()) as ModeCardData;
        const justDrafted = draftRunning.current && next.brief?.status === "READY" && !next.brief.running;
        draftRunning.current = Boolean(next.brief?.running);
        setCard(next);
        if (justDrafted && next.brief) setForm((f) => ({ ...f, ...briefForm(next) }));
      } catch {
        // offline for a moment: the next tick tries again
      }
    };
    const id = window.setInterval(tick, 5000);
    void tick();
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [waiting, card.projectId]);
  const departmentChoices = DEPARTMENT_NAMES.includes(form.department) || !form.department ? DEPARTMENT_NAMES : [form.department, ...DEPARTMENT_NAMES];

  /**
   * Saves the card as it stands (department, mode, style…) as a draft, so a draft follows the mode
   * on screen and a check scores what is on the card. False (with the reasons shown) when refused.
   * The aim and objectives go with it only when they are valid and the action keeps them (Start
   * again, Draft the aim, Check again): Draft again replaces them anyway, and text that breaks the
   * rules must never block the redraft.
   */
  async function saveDraftFirst(action: BriefAction): Promise<boolean> {
    const decision = decisionFrom(form, card);
    const keeps = action === "start" || action === "draft_aim" || action === "check_objectives";
    const keepObjectives = keeps && decision.objectives && validateObjectives(decision.objectives).ok;
    const keepAim = keeps && action !== "draft_aim" && decision.aim && validateAim(decision.aim).ok;
    const res = await fetch(`/api/admin/projects/${card.projectId}/mode/change`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // undefined drops out of the JSON: the ticks never travel, the aim and objectives only when kept.
      body: JSON.stringify({
        ...decision,
        aim: keepAim ? decision.aim : undefined,
        objectives: keepObjectives ? decision.objectives : undefined,
        selectedSourceIds: undefined,
      }),
    });
    if (res.ok) return true;
    const data = await res.json().catch(() => null);
    if (data?.error === "MODE_LOCKED") setMessage(data.message ?? "The mode is locked.");
    else if (Array.isArray(data?.problems)) setProblems(data.problems);
    else setMessage(data?.error ?? "The card could not be saved, so nothing was drafted. Try again.");
    return false;
  }

  /** D3b: brief actions, hand-added sources. The answer is the card; the brief part of the form is refreshed from it. */
  async function briefCall(
    path: string,
    method: "POST" | "DELETE",
    body: unknown,
    kind: BriefAction | "add" | "remove",
    done: string,
    opts: { saveFirst?: boolean } = {},
  ) {
    setBusy(kind);
    setProblems([]);
    setMessage(null);
    try {
      if (opts.saveFirst && (kind === "start" || kind === "redraft_objectives" || kind === "draft_aim" || kind === "check_objectives") && !(await saveDraftFirst(kind))) return false;
      const res = await fetch(`/api/admin/projects/${card.projectId}/${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (Array.isArray(data?.problems)) setProblems(data.problems);
        else setMessage(data?.message ?? data?.error ?? "That did not work. Try again.");
        return false;
      }
      const next = data as ModeCardData;
      setCard(next);
      // Take the server's ticks for a new or removed source; after a check, keep what is typed (it was just saved).
      if (kind === "add" || kind === "remove") setForm((f) => ({ ...f, selected: briefForm(next).selected }));
      else if (kind !== "check_objectives" && kind !== "suggest_aim" && kind !== "add_aim") setForm((f) => ({ ...f, ...briefForm(next) }));
      if (kind === "suggest_aim") setLockedAim(next.brief?.draftedAim ?? "");
      // A saved aim on a locked card becomes the card's aim, so the check below compares against it.
      if (kind === "add_aim") setForm((f) => ({ ...f, aim: next.brief?.aim ?? f.aim }));
      setMessage(done);
      router.refresh();
      return true;
    } catch {
      setMessage("Could not reach the server. Check your connection and try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  /**
   * Every run starts from here (founder's call: nothing drafts or checks on its own). Draft,
   * Draft again, Draft the aim and Check again save the card first, so the server works on what
   * is on screen; Draft again asks first, because it replaces the aim and objectives (and any
   * edits). A check needs a valid aim and objectives, so it is refused here before any call.
   */
  const briefAction = (action: BriefAction) => {
    const mode = form.modeNumber ? `Mode ${form.modeNumber}` : "the saved mode";
    if (
      action === "redraft_objectives" &&
      !window.confirm(`Draft the aim and objectives again for ${mode}? The current aim and objectives, including your edits, are replaced.`)
    )
      return;
    if (action === "check_objectives" && !locked && brief?.status === "READY") {
      const invalid = [...(aimCheck.ok ? [] : aimCheck.problems), ...(objectivesCheck.ok ? [] : objectivesCheck.problems)];
      if (invalid.length) {
        setProblems(invalid);
        setMessage("Fix the aim and objectives first: the check scores what is saved.");
        return;
      }
    }
    if (action === "draft_aim" && !objectivesCheck.ok) {
      setProblems(objectivesCheck.problems);
      setMessage("The aim is drafted from the objectives: fix them first.");
      return;
    }
    const search = brief?.sourceKind ? " and the source search" : "";
    const done: Record<BriefAction, string> = {
      start: `Drafting the aim and objectives${search} for ${mode}. This takes a few minutes; you can leave the page.`,
      redraft_objectives: `Drafting the aim and objectives again for ${mode}. This takes about a minute.`,
      carry_on: "Resumed.",
      draft_aim: "Aim drafted from the objectives. The independent check is running.",
      suggest_aim: "Aim suggested. Read it, edit it if needed, then press Save aim.",
      add_aim: "Aim saved. The objectives are unchanged; the specialist adds the aim to Chapter One by hand.",
      check_objectives: "Checking the aim and objectives independently. This takes about half a minute.",
    };
    void briefCall("mode/brief", "POST", action === "add_aim" ? { action, aim: lockedAim } : { action }, action, done[action], {
      saveFirst: action !== "carry_on" && action !== "suggest_aim" && action !== "add_aim" && !(action === "check_objectives" && locked),
    });
  };

  const addSource = (d: ManualSourceDraft) =>
    briefCall(
      "mode/sources",
      "POST",
      { pointIndex: d.pointIndex, title: d.title, court: d.court, decidedOn: d.decidedOn, citation: d.citation, holder: d.holder, reference: d.reference, url: d.url },
      "add",
      "Added and ticked.",
    );

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
          void send("mode", "POST", decisionFrom(form, card), "approve");
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

        {brief ? (
          <ObjectivesSection
            brief={brief}
            modeNumber={form.modeNumber}
            aim={form.aim}
            onAimChange={(next) => set("aim", next)}
            lockedAim={lockedAim}
            onLockedAimChange={setLockedAim}
            checkKey={checkKey}
            objectives={form.objectives}
            onChange={(next) => set("objectives", next)}
            editable={briefEditable}
            busy={busy}
            onAction={briefAction}
            problems={objectivesProblems}
          />
        ) : null}

        {brief ? (
          <SourcesSection
            brief={brief}
            projectId={card.projectId}
            selected={selectedSet}
            onToggle={(id, on) => set("selected", on ? [...form.selected.filter((x) => x !== id), id] : form.selected.filter((x) => x !== id))}
            editable={briefEditable}
            busy={busy}
            onAdd={addSource}
            onRemove={(id) => void briefCall(`mode/sources/${id}`, "DELETE", null, "remove", "Removed.")}
          />
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
                onClick={() => void send("mode/change", "PUT", decisionFrom(form, card), "save")}
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
