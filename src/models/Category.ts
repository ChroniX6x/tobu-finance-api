import { Schema, model } from "mongoose";
import { SplitSchema } from "./common";


const CategorySchema = new Schema(
  {
    _id: { type: String, alias: "id" },
    accountId: { type: String, required: true },
    name: { type: String, required: true },
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
  { timestamps: true, versionKey: false }
);

CategorySchema.index({ accountId: 1 });

export type CategoryDoc = any;
export default model<CategoryDoc>("Category", CategorySchema, "categories");
