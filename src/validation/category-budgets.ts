import { z } from "zod";

const ObjectId = z.string().regex(/^[a-f\d]{24}$/i, "must be a 24-char hex ObjectId");
const ISODate = z.string().datetime();

export const CreateCategoryBudget = z.object({
  accountId: ObjectId,
  categoryId: ObjectId,
  amountMinor: z.number().int().positive(),
  fromMonth: ISODate.nullish(),
  toMonth: ISODate.nullish(),
});

export const UpdateCategoryBudget = z.object({
  amountMinor: z.number().int().positive().optional(),
  fromMonth: ISODate.nullish(),
  toMonth: ISODate.nullish(),
});

export type CreateCategoryBudgetInput = z.infer<typeof CreateCategoryBudget>;
export type UpdateCategoryBudgetInput = z.infer<typeof UpdateCategoryBudget>;
