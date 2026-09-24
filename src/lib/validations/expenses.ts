import { z } from "zod";
import { AMBASSADOR_COMMISSION_CATEGORY, PARENT_COMMISSION_CATEGORY } from "@/lib/commission";

/**
 * What an expense is for. Each category has a bucket it is normally paid
 * from (the form pre-selects it; the admin can change it).
 */
export const EXPENSE_CATEGORIES = [
  "Software",
  "Internet/Data",
  "API cost",
  "Hosting",
  "Paystack fees",
  "Marketing",
  "Sponsorship",
  "Ambassador bonus",
  "Content",
  "Equipment",
  "Legal",
  "Personnel",
  "Miscellaneous",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Founder Distribution never pays an expense: draws and bonuses leave it, nothing else. */
export const EXPENSE_BUCKETS = ["OPERATIONS_RESERVE", "GROWTH_FUND", "REINVESTMENT_FUND"] as const;
export type ExpenseBucket = (typeof EXPENSE_BUCKETS)[number];

export const DEFAULT_BUCKET_FOR_CATEGORY: Record<ExpenseCategory, ExpenseBucket> = {
  Software: "OPERATIONS_RESERVE",
  "Internet/Data": "OPERATIONS_RESERVE",
  "API cost": "OPERATIONS_RESERVE",
  Hosting: "OPERATIONS_RESERVE",
  "Paystack fees": "OPERATIONS_RESERVE",
  Personnel: "OPERATIONS_RESERVE",
  Miscellaneous: "OPERATIONS_RESERVE",
  Marketing: "GROWTH_FUND",
  Sponsorship: "GROWTH_FUND",
  "Ambassador bonus": "GROWTH_FUND",
  Content: "GROWTH_FUND",
  Equipment: "REINVESTMENT_FUND",
  Legal: "REINVESTMENT_FUND",
};

export const EXPENSE_STATUSES = ["AUTO_APPROVED", "PENDING_APPROVAL", "APPROVED", "DECLINED"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const EXPENSE_KINDS = ["MANUAL", "COMMISSION", "AI", "SPONSORSHIP"] as const;

/**
 * What the expenses list can be filtered by: the manual categories plus the
 * two the system logs when a job is allocated — the ambassador's own
 * commission and, when they have one, their parent's. Neither is ever
 * offered in the "Add expense" form — they're managed from the job.
 */
export const EXPENSE_FILTER_CATEGORIES = [
  ...EXPENSE_CATEGORIES,
  AMBASSADOR_COMMISSION_CATEGORY,
  PARENT_COMMISSION_CATEGORY,
] as const;

export const EXPENSE_FREQUENCIES = ["Monthly", "Quarterly", "Annual"] as const;
export type ExpenseFrequency = (typeof EXPENSE_FREQUENCIES)[number];

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const monthString = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");

export const createExpenseSchema = z
  .object({
    category: z.enum(EXPENSE_CATEGORIES),
    bucketSource: z.enum(EXPENSE_BUCKETS),
    description: z.string().trim().min(2, "Enter a description").max(300),
    amount: z.coerce.number().positive("Enter an amount greater than 0").max(100_000_000),
    date: dateString,
    recurring: z.boolean().default(false),
    frequency: z.enum(EXPENSE_FREQUENCIES).optional().or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    if (v.recurring && !v.frequency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["frequency"],
        message: "Pick how often this recurs",
      });
    }
  });
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const expenseListParamsSchema = z.object({
  category: z.enum(EXPENSE_FILTER_CATEGORIES).optional().catch(undefined),
  bucket: z.enum(EXPENSE_BUCKETS).optional().catch(undefined),
  status: z.enum(EXPENSE_STATUSES).optional().catch(undefined),
  kind: z.enum(EXPENSE_KINDS).optional().catch(undefined),
  month: monthString.optional().catch(undefined),
  from: dateString.optional().catch(undefined),
  to: dateString.optional().catch(undefined),
  page: z.coerce.number().int().positive().optional().catch(undefined),
});
export type ExpenseListParams = z.infer<typeof expenseListParamsSchema>;

/** `PATCH /expenses/[id]/approve` — the founder's decision on an expense over the threshold. */
export const approveExpenseSchema = z.object({
  decision: z.enum(["approve", "decline"]),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

/** `POST /expenses/sponsorship` — the HOG's student-union spending from the Growth Fund. */
export const sponsorshipExpenseSchema = z.object({
  description: z.string().trim().min(3, "Say who was sponsored").max(200),
  amount: z.coerce.number().int("Whole naira only").positive("Enter an amount greater than 0").max(100_000_000),
  date: dateString,
  notes: z.string().trim().max(300).optional().or(z.literal("")),
});
export type SponsorshipExpenseInput = z.infer<typeof sponsorshipExpenseSchema>;

/** `PATCH /api/admin/finance/settings` — the founder's finance numbers. */
export const financeSettingsSchema = z
  .object({
    operatingCostMonthlyBaseline: z.coerce.number().int().nonnegative().max(1_000_000_000).optional(),
    bucketReferenceRevenue: z.coerce.number().int().nonnegative().max(10_000_000_000).optional(),
    hogSponsorshipBudgetQuarterly: z.coerce.number().int().nonnegative().max(1_000_000_000).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change");
