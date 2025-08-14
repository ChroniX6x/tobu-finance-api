import { Schema, model, Types } from "mongoose";
const SplitSchema = new Schema(
  { memberId: { type: Types.ObjectId, required: true, ref: "Member" },
    split: { type: Number, min: 0, max: 100, required: true } },
  { _id: false }
);
const CategorySchema = new Schema(
  {
    accountId: { type: Types.ObjectId, required: true, ref: "Account" },
    name: { type: String, default: null },
    customSplit: { type: [SplitSchema], default: [] }
  },
  { timestamps: true, versionKey: false }
);
CategorySchema.index({ accountId: 1, name: 1 });
export default model("Category", CategorySchema, "categories");
