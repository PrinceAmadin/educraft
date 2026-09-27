/**
 * A chapter's whole prompt input, built from what the COO approved on the mode
 * card (D3 + D3b) and the project's own fields: nothing is retyped, so Chapter 1
 * states the approved objectives word for word and every chapter cites only the
 * approved cases or archival sources. D4 starts every chapter from this.
 */

import { db } from "@/lib/db";
import { getApprovedModeSettings } from "@/lib/services/research-mode";
import { getApprovedBrief, type ApprovedBrief } from "@/lib/research/source-stage-actions";
import { pauseDataForChapter } from "@/lib/services/data-pause";
import type { ChapterNumber, ChapterPromptInput, PromptPrimarySources, PromptReference } from "./prompt-loader";

/** The approved sources in the loader's shape (null for departments with no source stage). */
export function toPromptPrimarySources(brief: Pick<ApprovedBrief, "kind" | "sources" | "unsupportedPoints">): PromptPrimarySources | undefined {
  if (!brief.kind) return undefined;
  return {
    kind: brief.kind === "CASE" ? "case" : "archive",
    items: brief.sources.map((s) => ({
      point: s.point,
      title: s.title,
      court: s.court,
      decidedOn: s.decidedOn,
      citation: s.citation,
      suitNumber: s.suitNumber,
      holder: s.holder,
      reference: s.reference,
      recordType: s.recordType,
    })),
    unsupportedPoints: brief.unsupportedPoints,
  };
}

export interface ExtractedFromChapterOne {
  researchQuestions?: string[];
  hypotheses?: string[];
}

/**
 * Throws ModeNotApprovedError until the COO has approved the card (mode,
 * objectives and sources together). `extracted` carries what later chapters
 * need from Chapter 1 (its research questions and hypotheses), once written.
 */
export async function approvedChapterInput(projectIdOrCode: string, chapter: ChapterNumber, extracted: ExtractedFromChapterOne = {}): Promise<ChapterPromptInput> {
  const project = await db.project.findFirst({
    where: { OR: [{ id: projectIdOrCode }, { projectId: projectIdOrCode }] },
    select: {
      id: true,
      projectTitle: true,
      supervisorName: true,
      hodName: true,
      matricNumber: true,
      projectPartners: true,
      projectType: true,
      specialInstructions: true,
      minimumPages: true,
      departmentOutline: true,
      client: { select: { university: { select: { name: true } } } },
    },
  });
  if (!project) throw new Error("Project not found");
  const [settings, brief, references] = await Promise.all([
    getApprovedModeSettings(project.id),
    getApprovedBrief(db, project.id),
    db.reference.findMany({
      where: { projectId: project.id, status: "KEPT" },
      orderBy: [{ classification: "asc" }, { citedByCount: "desc" }],
      select: { title: true, proposedTitle: true, authors: true, year: true, journal: true, doi: true, abstract: true },
    }),
  ]);
  const { id: _id, departmentOutline, client, ...fields } = project;
  return {
    chapter,
    department: settings.department,
    mode: settings.mode,
    sectionOverride: settings.sectionOverride,
    project: {
      ...fields,
      university: client.university?.name ?? "",
      referencingStyle: settings.referencingStyle,
      customStyleText: settings.customStyleText,
      // The intake's department outline is the closest thing to a supervisor's table of contents.
      supervisorToc: departmentOutline,
      oralInterviews: null,
    },
    citationPlacement: settings.citationPlacement,
    thematicTitles: settings.thematicTitles,
    samples: settings.samples,
    fromEarlierChapters: {
      objectives: brief.objectives,
      researchQuestions: extracted.researchQuestions,
      hypotheses: extracted.hypotheses,
    },
    references: references as PromptReference[],
    primarySources: toPromptPrimarySources(brief),
    // D3c: the worker's data from the pauses before this chapter (empty when the chapter needs none).
    workerData: await pauseDataForChapter(db, project.id, settings.mode, chapter),
  };
}
