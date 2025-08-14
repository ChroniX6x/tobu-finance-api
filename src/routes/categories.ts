import { Router } from "express";
import { Types } from "mongoose";
import Category from "../models/Category.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { QueryCategories, CreateCategory, UpdateCategory } from "../validation/categories.js";

const r = Router();

/** GET /api/categories?accountId=... */
r.get("/", validateQuery(QueryCategories), async (req, res) => {
  const { accountId } = (req as any).q;
  const q: any = {};
  if (accountId) q.accountId = new Types.ObjectId(accountId);
  const items = await Category.find(q).lean();
  res.json(items);
});

/** POST /api/categories { accountId, name, customSplit? } */
r.post("/", validateBody(CreateCategory), async (req, res) => {
  const b = (req as any).data;
  const doc: any = {
    accountId: new Types.ObjectId(b.accountId),
    name: b.name ?? null,
    customSplit: Array.isArray(b.customSplit)
      ? b.customSplit.map((x: any) => ({
          memberId: new Types.ObjectId(x.memberId),
          split: x.split,
        }))
      : [],
  };
  const created = await Category.create(doc);
  res.status(201).json(created);
});

/** PATCH /api/categories/:id */
r.patch("/:id", validateBody(UpdateCategory), async (req, res) => {
  const { id } = req.params;
  const u: any = { ...(req as any).data };
  if ("accountId" in u) u.accountId = new Types.ObjectId(u.accountId);
  if (Array.isArray(u.customSplit)) {
    u.customSplit = u.customSplit.map((x: any) => ({
      memberId: new Types.ObjectId(x.memberId),
      split: x.split,
    }));
  }
  const updated = await Category.findByIdAndUpdate(id, u, { new: true });
  if (!updated) return res.sendStatus(404);
  res.json(updated);
});

/** DELETE /api/categories/:id */
r.delete("/:id", async (req, res) => {
  const ok = await Category.findByIdAndDelete(req.params.id);
  if (!ok) return res.sendStatus(404);
  res.sendStatus(204);
});

export default r;
