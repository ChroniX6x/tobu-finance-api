import mongoose, { Schema, type InferSchemaType, model } from "mongoose";

const MemberSchema = new Schema(
  {
    name: { type: String, default: null },
    email: { type: String, default: null },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    avatar: { type: String, default: null }, // NEU
  },
  { timestamps: true }
);

export type MemberDoc = InferSchemaType<typeof MemberSchema>;
export default mongoose.models.Member || model("Member", MemberSchema);
