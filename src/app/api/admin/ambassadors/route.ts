import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { createAmbassador } from "@/lib/services/ambassadors";
import { createDirectoryAmbassador, DirectoryError, listDirectory } from "@/lib/services/ambassador-platform/directory";
import { createAmbassadorSchema } from "@/lib/validations/ambassadors";
import { createDirectoryAmbassadorSchema, directoryQuerySchema } from "@/lib/validations/ambassador-platform";

/** The Ambassador Directory: `?tier=&school=&status=&role=&joinedFrom=&joinedTo=&q=&sort=&dir=&page=`. */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const query = directoryQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  try {
    return NextResponse.json(await listDirectory(query));
  } catch (error) {
    return serverError("GET /api/admin/ambassadors", error);
  }
}

/**
 * Create an ambassador. The directory's "New ambassador" modal sends `isCore`
 * (a Core stands alone; a Sub names their Core) and gets a BLE-LAG-847 code;
 * the older full form at /admin/ambassadors/new sends no `isCore` and keeps
 * its own shape.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  if (body && typeof body === "object" && "isCore" in body) {
    const parsed = createDirectoryAmbassadorSchema.safeParse(body);
    if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());
    try {
      const ambassador = await createDirectoryAmbassador(parsed.data, guard.session.userId);
      return NextResponse.json(ambassador, { status: 201 });
    } catch (error) {
      if (error instanceof DirectoryError) return NextResponse.json({ error: error.message }, { status: 409 });
      return serverError("POST /api/admin/ambassadors", error);
    }
  }

  const parsed = createAmbassadorSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  try {
    const ambassador = await createAmbassador(parsed.data);
    return NextResponse.json(ambassador, { status: 201 });
  } catch (error) {
    return serverError("POST /api/admin/ambassadors", error);
  }
}
