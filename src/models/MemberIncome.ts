import { Schema, model, Types } from "mongoose";
const MemberIncomeSchema = new Schema(
  {
    accountId: { type: Types.ObjectId, required: true, ref: "Account" },
    memberId: { type: Types.ObjectId, required: true, ref: "Member" },
    amountMinor: { type: Number, required: true, min: 0 },
    fromMonth: { type: Date, default: null },
    toMonth: { type: Date, default: null },
    source: { type: String, default: "salary" },
    note: { type: String, default: null }
  },
  { timestamps: true, versionKey: false }
);
MemberIncomeSchema.index({ accountId: 1, memberId: 1, fromMonth: 1, toMonth: 1 });
export default model("MemberIncome", MemberIncomeSchema, "member_incomes");
