import { z } from "zod";
import { ObjId, MoneyCents, Month } from "./common.js";

export const QueryMemberIncomes = z.object({
  accountId: ObjId.optional(),
  memberId: ObjId.optional(),
  from: Month.optional(),
  to: Month.optional()
});

export const CreateMemberIncome = z.object({
  accountId: ObjId,
  memberId: ObjId,
  amountCents: MoneyCents,
  fromMonth: Month.nullish(),
  toMonth: Month.nullish(),
  source: z.string().nullish(),
  note: z.string().nullish()
});

export const UpdateMemberIncome = CreateMemberIncome.partial();
