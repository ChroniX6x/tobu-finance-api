import { z } from "zod";
import { ObjId, CustomSplit } from "./common.js";

export const QueryCategories = z.object({
  accountId: ObjId.optional()
});

export const CreateCategory = z.object({
  accountId: ObjId,
  name: z.string().nullish(),
  customSplit: CustomSplit
});

export const UpdateCategory = CreateCategory.partial();
