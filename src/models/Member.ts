import { Schema, model } from "mongoose";

const MemberSchema = new Schema(
  {
    _id: { type: String, alias: "id" }, // wir nutzen deine String-IDs als _id
    name: { type: String, required: true },
    email: { type: String, required: false },
    userID: { type: String, required: false }
  },
  { timestamps: true, versionKey: false }
);

export type MemberDoc = {
  _id: string;
  name: string;
  email?: string;
  userID?: string;
};

export default model<MemberDoc>("Member", MemberSchema, "member");
