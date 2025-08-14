import { z } from "zod";
import { ObjId, Role } from "./common.js";

const MemberEntry = z.object({
  memberId: ObjId,
  role: Role.optional().default("member"),
});

export const QueryAccounts = z.object({
  memberId: ObjId.optional()
});

export const CreateAccount = z.object({
  name: z.string().nullish(),
  currency: z.string().optional().default("EUR"),
  members: z.array(MemberEntry).optional(),
  settings: z.object({ monthGranularity: z.string().optional().default("YYYY-MM") }).optional()
});

export const UpdateAccount = CreateAccount.partial();
