import { Schema, model, Types } from "mongoose";
const SplitSchema = new Schema(
  { memberId: { type: Types.ObjectId, required: true, ref: "Member" },
    split: { type: Number, min: 0, max: 100, required: true } },
  { _id: false }
);

const DistributionSchema = new Schema(
  {
    mode: { type: String, enum: ["perMember","customSplit","proRataIncome"], required: true },
    memberId: { type: Types.ObjectId, ref: "Member", default: null },   // nur perMember
    customSplit: { type: [SplitSchema], default: null }                  // nur customSplit
  },
  { _id: false }
);

const ContributionRuleSchema = new Schema(
  {
    accountId: { type: Types.ObjectId, required: true, ref: "Account" },
    type: { type: String, enum: ["base","additional","topup"], required: true },
    recurring: { type: Boolean, required: true },
    description: { type: String, default: null },
    amountMinor: { type: Number, required: true, min: 0 },
    distribution: { type: DistributionSchema, required: true },
    fromMonth: { type: Date, default: null },
    toMonth: { type: Date, default: null },
    meta: {
      legacyTopUpDate: { type: String, default: null }
    }
  },
  { timestamps: true, versionKey: false }
);

// Validierung: Distribution ist gegenseitig exklusiv
ContributionRuleSchema.pre("validate", function (next) {
  const d: any = (this as any).distribution || {};
  const isPerMember = d.mode === "perMember" && d.memberId && !d.customSplit;
  const isCustom = d.mode === "customSplit" && Array.isArray(d.customSplit) && !d.memberId;
  const isProRata = d.mode === "proRataIncome" && !d.memberId && !d.customSplit;
  if (!(isPerMember || isCustom || isProRata)) return next(new Error("Invalid distribution payload"));
  if (isCustom) {
    const sum = d.customSplit.reduce((s: number, x: any) => s + (x?.split ?? 0), 0);
    if (Math.abs(sum - 100) > 1e-6) return next(new Error("customSplit must sum to 100"));
  }
  next();
});

ContributionRuleSchema.index({ accountId: 1, fromMonth: 1, toMonth: 1, type: 1 });
export default model("ContributionRule", ContributionRuleSchema, "contribution_rules");
