import { z } from "zod";
import { ObjId, MoneyMinor, Month } from "./common.js";
export const CreateTx = z.object({
  accountId: ObjId, categoryId: ObjId.nullish(),
  title: z.string().nullish(), type: z.enum(["income","expense"]),
  amountMinor: MoneyMinor, month: Month.nullish(), bookDate: z.string().datetime().nullish(),
  status: z.enum(["booked","pending"]).default("pending"),
  isFromSharedAccount: z.boolean().nullish(), paidByMemberId: ObjId.nullish(),
  recurrenceId: ObjId.nullish()
});
export const QueryTx = z.object({
  accountId: ObjId.optional(),
  month: Month.optional(),
  monthFrom: Month.optional(),
  monthTo: Month.optional(),
  status: z.enum(["booked","pending"]).optional()
});
