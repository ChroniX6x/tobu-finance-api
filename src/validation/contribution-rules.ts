import { z } from "zod";
import { ObjId, MoneyCents, Month, Split } from "./common.js";

const DistPerMember = z.object({ mode: z.literal("perMember"), memberId: ObjId, customSplit: z.null().optional() });
const DistCustom = z.object({
  mode: z.literal("customSplit"), memberId: z.null().optional(),
  customSplit: z.array(Split).min(1)
}).refine(v => Math.abs(v.customSplit.reduce((s,x)=>s+x.split,0)-100) < 1e-6, "customSplit must sum to 100");
const DistProRata = z.object({ mode: z.literal("proRataIncome"), memberId: z.null().optional(), customSplit: z.null().optional() });

export const CreateRule = z.object({
  accountId: ObjId, type: z.enum(["base","additional","topup"]),
  recurring: z.boolean(), description: z.string().nullish(),
  amountCents: MoneyCents, distribution: z.discriminatedUnion("mode",[DistPerMember, DistCustom, DistProRata]),
  fromMonth: Month.nullish(), toMonth: Month.nullish(),
  meta: z.object({ legacyTopUpDate: z.string().nullish() }).optional()
});
