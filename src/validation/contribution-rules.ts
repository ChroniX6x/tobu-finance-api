import { z } from "zod";

const ObjectId = z.string().regex(/^[a-f\d]{24}$/i, "must be a 24-char hex ObjectId");
const ISODate = z.string().datetime(); // ISO (date-time). Für Monatsanker gibst du den 1. des Monats 00:00Z.

export const CreateContributionRule = z.object({
  accountId: ObjectId,
  type: z.enum(["base", "additional", "topup"]),
  amountCents: z.number().int().nonnegative(),
  distribution: z.unknown(), // wird serverseitig geprüft/verteilt
  fromMonth: ISODate.nullish(), // optional | null
  toMonth: ISODate.nullish(),   // optional | null
  createdByMemberId: ObjectId.nullish(),
});

export const UpdateContributionRule = z.object({
  type: z.enum(["base", "additional", "topup"]).optional(),
  amountCents: z.number().int().nonnegative().optional(),
  distribution: z.unknown().optional(),
  fromMonth: ISODate.nullish(), // .optional().nullable() durch .nullish()
  toMonth: ISODate.nullish(),
  createdByMemberId: ObjectId.nullish(),
});

// Falls du Types brauchst:
export type CreateContributionRuleInput = z.infer<typeof CreateContributionRule>;
export type UpdateContributionRuleInput = z.infer<typeof UpdateContributionRule>;
