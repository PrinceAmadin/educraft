import { NextResponse } from "next/server";
import { z } from "zod";

/** `?chapter=N` (1–5), optional. Returns undefined when absent, null when present but invalid. */
export function chapterParam(url: URL): number | undefined | null {
  const raw = url.searchParams.get("chapter");
  if (raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

export const resumeBodySchema = z.object({ chapter: z.number().int().min(1).max(5) });

export function projectNotFound() {
  return NextResponse.json({ error: "Project not found" }, { status: 404 });
}

export function badChapter() {
  return NextResponse.json({ error: "chapter must be a number from 1 to 5" }, { status: 400 });
}
