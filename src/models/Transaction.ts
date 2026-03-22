import { Schema, model, Types } from "mongoose";
const TransactionSchema = new Schema(
  {
    accountId: { type: Types.ObjectId, required: true, ref: "Account" },
    categoryId: { type: Types.ObjectId, ref: "Category", default: null },
    title: { type: String, required: true },
    notes: { type: String, default: null },
    type: { type: String, enum: ["income", "expense"], required: true },
    amountMinor: { type: Number, required: true, min: 0 },
    month: { type: Date, required: true },
    bookDate: { type: Date, default: null },
    status: { type: String, enum: ["booked", "pending"], default: "pending" },
    isFromSharedAccount: { type: Boolean, required: true, default: true },
    paidByMemberId: { type: Types.ObjectId, ref: "Member", default: null },
    parentTransactionId: { type: Types.ObjectId, ref: "Transaction", default: null },
    recurrenceId: { type: Types.ObjectId, ref: "Recurrence", default: null },
  },
  { timestamps: true, versionKey: false }
);
// existing indexes retained
TransactionSchema.index({ accountId: 1, month: 1, status: 1 });
TransactionSchema.index({ accountId: 1, bookDate: -1 });
TransactionSchema.index({ categoryId: 1, month: 1 });
TransactionSchema.index({ paidByMemberId: 1, month: 1 });
// new: split queries
TransactionSchema.index({ accountId: 1, parentTransactionId: 1 });
TransactionSchema.index({ parentTransactionId: 1 });
export default model("Transaction", TransactionSchema, "transactions");
