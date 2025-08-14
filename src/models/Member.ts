import { Schema, model, Types } from "mongoose";
const MemberSchema = new Schema(
  {
    name: { type: String, default: null },
    email: { type: String, default: null },
    userId: { type: Types.ObjectId, default: null } // optional App-User
  },
  { timestamps: true, versionKey: false }
);
MemberSchema.index({ userId: 1 }, { sparse: true });
export default model("Member", MemberSchema, "members");
