import { z } from "zod";
import { ObjId, MoneyMinorAny, Month } from "./common.js";

export const QueryCarryOvers = z.object({
  accountId: ObjId.optional(),
  memberId: ObjId.optional(),
  from: Month.optional(),
  to: Month.optional()
});

export const UpsertCarryOver = z.object({
  accountId: ObjId,
  memberId: ObjId,
  month: Month,
  amountMinor: MoneyMinorAny,   // darf negativ sein
  reason: z.string().nullish()
});
