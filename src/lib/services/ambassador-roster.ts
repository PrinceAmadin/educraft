import type { RosterKind } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * The panel roster: numbered general slots (EduCraftA-001...), Core (ECCA) and
 * Sub (ECSA) ambassadors. Lives in Postgres (`AmbassadorSlot`), so an edit is
 * live the instant it is saved. The original panel kept the roster in source
 * code and needed a "Deploy to GitHub" push for every change.
 *
 * A filled slot is joined to its HQ `Ambassador` through
 * `Ambassador.legacySlotId = slot.code`.
 */
export class RosterError extends Error {}

/** Path of a slot's shareable client link. The origin is added by the caller. */
export function slotLinkPath(kind: RosterKind, code: string): string {
  if (kind === "CORE") return `/ECCA/${code}`;
  if (kind === "SUB") return `/ECSA/${code.replace(/^ECSA/, "")}`; // "/ECSA/-001-001"
  return `/EduCraftA/${code}`;
}

export interface RosterRow {
  id: string;
  kind: RosterKind;
  code: string;
  name: string;
  school: string;
  vacant: boolean;
  percentage: number | null;
  parentCode: string | null;
  parentName: string | null;
  /** Number of Subs (filled or vacant) under a Core. */
  subCount: number;
  linkPath: string;
  /** The HQ Ambassador record behind this slot, when there is one. */
  ambassadorId: string | null;
  hasEmail: boolean;
}

const byCode = (a: { code: string }, b: { code: string }) =>
  a.code.localeCompare(b.code, "en", { numeric: true });

export async function listRoster(kind?: RosterKind): Promise<RosterRow[]> {
  const [all, ambassadors] = await Promise.all([
    db.ambassadorSlot.findMany(),
    db.ambassador.findMany({
      where: { legacySlotId: { not: null } },
      select: { id: true, legacySlotId: true, email: true },
    }),
  ]);
  const amb = new Map(ambassadors.map((a) => [a.legacySlotId!, a]));
  const coreName = new Map(all.filter((s) => s.kind === "CORE").map((s) => [s.code, s.name]));
  const subCount = new Map<string, number>();
  for (const s of all) {
    if (s.kind === "SUB" && s.parentCode) {
      subCount.set(s.parentCode, (subCount.get(s.parentCode) ?? 0) + 1);
    }
  }

  return all
    .filter((s) => !kind || s.kind === kind)
    .sort(byCode)
    .map((s) => ({
      id: s.id,
      kind: s.kind,
      code: s.code,
      name: s.name,
      school: s.school,
      vacant: s.vacant,
      percentage: s.percentage,
      parentCode: s.parentCode,
      parentName: s.parentCode ? (coreName.get(s.parentCode) ?? null) : null,
      subCount: subCount.get(s.code) ?? 0,
      linkPath: slotLinkPath(s.kind, s.code),
      ambassadorId: amb.get(s.code)?.id ?? null,
      hasEmail: Boolean(amb.get(s.code)?.email),
    }));
}

export interface RosterStats {
  total: number;
  active: number;
  vacant: number;
  fillRate: number;
}

export function rosterStats(rows: { vacant: boolean }[]): RosterStats {
  const total = rows.length;
  const vacant = rows.filter((r) => r.vacant).length;
  return {
    total,
    active: total - vacant,
    vacant,
    fillRate: total ? Math.round(((total - vacant) / total) * 100) : 0,
  };
}

// ── Schools ──────────────────────────────────────────────────

/** Display names for school chips that are not universities in the table. */
const SPECIAL_SCHOOLS: Record<string, string> = {
  "Co-founders": "EduCraft co-founders",
  Admin: "Administration",
  PG: "Postgraduate students",
};

export interface RosterSchool {
  key: string;
  name: string;
  total: number;
  active: number;
  vacant: number;
}

/** Coverage per school across the whole roster (general + Core + Sub), busiest first. */
export async function getRosterSchools(): Promise<RosterSchool[]> {
  const [slots, unis] = await Promise.all([
    db.ambassadorSlot.findMany({ select: { school: true, vacant: true } }),
    db.university.findMany({ select: { abbreviation: true, name: true } }),
  ]);
  const uniName = new Map(unis.map((u) => [u.abbreviation, u.name]));
  const groups = new Map<string, RosterSchool>();
  for (const s of slots) {
    const key = s.school.trim() || "-";
    const g = groups.get(key) ?? {
      key,
      name: uniName.get(key) ?? SPECIAL_SCHOOLS[key] ?? (key === "-" ? "No school recorded" : key),
      total: 0,
      active: 0,
      vacant: 0,
    };
    g.total += 1;
    if (s.vacant) g.vacant += 1;
    else g.active += 1;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

// ── Slot allocation ──────────────────────────────────────────

const pad = (n: number) => String(n).padStart(3, "0");

/**
 * The slot a new applicant gets: the lowest vacant general slot that no
 * pending application is already holding, otherwise the next number after the
 * highest. Vacant slots are filled first, as in the original panel.
 */
export async function nextGeneralCode(): Promise<{ code: string; reused: boolean }> {
  const [slots, held] = await Promise.all([
    db.ambassadorSlot.findMany({ where: { kind: "GENERAL" }, select: { code: true, vacant: true } }),
    db.ambassadorApplication.findMany({
      where: { status: "PENDING", slotCode: { not: null } },
      select: { slotCode: true },
    }),
  ]);
  const heldCodes = new Set(held.map((h) => h.slotCode!));
  const free = slots
    .filter((s) => s.vacant && !heldCodes.has(s.code))
    .sort(byCode)[0];
  if (free) return { code: free.code, reused: true };

  let max = 0;
  for (const s of slots) max = Math.max(max, parseInt(s.code, 10) || 0);
  for (const c of heldCodes) if (/^\d+$/.test(c)) max = Math.max(max, parseInt(c, 10));
  return { code: pad(max + 1), reused: false };
}

async function nextCoreCode(): Promise<string> {
  const cores = await db.ambassadorSlot.findMany({ where: { kind: "CORE" }, select: { code: true } });
  const max = cores.reduce((m, c) => Math.max(m, parseInt(c.code.replace("ECCA-", ""), 10) || 0), 0);
  return `ECCA-${pad(max + 1)}`;
}

async function nextSubCode(coreCode: string): Promise<string> {
  const subs = await db.ambassadorSlot.findMany({
    where: { kind: "SUB", parentCode: coreCode },
    select: { code: true },
  });
  const max = subs.reduce((m, s) => Math.max(m, parseInt(s.code.split("-").pop() ?? "0", 10) || 0), 0);
  return `ECSA-${coreCode.replace("ECCA-", "")}-${pad(max + 1)}`;
}

// ── Mutations ────────────────────────────────────────────────

export interface AddSlotInput {
  kind: RosterKind;
  /** Blank = auto-assign. General slots take a number ("067"). */
  code?: string;
  name?: string;
  school?: string;
  vacant?: boolean;
  percentage?: number | null;
  parentCode?: string | null;
}

export async function addSlot(input: AddSlotInput): Promise<{ code: string }> {
  let code = input.code?.trim().toUpperCase() ?? "";

  if (input.kind === "GENERAL") {
    if (code) {
      if (!/^\d{1,4}$/.test(code)) throw new RosterError("Slot IDs are numbers, like 067");
      code = pad(parseInt(code, 10));
    } else {
      code = (await nextGeneralCode()).code;
    }
  } else if (input.kind === "CORE") {
    code = code || (await nextCoreCode());
    if (!/^ECCA-\d{3}$/.test(code)) throw new RosterError("Core IDs look like ECCA-007");
  } else {
    if (!input.parentCode) throw new RosterError("Pick the Core Ambassador this Sub belongs to");
    const core = await db.ambassadorSlot.findFirst({
      where: { kind: "CORE", code: input.parentCode },
      select: { id: true },
    });
    if (!core) throw new RosterError("That Core Ambassador does not exist");
    code = code || (await nextSubCode(input.parentCode));
    if (!/^ECSA-\d{3}-\d{3}$/.test(code)) throw new RosterError("Sub IDs look like ECSA-001-006");
  }

  if (await db.ambassadorSlot.findUnique({ where: { code }, select: { id: true } })) {
    throw new RosterError(`${code} already exists`);
  }

  const vacant = input.vacant ?? !input.name?.trim();
  await db.ambassadorSlot.create({
    data: {
      kind: input.kind,
      code,
      name: vacant ? "" : (input.name?.trim() ?? ""),
      school: input.school?.trim() ?? "",
      vacant,
      percentage: input.kind === "GENERAL" ? null : (input.percentage ?? null),
      parentCode: input.kind === "SUB" ? input.parentCode : null,
    },
  });
  return { code };
}

export interface UpdateSlotInput {
  name?: string;
  school?: string;
  vacant?: boolean;
  percentage?: number | null;
  parentCode?: string | null;
}

export async function updateSlot(code: string, input: UpdateSlotInput): Promise<void> {
  const slot = await db.ambassadorSlot.findUnique({
    where: { code },
    select: { id: true, kind: true, name: true },
  });
  if (!slot) throw new RosterError("Slot not found");
  const nextName = input.name !== undefined ? input.name.trim() : slot.name;
  if (input.vacant === false && !nextName) throw new RosterError("An active slot needs a name");

  await db.ambassadorSlot.update({
    where: { id: slot.id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.school !== undefined ? { school: input.school.trim() } : {}),
      ...(input.vacant !== undefined ? { vacant: input.vacant } : {}),
      ...(slot.kind !== "GENERAL" && input.percentage !== undefined ? { percentage: input.percentage } : {}),
      ...(slot.kind === "SUB" && input.parentCode ? { parentCode: input.parentCode } : {}),
    },
  });
}

/**
 * "Reset": empty the slot so the next applicant can take it. The person's HQ
 * record (jobs, payouts) is kept. It just stops being tied to this slot, so
 * the slot's link no longer credits them.
 */
export async function vacateSlot(code: string): Promise<{ detachedAmbassador: boolean }> {
  const slot = await db.ambassadorSlot.findUnique({ where: { code }, select: { id: true } });
  if (!slot) throw new RosterError("Slot not found");
  const [, detached] = await db.$transaction([
    db.ambassadorSlot.update({ where: { id: slot.id }, data: { name: "", vacant: true } }),
    db.ambassador.updateMany({ where: { legacySlotId: code }, data: { legacySlotId: null } }),
  ]);
  return { detachedAmbassador: detached.count > 0 };
}
