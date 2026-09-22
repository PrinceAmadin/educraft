/**
 * WhatsApp links. There is no WhatsApp API here: these open a chat with a
 * message already typed, and the person taps send (or attaches a file first).
 * Pure: safe in server and client components.
 */

/** EduCraft's own WhatsApp line, in international form. */
export const EDUCRAFT_WHATSAPP = "2347063421088";

/**
 * A Nigerian phone number as WhatsApp wants it: "0803 123 4567", "+234 803…",
 * "234803…" -> "2348031234567". Null when it cannot be read as one.
 */
export function toWaNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (/^0\d{10}$/.test(digits)) return `234${digits.slice(1)}`;
  if (/^234\d{10}$/.test(digits)) return digits;
  if (/^\d{10}$/.test(digits) && /^[789]/.test(digits)) return `234${digits}`;
  return null;
}

/** A chat with `number` (international digits) and `message` typed in. */
export function waLink(number: string, message: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/** A chat with EduCraft, e.g. from a client page. */
export function educraftWaLink(message: string): string {
  return waLink(EDUCRAFT_WHATSAPP, message);
}
