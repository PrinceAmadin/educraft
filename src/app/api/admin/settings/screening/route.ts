import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import {
  ScreeningError,
  createScreeningItem,
  getScreeningSettings,
  listScreeningItems,
  updateScreeningSettings,
} from "@/lib/services/screening";
import { createScreeningItemSchema, updateScreeningSettingsSchema } from "@/lib/validations/screening";

/**
 * The founder's screening question bank and its settings. Founder only — the
 * bank holds the answers. `/api/admin/settings` is SUPER_ADMIN in the table;
 * `requireSuperAdmin` is the second layer.
 */
export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  try {
    const [items, settings] = await Promise.all([listScreeningItems(), getScreeningSettings()]);
    return NextResponse.json({ items, settings });
  } catch (error) {
    return serverError("screening-bank-list", error);
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = createScreeningItemSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const created = await createScreeningItem(
      parsed.data.kind,
      parsed.data.payload,
      parsed.data.answerKey,
      parsed.data.notes ?? null,
      guard.session.userId
    );
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof ScreeningError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("screening-bank-create", error);
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
  const parsed = updateScreeningSettingsSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    await updateScreeningSettings(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError("screening-settings-update", error);
  }
}
