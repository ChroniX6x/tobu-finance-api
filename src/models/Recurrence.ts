import { Schema, model, Types } from "mongoose";
const ScheduleSchema = new Schema(
  { freq: { type: String, enum: ["monthly"], default: "monthly" },
    dayOfMonth: { type: Number, min: 1, max: 28, default: 1 } },
  { _id: false }
);
const RecurrenceSchema = new Schema(
  {
    accountId: { type: Types.ObjectId, required: true, ref: "Account" },
    categoryId: { type: Types.ObjectId, ref: "Category", default: null },
    title: { type: String, default: null },
    type: { type: String, enum: ["income","expense"], required: true },
    amountCents: { type: Number, required: true, min: 0 },
    schedule: { type: ScheduleSchema, required: true },
    activeFrom: { type: Date, required: true },
    activeUntil: { type: Date, default: null },
    createdByMemberId: { type: Types.ObjectId, ref: "Member", default: null },
    nextPlanned: { type: Date, default: null },
    lastEmitted: { type: Date, default: null }
  },
  { timestamps: true, versionKey: false }
);
RecurrenceSchema.index({ accountId: 1, nextPlanned: 1 });
export default model("Recurrence", RecurrenceSchema, "recurrences");
