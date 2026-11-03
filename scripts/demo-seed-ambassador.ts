/**
 * Demo data for the ambassador tour video (docs/ambassador-tour-script.md).
 *
 * Films the real ambassador portal with invented people. This matters more here
 * than for the chapter video: the leaderboard shows other ambassadors' names,
 * so recording the live app would put real students on screen.
 *
 * It creates a Silver ambassador partway to Gold, eight referred students (some
 * who paid, some who have not), their commissions on the payout ledger, link
 * clicks across a fortnight, and five rival ambassadors so the leaderboard has
 * a believable top three.
 *
 * SAFETY: this writes a login whose password is in the script, so it refuses to
 * run against anything but a database on this machine. Point DATABASE_URL at a
 * throwaway local Postgres (see docs/demo-recording.md) before running it.
 *
 *   npm run demo:seed-ambassador                  # create
 *   npm run demo:seed-ambassador -- --unwatched   # ...with the tour gate up
 *   npm run demo:terminate                        # remove every row it made
 *
 * By default the ambassador is marked as having watched the tutorial, so the
 * gate is out of the way of the screens being filmed. `--unwatched` leaves it
 * unwatched instead, which is how you film the gate itself.
 *
 * Nothing here is a real ambassador, a real student or a real commission.
 */
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { TOUR_VERSION } from "@/lib/ambassador-tour";
import { DEMO, assertLocalDatabase } from "./demo-constants";

/** The ambassador the tour is filmed as. Silver: 8 paying clients, 12%. */
/** Leave the tutorial gate up, to film the gate rather than the dashboard. */
const unwatched = process.argv.includes("--unwatched");

const TOUR = {
  fullName: "Chiamaka Okoro",
  slot: "042",
  referralCode: "CHI-LAG-204",
  department: "Mass Communication",
  level: "300",
} as const;

/** Referred students: `paid` ones are paying clients and carry a commission. */
const REFERRALS: { name: string; paid: boolean; price: number; daysAgo: number }[] = [
  { name: "Tunde Adebayo", paid: true, price: 70_000, daysAgo: 46 },
  { name: "Ngozi Eze", paid: true, price: 45_000, daysAgo: 41 },
  { name: "Ibrahim Yusuf", paid: true, price: 70_000, daysAgo: 33 },
  { name: "Blessing Okafor", paid: true, price: 30_000, daysAgo: 27 },
  { name: "Samuel Adeyemi", paid: true, price: 90_000, daysAgo: 19 },
  { name: "Halima Bello", paid: true, price: 45_000, daysAgo: 12 },
  { name: "Emeka Nwankwo", paid: true, price: 70_000, daysAgo: 6 },
  { name: "Funke Alabi", paid: true, price: 30_000, daysAgo: 2 },
  // Not paid yet: the Referrals page's "Not paid yet" filter, and the one
  // chapter 5 of the script tells them to chase.
  { name: "Daniel Obi", paid: false, price: 70_000, daysAgo: 4 },
  { name: "Aisha Lawal", paid: false, price: 45_000, daysAgo: 1 },
];

/** The rest of the leaderboard. Clicks only — no orders, no earnings. */
const RIVALS: { name: string; slot: string; code: string; clicks: number }[] = [
  { name: "Oluwaseun Fashola", slot: "017", code: "OLU-LAG-118", clicks: 64 },
  { name: "Zainab Musa", slot: "023", code: "ZAI-ABJ-331", clicks: 51 },
  { name: "Chinedu Obiora", slot: "031", code: "CHI-ENU-507", clicks: 38 },
  { name: "Amaka Udo", slot: "055", code: "AMA-PHC-642", clicks: 22 },
  { name: "Yusuf Danjuma", slot: "061", code: "YUS-KAN-290", clicks: 14 },
];

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number, hour = 11) => {
  const d = new Date(Date.now() - days * DAY);
  d.setHours(hour, 17, 0, 0);
  return d;
};
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** 12% of the price: the Silver tier rate in the published structure. */
const commissionOf = (price: number) => Math.round(price * 0.12);

async function main(): Promise<void> {
  assertLocalDatabase("demo:seed-ambassador");
  console.log("\nSeeding EduCraft HQ demo data (ambassador tour)\n");

  const passwordHash = await bcrypt.hash(DEMO.password, 10);
  const university = await db.university.findFirstOrThrow({ orderBy: { name: "asc" } });
  const service = await db.service.findFirstOrThrow({ where: { serviceCode: "FYP-FULL" } });

  // ── The ambassador login the video is filmed with ─────────────────────────
  const user = await db.user.upsert({
    where: { email: DEMO.ambassadorEmail },
    update: { passwordHash, role: "AMBASSADOR", isActive: true },
    create: {
      email: DEMO.ambassadorEmail,
      displayName: TOUR.fullName,
      passwordHash,
      role: "AMBASSADOR",
      isActive: true,
    },
  });

  const ambassador = await db.ambassador.upsert({
    where: { ambassadorId: DEMO.ambassadorCode },
    update: { userId: user.id, status: "Active", tier: "SILVER" },
    create: {
      ambassadorId: DEMO.ambassadorCode,
      userId: user.id,
      legacySlotId: TOUR.slot,
      referralCode: TOUR.referralCode,
      fullName: TOUR.fullName,
      phone: "08000000010",
      email: DEMO.ambassadorEmail,
      universityId: university.id,
      department: TOUR.department,
      level: TOUR.level,
      status: "Active",
      tier: "SILVER",
      bankName: "Demo Bank",
      accountNumber: "0000000000",
      accountName: TOUR.fullName,
      // Settled, not provisional: a countdown on screen would date the video.
      activatedAt: ago(46),
      // Stamped by default, so the gate does not cover the screens being
      // filmed; `--unwatched` leaves it up so the gate can be filmed too.
      tourVersion: unwatched ? null : TOUR_VERSION,
      tourWatchedAt: unwatched ? null : ago(46),
    },
  });
  console.log(`  Ambassador       ${DEMO.ambassadorCode} (${TOUR.fullName}, Silver, slot ${TOUR.slot})`);
  console.log(`  Tutorial gate    ${unwatched ? "UP — they have not watched it" : "down — marked as watched"}`);

  // ── The students they referred, and their orders ──────────────────────────
  let paying = 0;
  let earned = 0;
  for (const [i, r] of REFERRALS.entries()) {
    const clientCode = `${DEMO.referralClientPrefix}${String(i + 1).padStart(2, "0")}`;
    const joined = ago(r.daysAgo + 1);
    const client = await db.client.upsert({
      where: { clientId: clientCode },
      update: { referredById: ambassador.id },
      create: {
        clientId: clientCode,
        fullName: r.name,
        phone: `0800000${String(1000 + i).slice(-4)}`,
        email: `${r.name.toLowerCase().replace(/\s+/g, ".")}@educraft-demo.test`,
        universityId: university.id,
        faculty: "Faculty of Management Sciences",
        department: "Business Administration",
        level: "400",
        referredById: ambassador.id,
        createdAt: joined,
      },
    });

    const commission = r.paid ? commissionOf(r.price) : 0;
    const projectCode = `${DEMO.referralProjectPrefix}${String(i + 1).padStart(2, "0")}`;
    const project = await db.project.upsert({
      where: { projectId: projectCode },
      update: {},
      create: {
        projectId: projectCode,
        clientId: client.id,
        serviceId: service.id,
        ambassadorId: ambassador.id,
        projectTitle: `Demo order for ${r.name}`,
        status: r.paid ? "IN_PROGRESS" : "NEW",
        price: r.price,
        downpaymentAmount: r.price * 0.45,
        balanceAmount: r.price * 0.55,
        downpaymentStatus: r.paid ? "Verified" : "Unpaid",
        balanceStatus: "Unpaid",
        ambassadorCommission: commission || null,
        ambassadorCommRate: r.paid ? 12 : null,
        clientDeadline: ago(-21),
        internalDeadline: ago(-24),
        createdAt: ago(r.daysAgo),
        // Recognised as demo data if a copy ever reaches a shared database.
        testFlaggedAt: new Date(),
        testFlagNote: "Ambassador tour video fixture",
      },
    });

    if (!r.paid) continue;
    paying += 1;
    earned += commission;

    // The commission, on the payout ledger — where the portal reads it from.
    // The older ones are paid; the two most recent are still owed, so the
    // Commissions page shows a real balance.
    const settled = r.daysAgo > 10;
    const accrued = ago(r.daysAgo);
    await db.payoutRecord.upsert({
      where: { bonusKey: `demo-tour:${projectCode}` },
      update: {},
      create: {
        bonusKey: `demo-tour:${projectCode}`,
        month: monthKey(accrued),
        leg: "DOWNPAYMENT",
        recipientType: "AMBASSADOR",
        recipientId: ambassador.id,
        recipientName: TOUR.fullName,
        projectId: project.id,
        amount: commission,
        basis: "Silver tier rate 12%",
        ratePercent: 12,
        status: settled ? "PAID" : "ACCRUED",
        accruedAt: accrued,
        paidAt: settled ? ago(r.daysAgo - 2) : null,
      },
    });
  }
  const paidOut = REFERRALS.filter((r) => r.paid && r.daysAgo > 10).reduce((s, r) => s + commissionOf(r.price), 0);
  console.log(`  Referrals        ${REFERRALS.length} students, ${paying} paying`);
  console.log(`  Commissions      earned ₦${earned.toLocaleString()}, paid ₦${paidOut.toLocaleString()}, balance ₦${(earned - paidOut).toLocaleString()}`);

  // ── Link clicks, so My link and the leaderboard have something to show ────
  const clicks: {
    slotCode: string;
    ambassadorId: string;
    timestamp: Date;
    ipHash: string;
    country: string;
    city: string;
    device: string;
    os: string;
    browser: string;
    quality: "UNIQUE" | "RETURN" | "DUPLICATE";
  }[] = [];
  const CITIES = ["Lagos", "Ibadan", "Abeokuta", "Benin City", "Abuja"];
  // A fortnight of traffic, heavier in the last few days.
  for (let day = 13; day >= 0; day--) {
    const count = day < 4 ? 7 - day : Math.max(1, 5 - Math.floor(day / 3));
    for (let n = 0; n < count; n++) {
      clicks.push({
        slotCode: TOUR.slot,
        ambassadorId: ambassador.id,
        timestamp: ago(day, 9 + (n % 11)),
        ipHash: `demo-${day}-${n}`,
        country: "NG",
        city: CITIES[(day + n) % CITIES.length],
        device: n % 5 === 0 ? "desktop" : "mobile",
        os: n % 5 === 0 ? "Windows" : "Android",
        browser: n % 4 === 0 ? "Chrome" : "WhatsApp",
        quality: n % 7 === 0 ? "RETURN" : "UNIQUE",
      });
    }
  }
  await db.clickEvent.deleteMany({ where: { ambassadorId: ambassador.id } });
  await db.clickEvent.createMany({ data: clicks });
  console.log(`  Link clicks      ${clicks.length} over 14 days`);

  // ── The rest of the leaderboard ───────────────────────────────────────────
  for (const rival of RIVALS) {
    const other = await db.ambassador.upsert({
      where: { ambassadorId: `${DEMO.rivalPrefix}${rival.slot}` },
      update: { status: "Active" },
      create: {
        ambassadorId: `${DEMO.rivalPrefix}${rival.slot}`,
        legacySlotId: rival.slot,
        referralCode: rival.code,
        fullName: rival.name,
        universityId: university.id,
        status: "Active",
        tier: "BRONZE",
        tourVersion: TOUR_VERSION,
        tourWatchedAt: ago(60),
      },
    });
    await db.clickEvent.deleteMany({ where: { ambassadorId: other.id } });
    await db.clickEvent.createMany({
      data: Array.from({ length: rival.clicks }, (_, n) => ({
        slotCode: rival.slot,
        ambassadorId: other.id,
        timestamp: ago(n % 14, 10 + (n % 9)),
        ipHash: `demo-${rival.slot}-${n}`,
        country: "NG",
        city: CITIES[n % CITIES.length],
        device: "mobile",
        os: "Android",
        browser: "WhatsApp",
        quality: "UNIQUE" as const,
      })),
    });
  }
  console.log(`  Leaderboard      ${RIVALS.length} other ambassadors with clicks`);

  // The stored counters the directory and tier logic read.
  await db.ambassador.update({
    where: { id: ambassador.id },
    data: {
      lifetimeReferrals: REFERRALS.length,
      lifetimeConversions: paying,
      lifetimeEarnings: earned,
      lastReferralAt: ago(1),
      lastConversionAt: ago(2),
    },
  });

  console.log(`\n  Sign in at /login as ${DEMO.ambassadorEmail} / ${DEMO.password}`);
  console.log("  Then film /ambassador, /ambassador/link, /referrals, /commissions, /leaderboard, /profile\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void db.$disconnect());
