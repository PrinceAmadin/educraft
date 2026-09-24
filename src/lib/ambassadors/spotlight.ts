/**
 * WhatsApp-ready messages for the HOG (Phase 3 Sections 1 and 5). Pure, so
 * the Friday spotlight can be regenerated in the browser when the HOG picks a
 * different ambassador. Plain text: no emoji (house rule), no markdown.
 */

export interface SpotlightInput {
  fullName: string;
  school: string | null;
  thisWeek: number;
  thisMonth: number;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

export function spotlightMessage(s: SpotlightInput): string {
  const school = s.school ? ` from ${s.school}` : "";
  const week =
    s.thisWeek > 0
      ? `${s.thisWeek} new client${s.thisWeek === 1 ? "" : "s"} this week alone.`
      : "Keeping the momentum going this week.";
  const month = `${firstName(s.fullName)} has now referred ${s.thisMonth} client${s.thisMonth === 1 ? "" : "s"} this month.`;
  return `This week's spotlight: ${s.fullName}${school}! ${week} ${month} Show them some love. #EduCraftAmbassador`;
}

export interface LeaderboardMessageRow {
  rank: number;
  fullName: string;
  school: string | null;
  conversions: number;
}

/** The ranked board as a short community message: the top `limit` rows. */
export function leaderboardMessage(title: string, rows: LeaderboardMessageRow[], limit = 10): string {
  const lines = [title.toUpperCase(), ""];
  if (rows.length === 0) {
    lines.push("No conversions yet in this period. The first referral that pays takes the top spot!");
    return lines.join("\n");
  }
  for (const r of rows.slice(0, limit)) {
    lines.push(`${r.rank}. ${r.fullName}${r.school ? ` (${r.school})` : ""} — ${r.conversions} client${r.conversions === 1 ? "" : "s"}`);
  }
  lines.push("", "Every client you refer moves you up. Keep going! #EduCraftAmbassador");
  return lines.join("\n");
}
