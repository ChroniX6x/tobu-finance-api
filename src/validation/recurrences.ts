import { z } from "zod";
import { ObjId, MoneyCents, Month, ISODateTime } from "./common.js";

const Schedule = z.object({
  freq: z.literal("monthly").optional().default("monthly"),
  dayOfMonth: z.number().int().min(1).max(28).optional().default(1)
});

export const QueryRecurrences = z.object({
  accountId: ObjId.optional(),
  activeOn: Month.optional(),
  nextFrom: ISODateTime.optional(),
  nextTo: ISODateTime.optional()
});

export const CreateRecurrence = z.object({
  accountId: ObjId,
  categoryId: z.string().regex(/^[a-f\d]{24}$/i).nullish().optional(),
  title: z.string().nullish(),
  type: z.enum(["income","expense"]),
  amountCents: MoneyCents,
  schedule: Schedule.optional(),
  activeFrom: Month.nullish(),
  activeUntil: Month.nullish(),
  createdByMemberId: ObjId.nullish(),
  nextPlanned: ISODateTime.nullish(),
  lastEmitted: ISODateTime.nullish()
});

export const UpdateRecurrence = CreateRecurrence.partial();
