/**
 * Phase D3 — the COO's mode card: what the system recommends, what the COO
 * decided, and the lock.
 *
 *   recommend  getModeCard: the classifier's reading of the department, the topic and
 *              the client's answer, merged with any saved decision (never written on read)
 *   change     changeMode: saves the COO's choice as a draft (not approved)
 *   approve    approveMode: checks the decision against the loader's rules and locks it
 *   reopen     reopenMode: unlocks, only while no chapter has been generated
 *
 * "Generation has started" has one definition: a GenerationCheckpoint exists for the
 * project. Approve, change, reopen and the start of a chapter all lock the Project row
 * first, so a reopen and a generation start can never interleave.
 */
import { Prisma, type ResearchMode } from "@prisma/client";
import { db } from "@/lib/db";
import { MODE_NAMES, type ResearchModeNumber, type SectionKey } from "@/lib/generation/department-map";
import { REFERENCING_STYLE_CHOICES, isReferencingStyleKey, type CitationPlacement, type ReferencingStyleKey } from "@/lib/generation/referencing";
import {
  MODE_CODES,
  MODE_NUMBERS,
  classifyMode,
  defaultSectionFor,
  getDepartmentModeDefault,
  isModeNumber,
  modeTitle,
  sectionLabel,
  sectionOptionsFor,
  validateModeDecision,
  validateModeDraft,
  type ModeClassification,
  type ModeCode,
  type ModeDecision,
} from "@/lib/mode-classifier";
import { hasGenerationStarted, isReportTemplate, lockProjectRow } from "@/lib/generation/generation-state";
import { ModeDecisionError, ModeLockedError, ModeNotApprovedError, ModeStateError } from "@/lib/services/mode-errors";
import { writeProjectNote } from "@/lib/services/operations/project-ops";
import type { Actor } from "@/lib/services/operations/actor";
import { BRIEF_CARD_SELECT, briefBlockers, buildBriefView, type BriefView } from "@/lib/research/source-stage-view";
import { briefApprovalNote, saveBriefChoices, sourceStageCost, type BriefChoices } from "@/lib/research/source-stage-actions";

type Tx = Prisma.TransactionClient;

/** Enough room for the lock, the reads and the writes over the shared pooler (Prisma's 5 s default has been hit here). */
const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

// The errors live in mode-errors.ts (shared with the D3b source stage); re-exported for existing callers.
export { ModeDecisionError, ModeLockedError, ModeNotApprovedError, ModeStateError, isReportTemplate };

// ─── Reading ────────────────────────────────────────────────────────────────

const PROJECT_SELECT = {
  id: true,
  projectId: true,
  projectTitle: true,
  projectType: true,
  dataRequirements: true,
  intakeModeAnswer: true,
  referencingStyle: true,
  client: { select: { fullName: true, department: true, university: { select: { name: true } } } },
  service: { select: { serviceCode: true, serviceName: true, intakeFormTemplate: true } },
  researchMode: true,
  brief: { select: BRIEF_CARD_SELECT },
  _count: { select: { generationCheckpoints: true } },
} satisfies Prisma.ProjectSelect;

type CardProject = Prisma.ProjectGetPayload<{ select: typeof PROJECT_SELECT }>;

async function loadProject(idOrCode: string, client: Tx | typeof db = db): Promise<CardProject> {
  const project = await client.project.findFirst({ where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] }, select: PROJECT_SELECT });
  if (!project) throw new ModeStateError("Project not found", 404);
  return project;
}

/** One definition, shared with the research re-run lock (B7). */
export { hasGenerationStarted };

/** The decision as the card should show it: the saved one, or the recommendation pre-filled. */
function currentDecision(project: CardProject, c: ModeClassification): ModeDecision {
  const saved = project.researchMode;
  if (saved) {
    return {
      department: saved.department,
      modeNumber: saved.modeNumber,
      section: (saved.sectionOverride as SectionKey | null) ?? null,
      referencingStyle: saved.referencingStyle,
      customStyleText: saved.customStyleText,
      citationPlacement: (saved.citationPlacement as CitationPlacement | null) ?? null,
      thematicTitles: { chapter3: saved.thematicTitleChapter3, chapter4: saved.thematicTitleChapter4 },
      samples: { nonHuman: saved.nonHumanSamples, description: saved.samplesDescription },
    };
  }
  return {
    department: c.department.matched ?? project.client.department ?? "",
    modeNumber: c.recommendedMode ?? 0,
    section: null,
    // B2: pre-filled from the department; the client's own choice is shown beside it.
    referencingStyle: c.suggestedReferencingStyle ?? "APA_7TH",
    customStyleText: null,
    citationPlacement: null,
    thematicTitles: { chapter3: null, chapter4: null },
    samples: { nonHuman: null, description: null },
  };
}

export interface ModeCard {
  projectId: string;
  projectTitle: string | null;
  client: { name: string; university: string | null };
  service: { code: string; name: string };
  /** Only written reports go through the generator; other services have no mode to approve. */
  reportProject: boolean;

  /** The approved mode, else the saved draft, else the recommendation; null when nothing points anywhere. */
  modeNumber: ResearchModeNumber | null;
  modeName: ModeCode | null;
  modeLabel: string | null;
  status: "RECOMMENDED" | "DRAFT" | "APPROVED";
  isLocked: boolean;
  lockReason: "APPROVED" | "GENERATION_STARTED" | null;
  generationStarted: boolean;

  departmentDefault: ResearchModeNumber | null;
  department: { entered: string | null; matched: string | null; section: string | null; lockedMode: boolean; issue: string | null };
  clientIntakeAnswer: string | null;
  clientAnswerSource: "INTAKE_QUESTION" | "INTAKE_FIELDS" | null;
  /** How the older intake fields were read, when there is no A–E answer. */
  clientAnswerFrom: string | null;
  clientAnswerMode: ResearchModeNumber | null;
  keywordTriggers: { trigger: string; mode: ResearchModeNumber; modeName: ModeCode }[];
  conflictDetected: boolean;
  conflicts: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  notes: string[];
  recommendation: { modeNumber: ResearchModeNumber | null; modeName: ModeCode | null; by: string | null };

  decision: ModeDecision;
  modes: { value: ResearchModeNumber; label: string; code: ModeCode; allowed: boolean }[];
  section: { resolved: SectionKey | null; needsPick: boolean; options: { value: SectionKey; label: string }[] };
  referencingStyle: { suggested: string | null; client: string | null; options: { value: string; label: string }[] };
  thematicTitlesRequired: boolean;

  approval: { by: string | null; at: string | null; notes: string | null } | null;
  /** D3b: the objectives and (Law/History) sources approved with the mode; null for non-report services. */
  brief: BriefView | null;
  /** What stops approval now, in plain language. */
  blockers: string[];
  canApprove: boolean;
  canChange: boolean;
  canReopen: boolean;
}

function buildCard(project: CardProject, briefCost: number): ModeCard {
  const saved = project.researchMode;
  const generationStarted = project._count.generationCheckpoints > 0;
  const c = classifyMode({
    // The COO's confirmed department wins over what the client typed.
    department: saved?.department ?? project.client.department,
    topic: project.projectTitle,
    answer: project.intakeModeAnswer,
    projectType: project.projectType,
    dataRequirements: project.dataRequirements,
  });
  const decision = currentDecision(project, c);
  const modeNumber = isModeNumber(decision.modeNumber) ? decision.modeNumber : null;
  const entry = getDepartmentModeDefault(decision.department).entry;
  const sectionOptions = modeNumber ? sectionOptionsFor(entry, modeNumber) : [];
  const resolved = modeNumber ? (decision.section ?? defaultSectionFor(entry, modeNumber)) : null;

  const isLocked = Boolean(saved?.isLocked) || generationStarted;
  const lockReason = generationStarted ? "GENERATION_STARTED" : saved?.isLocked ? "APPROVED" : null;
  const reportProject = isReportTemplate(project.service.intakeFormTemplate);

  const validation = validateModeDecision(decision);
  const brief = reportProject ? buildBriefView(project.brief, { costNaira: briefCost, currentDepartment: decision.department, currentMode: modeNumber, locked: isLocked }) : null;
  const blockers = [
    ...(reportProject ? [] : ["This service is not a written report, so it has no research mode."]),
    ...(modeNumber ? [] : ["Pick a mode: nothing in the project points to one."]),
    ...(validation.ok ? [] : validation.problems.filter((p) => !(modeNumber === null && p.startsWith("Pick a mode")))),
    ...(brief ? briefBlockers(brief, reportProject) : []),
  ];
  const allowed = new Set(c.allowedModes.length ? c.allowedModes : MODE_NUMBERS);
  const clientStyle = project.referencingStyle;

  return {
    projectId: project.projectId,
    projectTitle: project.projectTitle,
    client: { name: project.client.fullName, university: project.client.university?.name ?? null },
    service: { code: project.service.serviceCode, name: project.service.serviceName },
    reportProject,

    modeNumber,
    modeName: modeNumber ? MODE_CODES[modeNumber] : null,
    modeLabel: modeNumber ? MODE_NAMES[modeNumber] : null,
    status: saved?.isLocked ? "APPROVED" : saved ? "DRAFT" : "RECOMMENDED",
    isLocked,
    lockReason,
    generationStarted,

    departmentDefault: c.departmentDefault,
    department: {
      entered: project.client.department ?? null,
      matched: c.department.matched,
      section: c.department.section,
      lockedMode: c.department.lockedMode,
      issue: c.department.issue,
    },
    clientIntakeAnswer: c.clientAnswer?.answer ?? null,
    clientAnswerSource: c.clientAnswer ? "INTAKE_QUESTION" : c.intakeFields ? "INTAKE_FIELDS" : null,
    clientAnswerFrom: c.intakeFields?.from ?? null,
    clientAnswerMode: c.clientAnswer?.mode ?? c.intakeFields?.mode ?? null,
    keywordTriggers: c.keywordTriggers.map(({ trigger, mode, modeName }) => ({ trigger, mode, modeName })),
    conflictDetected: c.conflictDetected,
    conflicts: c.conflicts,
    confidence: c.confidence,
    notes: c.notes,
    recommendation: {
      modeNumber: c.recommendedMode,
      modeName: c.recommendedMode ? MODE_CODES[c.recommendedMode] : null,
      by: c.recommendedBy,
    },

    decision,
    modes: MODE_NUMBERS.map((m) => ({ value: m, label: MODE_NAMES[m], code: MODE_CODES[m], allowed: allowed.has(m) })),
    section: {
      resolved,
      needsPick: Boolean(modeNumber) && !resolved && sectionOptions.length > 0,
      options: sectionOptions.map((s) => ({ value: s, label: sectionLabel(s) })),
    },
    referencingStyle: {
      suggested: c.suggestedReferencingStyle,
      client: clientStyle && isReferencingStyleKey(clientStyle) ? clientStyle : null,
      options: REFERENCING_STYLE_CHOICES,
    },
    thematicTitlesRequired: modeNumber === 1,

    approval: saved?.isLocked
      ? { by: saved.cooApprovedByName, at: saved.cooApprovedAt?.toISOString() ?? null, notes: saved.cooNotes }
      : null,
    brief,
    blockers,
    canApprove: reportProject && !isLocked && blockers.length === 0,
    canChange: !isLocked,
    canReopen: Boolean(saved?.isLocked) && !generationStarted,
  };
}

/** The card, plus how long the database read took (for the Server-Timing header). */
export async function getModeCard(idOrCode: string): Promise<{ card: ModeCard; dbMs: number }> {
  const started = performance.now();
  const project = await loadProject(idOrCode);
  const cost = project.brief ? await sourceStageCost(project.id) : 0;
  const dbMs = performance.now() - started;
  return { card: buildCard(project, cost), dbMs };
}

async function cardFor(projectDbId: string): Promise<ModeCard> {
  const project = await loadProject(projectDbId);
  return buildCard(project, project.brief ? await sourceStageCost(project.id) : 0);
}

// ─── Writing ────────────────────────────────────────────────────────────────

/** Serialises every mode write and the start of generation for one project (generation-state.ts). */
const lockProject = lockProjectRow;

function describe(decision: ModeDecision, section: SectionKey | null): string {
  const mode = isModeNumber(decision.modeNumber) ? modeTitle(decision.modeNumber) : "no mode";
  const style = REFERENCING_STYLE_CHOICES.find((s) => s.value === decision.referencingStyle)?.label ?? decision.referencingStyle;
  return [`${decision.department}`, mode, section ? `${sectionLabel(section)} section` : "section to pick", style].join(", ");
}

/** The columns a decision writes, and the signals as they stand now. */
function rowData(project: CardProject, decision: ModeDecision, mode: ResearchModeNumber) {
  const c = classifyMode({
    department: decision.department,
    topic: project.projectTitle,
    answer: project.intakeModeAnswer,
    projectType: project.projectType,
    dataRequirements: project.dataRequirements,
  });
  const clean = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);
  return {
    modeNumber: mode,
    modeName: MODE_CODES[mode],
    department: getDepartmentModeDefault(decision.department).matched ?? decision.department,
    sectionOverride: decision.section ?? null,
    referencingStyle: decision.referencingStyle,
    customStyleText: decision.referencingStyle === "CUSTOM" ? clean(decision.customStyleText) : null,
    citationPlacement: decision.citationPlacement ?? null,
    thematicTitleChapter3: mode === 1 ? clean(decision.thematicTitles?.chapter3) : null,
    thematicTitleChapter4: mode === 1 ? clean(decision.thematicTitles?.chapter4) : null,
    nonHumanSamples: decision.samples?.nonHuman ?? null,
    samplesDescription: clean(decision.samples?.description),
    recommendedMode: c.recommendedMode,
    clientIntakeAnswer: c.clientAnswer?.answer ?? null,
    departmentDefault: c.departmentDefault,
    keywordTriggers: c.keywordTriggers.map((t) => `${t.trigger} → Mode ${t.mode}`),
    conflictDetected: c.conflictDetected,
  };
}

/** Refuses when the mode is approved or chapters exist. Call inside the transaction, after lockProject. */
async function assertChangeable(tx: Tx, projectDbId: string, saved: ResearchMode | null): Promise<void> {
  if (await hasGenerationStarted(projectDbId, tx)) throw new ModeLockedError("GENERATION_STARTED");
  if (saved?.isLocked) throw new ModeLockedError("APPROVED");
}

/** Saves the COO's choice without approving it. */
export async function changeMode(idOrCode: string, decision: ModeDecision & BriefChoices, actor: Actor): Promise<ModeCard> {
  const problems = validateModeDraft(decision);
  if (problems.length) throw new ModeDecisionError(problems);
  const mode = decision.modeNumber as ResearchModeNumber;

  const project = await loadProject(idOrCode);
  await db.$transaction(async (tx) => {
    await lockProject(tx, project.id);
    const saved = await tx.researchMode.findUnique({ where: { projectId: project.id } });
    await assertChangeable(tx, project.id, saved);
    const data = rowData(project, decision, mode);
    await tx.researchMode.upsert({
      where: { projectId: project.id },
      create: { projectId: project.id, ...data },
      update: { ...data, isLocked: false, cooApprovedBy: null, cooApprovedByName: null, cooApprovedAt: null, cooNotes: null },
    });
    // A new mode never re-drafts the objectives by itself: the card flags objectives
    // drafted for another mode, and approval refuses them until Draft again is pressed.
    await saveBriefChoices(tx, project.id, { objectives: decision.objectives, selectedSourceIds: decision.selectedSourceIds }, { approving: false, department: data.department });
    const entry = getDepartmentModeDefault(decision.department).entry;
    const section = decision.section ?? defaultSectionFor(entry, mode);
    await writeProjectNote(tx, project.id, { kind: "MODE", actor, content: `Research mode set (not yet approved): ${describe(decision, section)}.` });
  }, TX_OPTIONS);
  return cardFor(project.id);
}

/** Checks the decision against the loader's rules, saves it and locks it. */
export async function approveMode(idOrCode: string, decision: ModeDecision & BriefChoices & { notes?: string | null }, actor: Actor): Promise<ModeCard> {
  const valid = validateModeDecision(decision);
  if (!valid.ok) throw new ModeDecisionError(valid.problems);

  const project = await loadProject(idOrCode);
  if (!isReportTemplate(project.service.intakeFormTemplate)) {
    throw new ModeStateError("This service is not a written report, so it has no research mode to approve.");
  }
  await db.$transaction(async (tx) => {
    await lockProject(tx, project.id);
    const saved = await tx.researchMode.findUnique({ where: { projectId: project.id } });
    await assertChangeable(tx, project.id, saved);
    const data = { ...rowData(project, decision, valid.mode), department: valid.department };
    await tx.researchMode.upsert({
      where: { projectId: project.id },
      create: { projectId: project.id, ...data },
      update: { ...data, isLocked: false, cooApprovedBy: null, cooApprovedByName: null, cooApprovedAt: null, cooNotes: null },
    });
    // D3b: the objectives and sources are approved with the mode. A brief that is not
    // ready, or whose objectives were drafted for another mode, stops the approval
    // (the transaction rolls back); nothing is re-drafted without the COO's click.
    const brief = await saveBriefChoices(
      tx,
      project.id,
      { objectives: decision.objectives, selectedSourceIds: decision.selectedSourceIds },
      { approving: true, department: valid.department, modeNumber: valid.mode },
    );
    const approval = {
      isLocked: true,
      cooApprovedBy: actor.userId,
      cooApprovedByName: actor.name,
      cooApprovedAt: new Date(),
      cooNotes: decision.notes?.trim() || null,
    };
    await tx.researchMode.update({ where: { projectId: project.id }, data: approval });
    const note = decision.notes?.trim() ? ` Note: ${decision.notes.trim()}` : "";
    const briefLine = brief ? briefApprovalNote(brief) : "";
    await writeProjectNote(tx, project.id, { kind: "MODE", actor, content: `Research mode approved and locked: ${describe(decision, valid.section)}.${briefLine}${note}` });
  }, TX_OPTIONS);
  return cardFor(project.id);
}

/** Unlocks an approved mode, only while no chapter has been generated. */
export async function reopenMode(idOrCode: string, reason: string, actor: Actor): Promise<ModeCard> {
  const project = await loadProject(idOrCode);
  await db.$transaction(async (tx) => {
    await lockProject(tx, project.id);
    const saved = await tx.researchMode.findUnique({ where: { projectId: project.id } });
    if (await hasGenerationStarted(project.id, tx)) throw new ModeLockedError("GENERATION_STARTED");
    if (!saved?.isLocked) throw new ModeStateError("The mode is not approved, so there is nothing to reopen.");
    await tx.researchMode.update({
      where: { projectId: project.id },
      data: { isLocked: false, cooApprovedBy: null, cooApprovedByName: null, cooApprovedAt: null, cooNotes: null },
    });
    await writeProjectNote(tx, project.id, { kind: "MODE", actor, content: `Research mode reopened (was ${modeTitle(saved.modeNumber as ResearchModeNumber)}): ${reason.trim()}` });
  }, TX_OPTIONS);
  return cardFor(project.id);
}

// ─── For generation (D2 now, D4 later) ──────────────────────────────────────

export interface ApprovedModeSettings {
  mode: ResearchModeNumber;
  department: string;
  sectionOverride: SectionKey | null;
  referencingStyle: ReferencingStyleKey;
  customStyleText: string | null;
  citationPlacement: CitationPlacement | null;
  thematicTitles: { chapter3: string | null; chapter4: string | null };
  samples: { nonHuman: boolean | null; description: string | null };
}

function settingsFrom(row: ResearchMode): ApprovedModeSettings {
  if (!row.isLocked || !isModeNumber(row.modeNumber) || !isReferencingStyleKey(row.referencingStyle)) throw new ModeNotApprovedError();
  return {
    mode: row.modeNumber,
    department: row.department,
    sectionOverride: (row.sectionOverride as SectionKey | null) ?? null,
    referencingStyle: row.referencingStyle,
    customStyleText: row.customStyleText,
    citationPlacement: (row.citationPlacement as CitationPlacement | null) ?? null,
    thematicTitles: { chapter3: row.thematicTitleChapter3, chapter4: row.thematicTitleChapter4 },
    samples: { nonHuman: row.nonHumanSamples, description: row.samplesDescription },
  };
}

/** What the loader needs from the card. Throws ModeNotApprovedError until the COO has approved. */
export async function getApprovedModeSettings(projectDbId: string, client: Tx | typeof db = db): Promise<ApprovedModeSettings> {
  const row = await client.researchMode.findUnique({ where: { projectId: projectDbId } });
  if (!row) throw new ModeNotApprovedError();
  return settingsFrom(row);
}

/**
 * For the start of a chapter: locks the project (so a reopen waits), and returns the
 * approved settings. Call inside the transaction that creates the checkpoint.
 */
export async function lockApprovedMode(tx: Tx, projectDbId: string): Promise<ApprovedModeSettings> {
  await lockProject(tx, projectDbId);
  return getApprovedModeSettings(projectDbId, tx);
}
