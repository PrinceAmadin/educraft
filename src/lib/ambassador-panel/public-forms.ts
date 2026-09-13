import { sendEmail, templates, ADMIN_EMAIL } from "@/lib/ambassador-panel/email";
import { PanelError } from "@/lib/ambassador-panel/actions";
import { withRedis } from "@/lib/ambassador-panel/redis";

/**
 * The two public submissions from the original app — the self-registration
 * (existing slot holders verifying themselves) and the full application
 * (new recruits, with bank details). Ported with the same validation,
 * duplicate detection and admin notification.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const digits = (s: string) => s.replace(/\D/g, "");

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

export async function submitRegistration(input: Record<string, unknown>) {
  const str = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : "");
  const slotId = str("slotId").trim();
  const name = str("name").trim();
  const school = str("school").trim();
  const email = str("email").trim();

  if (!slotId) throw new PanelError(400, "Slot ID is required.");
  if (!name) throw new PanelError(400, "Full name is required.");
  if (!email) throw new PanelError(400, "Email address is required.");
  if (!EMAIL_RE.test(email)) throw new PanelError(400, "Please enter a valid email address.");

  const id = slotId.toUpperCase();
  const profile = { slotId: id, name, school, email: email.toLowerCase(), registeredAt: new Date().toISOString() };

  await withRedis(async (client) => {
    if (await client.sIsMember("approved_ids", id)) {
      throw new PanelError(409, "This Slot ID is already registered and active. Contact educraft611@gmail.com if you think this is wrong.");
    }
    if (await client.sIsMember("pending_ids", id)) {
      throw new PanelError(409, "This Slot ID already has a registration awaiting approval. Please wait.");
    }
    await client.multi().set(`pending:${id}`, JSON.stringify(profile)).sAdd("pending_ids", id).exec();
  });

  // Registration already succeeded; don't let a slow mail server hold the response.
  const adminNotified = await withTimeout(
    sendEmail(ADMIN_EMAIL, `[Action Required] New Ambassador Registration — Slot ${id}`, templates.adminNewRegistration(profile)).then(
      (r) => r.ok
    ),
    20000,
    false
  );
  return { success: true, status: "pending", adminNotified };
}

export async function submitApplication(input: Record<string, unknown>) {
  const str = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : "");
  const f = {
    slotId: str("slotId"),
    fullName: str("fullName"),
    universityFull: str("universityFull"),
    universityAbbr: str("universityAbbr"),
    email: str("email"),
    phone: str("phone"),
    bankName: str("bankName"),
    accountNumber: str("accountNumber"),
    accountName: str("accountName"),
    agreedToTerms: str("agreedToTerms"),
  };

  const errors: string[] = [];
  if (!f.slotId.trim()) errors.push("Slot ID is required.");
  if (!f.fullName.trim()) errors.push("Full name is required.");
  if (!f.universityFull.trim()) errors.push("University name is required.");
  if (!f.universityAbbr.trim()) errors.push("University abbreviation is required.");
  if (!EMAIL_RE.test(f.email.trim())) errors.push("Please enter a valid email address.");
  if (digits(f.phone).length < 10) errors.push("Please enter a valid phone number.");
  if (!f.bankName.trim()) errors.push("Bank name is required.");
  if (digits(f.accountNumber).length < 10) errors.push("Please enter a valid 10-digit account number.");
  if (!f.accountName.trim()) errors.push("Account name is required.");
  if (f.agreedToTerms !== "true") errors.push("You must agree to the EduCraft Ambassador Terms to continue.");
  if (errors.length > 0) throw new PanelError(400, errors[0]);

  const id = f.slotId.trim().padStart(3, "0");
  const normEmail = normalize(f.email);
  const normPhone = digits(f.phone);
  const normBank = digits(f.accountNumber);
  const normName = normalize(f.fullName);

  const application = {
    slotId: id,
    fullName: f.fullName.trim(),
    universityFull: f.universityFull.trim(),
    universityAbbr: f.universityAbbr.trim().toUpperCase(),
    email: normEmail,
    phone: f.phone.trim(),
    bankName: f.bankName.trim(),
    accountNumber: f.accountNumber.trim(),
    accountName: f.accountName.trim(),
    agreedToTerms: "true",
    submittedAt: new Date().toISOString(),
    status: "pending",
  };

  await withRedis(async (client) => {
    const [inApps, inApproved, inPending, emailExists, phoneExists, bankExists, nameKey] = await Promise.all([
      client.sIsMember("application_ids", id),
      client.sIsMember("approved_ids", id),
      client.sIsMember("pending_ids", id),
      client.sIsMember("app_emails", normEmail),
      client.sIsMember("app_phones", normPhone),
      client.sIsMember("app_banks", normBank),
      client.get(`app_name:${normName}`),
    ]);
    const contact = "If you think this is a mistake, please contact educraft611@gmail.com.";
    if (inApps || inApproved || inPending) throw new PanelError(409, "This slot ID is already taken. Please refresh the page to get a new slot.");
    if (emailExists) throw new PanelError(409, `This email address has already been used to apply. ${contact}`);
    if (phoneExists) throw new PanelError(409, `This phone number has already been used to apply. ${contact}`);
    if (bankExists) throw new PanelError(409, "This bank account number has already been registered. Each ambassador must use a unique account.");
    if (nameKey) throw new PanelError(409, "An application with a very similar name already exists. If this is you, please contact EduCraft instead of reapplying.");

    await client
      .multi()
      .set(`application:${id}`, JSON.stringify(application))
      .sAdd("application_ids", id)
      .sAdd("app_emails", normEmail)
      .sAdd("app_phones", normPhone)
      .sAdd("app_banks", normBank)
      .set(`app_name:${normName}`, id)
      .set("slot_counter", String(parseInt(id, 10)))
      .exec();
  });

  await sendEmail(ADMIN_EMAIL, `[New Application] Ambassador Application — Slot ${id}`, templates.adminNewApplication(application));
  return { success: true, status: "pending", slotId: id };
}
