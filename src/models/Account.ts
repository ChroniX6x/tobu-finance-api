import { Schema, model } from "mongoose";
import {
  BalanceSchema,
  MonthlyIncomeSchema,
  PlannedContributionSchema,
  AdditionalContributionSchema,
  CarryOverSchema,
  TopUpSchema
} from "./common.js";

const AccountSchema = new Schema(
  {
    _id: { type: String, alias: "id" },
    name: { type: String, required: true },
    members: [{ type: String, required: true }],
    balances: [BalanceSchema],
    monthlyIncomes: [MonthlyIncomeSchema],
    monthlyPlannedContributions: [PlannedContributionSchema],
    additionalContributions: [AdditionalContributionSchema],
    carryOverBalances: [CarryOverSchema],
    topUps: [TopUpSchema]
  },
  { timestamps: true, versionKey: false }
);

AccountSchema.index({ "balances.month": 1 });
AccountSchema.index({ "monthlyIncomes.startMonth": 1 });

export type AccountDoc = any;
export default model<AccountDoc>("Account", AccountSchema, "accounts");
