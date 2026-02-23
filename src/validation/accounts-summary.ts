import { z } from "zod";

export const ObjectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ObjectId");

export const QueryAccountsSummary = z.object({
  months: z
    .preprocess((v) => (v === undefined ? 5 : Number(v)), z.number().int().min(1).max(24))
    .optional(),
});
