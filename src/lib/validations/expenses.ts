import { z } from "zod";

export const EXPENSE_CATEGORIES = [
  "Software",
  "Internet/Data",
  "Marketing",
  "Equipment",
  "Personnel",
  "Miscellaneous",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_FREQUENCIES = ["Monthly", "Quarterly", "Annual"] as const;
export type ExpenseFrequency = (typeof EXPENSE_FREQUENCIES)[number];

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

export const createExpenseSchema = z
  .object({
    category: z.enum(EXPENSE_CATEGORIES),
    description: z.string().trim().min(2, "Enter a description").max(300),
    amount: z.coerce.number().positive("Enter an amount greater than 0"),
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
  category: z.enum(EXPENSE_CATEGORIES).optional().catch(undefined),
  from: dateString.optional().catch(undefined),
  to: dateString.optional().catch(undefined),
  page: z.coerce.number().int().positive().optional().catch(undefined),
});
export type ExpenseListParams = z.infer<typeof expenseListParamsSchema>;
