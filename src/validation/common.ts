import { z } from "zod";

export const ObjId = z.string().regex(/^[a-f\d]{24}$/i, "Must be ObjectId");
export const MoneyMinor = z.number().int().nonnegative();        // >= 0
export const MoneyMinorAny = z.number().int();                    // kann negativ sein (CarryOver)
export const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be YYYY-MM");
export const ISODateTime = z.string().datetime();                 // ISO-8601 (für nextPlanned etc.)

export const Role = z.enum(["owner", "member"]);

export const Split = z.object({
  memberId: ObjId,
  split: z.number().min(0).max(100),
});
export const CustomSplit = z.array(Split)
  .refine(a => a.length === 0 || Math.abs(a.reduce((s, x) => s + x.split, 0) - 100) < 1e-6, "customSplit must sum to 100")
  .optional()
  .nullish();
