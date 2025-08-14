import { Schema, model, Types } from "mongoose";
const CarryOverSchema = new Schema(
  {
    accountId: { type: Types.ObjectId, required: true, ref: "Account" },
    memberId: { type: Types.ObjectId, required: true, ref: "Member" },
    month: { type: Date, default: null },
    amountCents: { type: Number, required: true }, // darf negativ sein
    reason: { type: String, default: "" },
    createdAt: { type: Date, default: () => new Date() }
  },
  { versionKey: false }
);
CarryOverSchema.index({ accountId: 1, memberId: 1, month: 1 }, { unique: true, sparse: true });
export default model("CarryOver", CarryOverSchema, "carryovers");
