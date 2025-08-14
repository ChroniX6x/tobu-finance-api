import { z } from "zod";

export const ObjectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ObjectId");

export const QueryDashboardAccounts = z.object({
  userId: ObjectId.optional(),
  memberId: ObjectId.optional(),
  months: z
    .preprocess((v) => (v === undefined ? 5 : Number(v)), z.number().int().min(1).max(24))
    .optional(),
}).superRefine((val, ctx) => {
  if (!val.userId && !val.memberId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Either userId or memberId is required" });
  }
});
