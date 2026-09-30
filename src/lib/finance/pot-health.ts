/**
 * The Claude API pot's sustainability rule (founder's decision, 1 Oct 2026), pure
 * so it can be checked without a database. The pot fills from the Operations
 * Reserve allocation and drains on top-ups; if it stays strictly negative at
 * every weekly checkpoint for two-plus consecutive weeks, the allocation
 * percentage may be too low for current revenue and the CFO dashboard warns.
 *
 * Two guards keep it from false-firing: it needs a genuine two-week history
 * (so a freshly-reset pot sitting at ₦0 never trips it), and only strictly
 * negative balances count (₦0 is not "not self-sustaining").
 */
export interface PotTxPoint {
  amount: number;
  createdAt: Date;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function balanceAsOf(rows: PotTxPoint[], at: Date): number {
  return rows.reduce((s, r) => (r.createdAt <= at ? s + r.amount : s), 0);
}

export function claudePotUnsustainable(rows: PotTxPoint[], now: Date): boolean {
  if (rows.length === 0) return false;
  const earliest = rows.reduce((m, r) => (r.createdAt < m ? r.createdAt : m), rows[0].createdAt);
  const twoWeeksAgo = new Date(now.getTime() - 2 * WEEK_MS);
  const oneWeekAgo = new Date(now.getTime() - WEEK_MS);
  return (
    earliest <= twoWeeksAgo &&
    balanceAsOf(rows, now) < 0 &&
    balanceAsOf(rows, oneWeekAgo) < 0 &&
    balanceAsOf(rows, twoWeeksAgo) < 0
  );
}
