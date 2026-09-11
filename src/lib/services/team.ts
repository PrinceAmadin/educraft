import bcrypt from "bcryptjs";
import { Prisma, type UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import type { CreateTeamMemberInput } from "@/lib/validations/settings";

export class TeamError extends Error {}

const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "OPS_MANAGER"];

export interface TeamMemberRow {
  id: string;
  email: string;
  displayName: string | null;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export async function listTeam(): Promise<TeamMemberRow[]> {
  const rows = await db.user.findMany({
    where: { role: { in: ADMIN_ROLES } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      displayName: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/** Only SUPER_ADMIN can call this — enforced by the route guard. */
export async function createTeamMember(input: CreateTeamMemberInput): Promise<{ id: string }> {
  const passwordHash = await bcrypt.hash(input.password, 12);
  const phone = input.phone && input.phone.trim() !== "" ? input.phone.trim() : null;

  try {
    return await db.user.create({
      data: {
        email: input.email,
        displayName: input.displayName,
        phone,
        passwordHash,
        role: input.role,
      },
      select: { id: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = (err.meta?.target as string[] | undefined)?.join(", ") ?? "";
      throw new TeamError(
        target.includes("phone") ? "That phone number is already in use" : "That email is already in use"
      );
    }
    throw err;
  }
}

export async function setTeamMemberActive(
  id: string,
  isActive: boolean,
  actingUserId: string
): Promise<void> {
  if (id === actingUserId && !isActive) {
    throw new TeamError("You can't deactivate your own account");
  }
  const user = await db.user.findUnique({ where: { id }, select: { role: true } });
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    throw new TeamError("Team member not found");
  }
  await db.user.update({ where: { id }, data: { isActive } });
}
