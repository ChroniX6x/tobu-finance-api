import mongoose, { Schema, type InferSchemaType, model } from "mongoose";

const AccountMemberSchema = new Schema(
  {
    memberId: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    role: { type: String, enum: ["owner", "member"], default: "member" },
  },
  { _id: false }
);

const AccountSettingsSchema = new Schema(
  {
    dashboard: {
      historyMonths: { type: Number, min: 3, max: 24, default: 6 },
      topKCategories: { type: Number, min: 1, max: 10, default: 5 },
    },
    alerts: {
      lowBalanceForecastCents: { type: Number, min: 0, default: 100_000 },
      carryoverLargeCents: { type: Number, min: 0, default: 10_000 },
    },
  },
  { _id: false }
);

const AccountSchema = new Schema(
  {
    name: { type: String, default: null },
    currency: { type: String, default: "EUR" },
    members: { type: [AccountMemberSchema], default: [] },
    settings: { type: AccountSettingsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

AccountSchema.index({ "members.memberId": 1 });

export type AccountDoc = InferSchemaType<typeof AccountSchema>;
export default mongoose.models.Account || model("Account", AccountSchema);
