import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { CreateLoginInput } from "@/lib/validations/portal-access";

/**
 * Worker and Ambassador rows carry an optional `userId` (schema always had
 * it), but nothing ever created the User side of that link — so nobody
 * assigned a worker or ambassador role could actually sign in. Found while
 * running the Day 18 "assign worker -> worker sees it in their portal" check
 * against a fresh worker: there was no way to get them a login at all.
 */
export class PortalAccessError extends Error {}

export async function createWorkerLogin(workerId: string, input: CreateLoginInput): Promise<void> {
  const worker = await db.worker.findUnique({ where: { id: workerId }, select: { id: true, userId: true } });
  if (!worker) throw new PortalAccessError("Worker not found");
  if (worker.userId) throw new PortalAccessError("This worker already has a login");

  const passwordHash = await bcrypt.hash(input.password, 12);
  try {
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: input.email, passwordHash, role: "WORKER" },
        select: { id: true },
      });
      await tx.worker.update({ where: { id: workerId }, data: { userId: user.id } });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new PortalAccessError("That email is already in use");
    }
    throw err;
  }
}

export async function createAmbassadorLogin(
  ambassadorId: string,
  input: CreateLoginInput
): Promise<void> {
  const ambassador = await db.ambassador.findUnique({
    where: { id: ambassadorId },
    select: { id: true, userId: true },
  });
  if (!ambassador) throw new PortalAccessError("Ambassador not found");
  if (ambassador.userId) throw new PortalAccessError("This ambassador already has a login");

  const passwordHash = await bcrypt.hash(input.password, 12);
  try {
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: input.email, passwordHash, role: "AMBASSADOR" },
        select: { id: true },
      });
      await tx.ambassador.update({ where: { id: ambassadorId }, data: { userId: user.id } });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new PortalAccessError("That email is already in use");
    }
    throw err;
  }
}
