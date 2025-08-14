import { z } from "zod";

export const ObjectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ObjectId");
export const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Invalid month");

export const QueryAccounts = z.object({
  memberId: ObjectId.optional(),
});

export const AccountMember = z.object({
  memberId: ObjectId,
  role: z.enum(["owner", "member"]).optional(),
});

export const AccountSettings = z.object({
  monthGranularity: z.literal("YYYY-MM").optional(),
});

export const CreateAccount = z.object({
  name: z.string().nullable().optional(),
  currency: z.string().default("EUR").optional(),
  members: z.array(AccountMember).optional(),
  settings: AccountSettings.optional(),
});

export const UpdateAccount = CreateAccount.partial();

const includeEnum = z.enum([
  "members",
  "categories",
  "transactions",
  "memberIncomes",
  "carryovers",
  "accountBalances",
  "categoryBudgets",
  "recurrences",
]);

export const QueryAccountExpanded = z.object({
  include: z.preprocess(
    (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v),
    z.array(includeEnum).default([])
  ),
  from: Month.optional(),
  to: Month.optional(),
  status: z.enum(["booked", "pending"]).optional(),
}).superRefine((val, ctx) => {
  if ((val.from && !val.to) || (!val.from && val.to)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "from and to must be used together" });
  }
  if (val.status && !val.include?.includes("transactions")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "status is only valid with include=transactions" });
  }
});
