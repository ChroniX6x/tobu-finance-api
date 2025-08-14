import { Router } from "express";
import { Types } from "mongoose";
import CategoryBudget from "../models/CategoryBudget.js";
import { toMonthDate } from "../lib/month.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { QueryCategoryBudgets, CreateCategoryBudget, UpdateCategoryBudget } from "../validation/category-budgets.js";

const r = Router();

/** GET /api/category-budgets?accountId=&categoryId=&from=YYYY-MM&to=YYYY-MM */
r.get("/", validateQuery(QueryCategoryBudgets), async (req, res) => {
  const { accountId, categoryId, from, to } = (req as any).q;
  const q: any = {};
  if (accountId) q.accountId = new Types.ObjectId(accountId);
  if (categoryId) q.categoryId = new Types.ObjectId(categoryId);
  if (from || to) {
    const and: any[] = [];
    if (from) and.push({ $or: [{ toMonth: null }, { toMonth: { $gte: toMonthDate(from) } }] });
    if (to) and.push({ $or: [{ fromMonth: null }, { fromMonth: { $lte: toMonthDate(to) } }] });
    if (and.length) q.$and = and;
  }
  res.json(await CategoryBudget.find(q).lean());
});

/** POST /api/category-budgets */
r.post("/", validateBody(CreateCategoryBudget), async (req, res) => {
  const b = (req as any).data;
  const created = await CategoryBudget.create({
    accountId: new Types.ObjectId(b.accountId),
    categoryId: new Types.ObjectId(b.categoryId),
    amountCents: b.amountCents,
    fromMonth: b.fromMonth ? toMonthDate(b.fromMonth) : null,
    toMonth: b.toMonth ? toMonthDate(b.toMonth) : null,
  });
  res.status(201).json(created);
});

/** PATCH /api/category-budgets/:id */
r.patch("/:id", validateBody(UpdateCategoryBudget), async (req, res) => {
  const { id } = req.params;
  const u: any = { ...(req as any).data };
  if ("accountId" in u) u.accountId = new Types.ObjectId(u.accountId);
  if ("categoryId" in u) u.categoryId = new Types.ObjectId(u.categoryId);
  if ("fromMonth" in u && u.fromMonth) u.fromMonth = toMonthDate(u.fromMonth);
  if ("toMonth" in u && u.toMonth) u.toMonth = toMonthDate(u.toMonth);
  const updated = await CategoryBudget.findByIdAndUpdate(id, u, { new: true });
  if (!updated) return res.sendStatus(404);
  res.json(updated);
});

/** DELETE /api/category-budgets/:id */
r.delete("/:id", async (req, res) => {
  const ok = await CategoryBudget.findByIdAndDelete(req.params.id);
  if (!ok) return res.sendStatus(404);
  res.sendStatus(204);
});

export default r;
