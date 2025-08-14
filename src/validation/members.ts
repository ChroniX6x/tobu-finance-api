import { z } from "zod";
import { ObjId } from "./common.js";

export const QueryMembers = z.object({
  userId: ObjId.optional()
});

export const CreateMember = z.object({
  name: z.string().nullish(),
  email: z.string().email().nullish().optional(),
  userId: ObjId.nullish()
});

export const UpdateMember = CreateMember.partial();
