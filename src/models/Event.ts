import mongoose, { Schema, type InferSchemaType, model } from "mongoose";

const EventSchema = new Schema(
  {
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    date: { type: Date, required: true },
    code: { type: String, required: true },
    params: { type: Object, required: true, default: {} },
    createdByMemberId: { type: Schema.Types.ObjectId, ref: "Member", default: null },
  },
  { timestamps: true }
);

EventSchema.index({ accountId: 1, date: -1 });

export type EventDoc = InferSchemaType<typeof EventSchema>;
export default mongoose.models.Event || model("Event", EventSchema);
