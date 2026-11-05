import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import { getFinalSettings, updateFinalSettings } from "@/lib/services/final-practical";

/** The founder's final-practical briefs and clock. `/api/admin/settings` is SUPER_ADMIN. */
const schema = z
  .object({
    minutes: z.coerce.number().int().min(10).max(480).optional(),
    writingBrief1: z.string().trim().min(1).max(4000).optional(),
    writingBrief2: z.string().trim().min(1).max(4000).optional(),
    memoBrief: z.string().trim().min(1).max(4000).optional(),
    promptBrief: z.string().trim().min(1).max(4000).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change");

export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json({ settings: await getFinalSettings() });
  } catch (error) {
    return serverError("final-settings", error);
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());
  try {
    await updateFinalSettings(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError("final-settings-update", error);
  }
}
