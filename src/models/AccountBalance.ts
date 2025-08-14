import { Schema, model, Types } from "mongoose";
const AccountBalanceSchema = new Schema(
  {
    accountId: { type: Types.ObjectId, required: true, ref: "Account" },
    month: { type: Date, default: null },
    closingBalanceCents: { type: Number, required: true }
  },
  { versionKey: false }
);
AccountBalanceSchema.index({ accountId: 1, month: 1 }, { unique: true, sparse: true });
export default model("AccountBalance", AccountBalanceSchema, "account_balances");
