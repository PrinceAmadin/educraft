/**
 * Local and preview runs share the live database and the Gmail sender, so a
 * test on a made-up project would ring the real team's bells and land in their
 * inboxes (it did once, in Phase D9's live test: a "chapter stalled" alert for
 * a made-up project reached the COO).
 *
 * QA_NOTIFY_ONLY is a comma-separated list of email addresses. While it is set,
 * staff notifications and team alert emails go only to logins and inboxes on
 * the list. It is never read in production, whatever the environment holds.
 */

export function qaNotifyOnly(): string[] | null {
  if (process.env.VERCEL_ENV === "production") return null;
  const raw = process.env.QA_NOTIFY_ONLY?.trim();
  if (!raw) return null;
  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : null;
}

/** True when this address may be notified (always, unless a test has narrowed it). */
export function mayNotify(email: string | null | undefined): boolean {
  const only = qaNotifyOnly();
  if (!only) return true;
  return Boolean(email) && only.includes(String(email).trim().toLowerCase());
}
