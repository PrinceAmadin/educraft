/**
 * Fill an ambassador-link WhatsApp message template with the ambassador's name.
 *
 * `{AMBASSADOR}` is replaced with the name. When there is no name (a vacant
 * slot), the sentence that names the ambassador is dropped and the rest of the
 * message is kept — so an edited template still degrades cleanly.
 */
export function fillAmbassadorMessage(template: string, name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (n) return template.replaceAll("{AMBASSADOR}", n);
  // No name: drop the sentence that names the ambassador, keep the rest.
  const stripped = template.replace(/\s*[^.!?]*\{AMBASSADOR\}[^.!?]*[.!?]/, "").trim();
  return stripped || template.replaceAll("{AMBASSADOR}", "").trim();
}
