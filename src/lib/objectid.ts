import { Types } from "mongoose";
export const toObjectId = (v: string | Types.ObjectId) =>
  typeof v === "string" ? new Types.ObjectId(v) : v;
export const isObjectId = (v: unknown): v is Types.ObjectId =>
  v instanceof Types.ObjectId || Types.ObjectId.isValid(String(v));
