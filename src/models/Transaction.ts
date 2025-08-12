import { Schema, model } from "mongoose";

const TransactionSchema = new Schema(
  {
    _id: { type: String, alias: "id" },
    accountId: { type: String, required: true },
    categoryId: { type: String, required: false },
    title: { type: String, required: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ["expense", "income"], required: true },
    month: { type: String, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    isRecurring: { type: Boolean, default: false },
    isFromSharedAccount: { type: Boolean, default: false },
    paidByMemberId: { type: String, required: false },
    status: { type: String, enum: ["booked", "pending"], default: "pending" },
    recurringTemplateId: { type: String, required: false }
  },
  { timestamps: true, versionKey: false }
);

TransactionSchema.index({ accountId: 1, month: 1 });
TransactionSchema.index({ recurringTemplateId: 1 });

export type TransactionDoc = any;
export default model<TransactionDoc>("Transaction", TransactionSchema, "transactions");
