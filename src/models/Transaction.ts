import { Schema, model, Types } from "mongoose";
const TransactionSchema = new Schema(
  {
    accountId: { type: Types.ObjectId, required: true, ref: "Account" },
    categoryId: { type: Types.ObjectId, ref: "Category", default: null },
    title: { type: String, default: null },
    type: { type: String, enum: ["income","expense"], required: true },
    amountCents: { type: Number, required: true, min: 0 },
    month: { type: Date, default: null },
    bookDate: { type: Date, default: null },
    status: { type: String, enum: ["booked","pending"], default: "pending" },
    isFromSharedAccount: { type: Boolean, default: null },
    paidByMemberId: { type: Types.ObjectId, ref: "Member", default: null },
    recurrenceId: { type: Types.ObjectId, ref: "Recurrence", default: null }
  },
  { timestamps: true, versionKey: false }
);
TransactionSchema.index({ accountId: 1, month: 1, status: 1 });
TransactionSchema.index({ accountId: 1, bookDate: 1 });
TransactionSchema.index({ categoryId: 1, month: 1 });
TransactionSchema.index({ paidByMemberId: 1, month: 1 });
export default model("Transaction", TransactionSchema, "transactions");
