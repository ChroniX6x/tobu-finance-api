import { Schema, model } from "mongoose";

const TemplateSchema = new Schema(
  {
    _id: { type: String, alias: "id" },
    accountId: { type: String, required: true },
    categoryId: { type: String, required: false },
    title: { type: String, required: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ["expense", "income"], required: true },
    isRecurring: { type: Boolean, default: false },
    isFromSharedAccount: { type: Boolean, default: false },
    paidByMemberId: { type: String, required: false },
    createdBy: { type: String, required: false }
  },
  { timestamps: true, versionKey: false }
);

TemplateSchema.index({ accountId: 1 });

export type TemplateDoc = any;
export default model<TemplateDoc>("Template", TemplateSchema, "transactionTemplates");
