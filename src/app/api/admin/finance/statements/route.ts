import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { weekStart } from "@/lib/ambassadors/weeks";
import { generateWeeklyStatement } from "@/lib/services/finance/weekly-statement";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  /** A date in the week to report (defaults to the last completed week). */
  week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

/** Generate (or regenerate) a weekly financial statement. Founder + CFO. */
export async function POST(req: NextRequest) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  const anchor = parsed.data.week
    ? new Date(`${parsed.data.week}T12:00:00Z`)
    : new Date(weekStart(new Date()).getTime() - 24 * 60 * 60 * 1000); // a day in the last completed week

  try {
    const result = await generateWeeklyStatement({ anchor, by: guard.session.userId, notes: parsed.data.notes || null });
    return NextResponse.json({ id: result.id, isoWeek: result.data.isoWeek, label: result.data.label });
  } catch (error) {
    return serverError("POST /api/admin/finance/statements", error);
  }
}
