import { z } from "zod";
import { ObjId, MoneyMinor, Month } from "./common.js";

export const QueryAccountBalances = z.object({
  accountId: ObjId.optional(),
  from: Month.optional(),
  to: Month.optional()
});

export const UpsertAccountBalance = z.object({
  accountId: ObjId,
  month: Month,
  closingBalanceMinor: MoneyMinor
});
