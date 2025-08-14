import { Schema, model, Types } from "mongoose";
const CategoryBudgetSchema = new Schema(
  {
    accountId: { type: Types.ObjectId, required: true, ref: "Account" },
    categoryId: { type: Types.ObjectId, required: true, ref: "Category" },
    amountCents: { type: Number, required: true, min: 0 },
    fromMonth: { type: Date, default: null },
    toMonth: { type: Date, default: null }
  },
  { timestamps: true, versionKey: false }
);
export default model("CategoryBudget", CategoryBudgetSchema, "category_budgets");
