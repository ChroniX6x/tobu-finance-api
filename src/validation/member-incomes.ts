import { z } from "zod";

const ObjectId = z.string().regex(/^[a-f\d]{24}$/i, "must be a 24-char hex ObjectId");
const ISODate = z.string().datetime();

export const CreateMemberIncome = z.object({
  accountId: ObjectId,
  memberId: ObjectId,
  amountMinor: z.number().int().nonnegative(),
  fromMonth: ISODate.nullish(),
  toMonth: ISODate.nullish(),
});

export const UpdateMemberIncome = z.object({
  amountMinor: z.number().int().nonnegative().optional(),
  fromMonth: ISODate.nullish(),
  toMonth: ISODate.nullish(),
});

export type CreateMemberIncomeInput = z.infer<typeof CreateMemberIncome>;
export type UpdateMemberIncomeInput = z.infer<typeof UpdateMemberIncome>;
