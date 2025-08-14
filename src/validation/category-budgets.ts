import { z } from "zod";
import { ObjId, MoneyCents, Month } from "./common.js";

export const QueryCategoryBudgets = z.object({
  accountId: ObjId.optional(),
  categoryId: ObjId.optional(),
  from: Month.optional(),
  to: Month.optional()
});

export const CreateCategoryBudget = z.object({
  accountId: ObjId,
  categoryId: ObjId,
  amountCents: MoneyCents,
  fromMonth: Month.nullish(),
  toMonth: Month.nullish()
});

export const UpdateCategoryBudget = CreateCategoryBudget.partial();
