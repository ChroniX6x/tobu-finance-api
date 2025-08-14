import { Schema, model, Types } from "mongoose";
const MemberRefSchema = new Schema(
  {
    memberId: { type: Types.ObjectId, required: true, ref: "Member" },
    role: { type: String, enum: ["owner","member"], default: "member" }
  },
  { _id: false }
);
const AccountSchema = new Schema(
  {
    name: { type: String, default: null },
    currency: { type: String, default: "EUR" },
    members: { type: [MemberRefSchema], default: [] },
    settings: {
      monthGranularity: { type: String, default: "YYYY-MM" }
    }
  },
  { timestamps: true, versionKey: false }
);
export default model("Account", AccountSchema, "accounts");
