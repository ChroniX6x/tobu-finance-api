import { Schema } from "mongoose";

/** YYYY-MM (z.B. 2025-08) */
export const MonthString = { type: String, match: /^\d{4}-(0[1-9]|1[0-2])$/ };

export const BalanceSchema = new Schema(
  {
    month: MonthString,
    value: { type: Number, required: true }
  },
  { _id: false }
);

export const MonthlyIncomeSchema = new Schema(
  {
    memberId: { type: String, required: true },
    amount: { type: Number, required: true },
    startMonth: MonthString,
    endMonth: { type: String, required: false }
  },
  { _id: false }
);

export const PlannedContributionSchema = new Schema(
  {
    // entweder memberId ODER categoryId je nach Einsatz in deinem JSON
    memberId: { type: String, required: false },
    categoryId: { type: String, required: false },
    amount: { type: Number, required: true },
    startMonth: MonthString,
    endMonth: { type: String, required: false }
  },
  { _id: false }
);

export const AdditionalContributionSchema = new Schema(
  {
    memberId: { type: String, required: true },
    amount: { type: Number, required: true },
    startMonth: MonthString,
    description: { type: String },
    recurring: { type: Boolean, default: false }
  },
  { _id: false }
);

export const CarryOverSchema = new Schema(
  {
    memberId: { type: String, required: true },
    amount: { type: Number, required: true },
    month: MonthString
  },
  { _id: false }
);

export const SplitSchema = new Schema(
  {
    memberId: { type: String, required: true },
    split: { type: Number, required: true, min: 0, max: 100 }
  },
  { _id: false }
);

export const TopUpSchema = new Schema(
  {
    _id: { type: String, alias: "id" },
    amount: { type: Number, required: true },
    month: { type: String, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    reason: { type: String },
    date: { type: String }, // YYYY-MM-DD
    // ALT: Mixed → NEU: Array von Splits + Summe=100 Validierung
    customSplit: {
      type: [SplitSchema],
      validate: {
        validator: (arr: any[]) =>
          !arr?.length || Math.abs(arr.reduce((s, x) => s + (x?.split ?? 0), 0) - 100) < 1e-6,
        message: "customSplit must sum to 100."
      }
    }
  },
  { _id: true }
);
