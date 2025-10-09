import { Router } from "express";
import { Types } from "mongoose";
import { DateTime } from "luxon";

import CategoryBudget from "../models/CategoryBudget.js";
import Event from "../models/Event.js";
import { toMonthDate } from "../lib/month.js";

// Falls vorhanden, Validierung anhängen
import { validateBody } from "../middleware/validate.js";
import {
  CreateCategoryBudget,
  UpdateCategoryBudget,
} from "../validation/category-budgets.js";

const r = Router();

/** GET /api/category-budgets?accountId=...&categoryId=... */
r.get("/", async (req, res) => {
  const { accountId, categoryId } = (req.query ?? {}) as { accountId?: string; categoryId?: string };
  const q: Record<string, unknown> = {};
  if (accountId && /^[a-f\d]{24}$/i.test(accountId)) q.accountId = new Types.ObjectId(accountId);
  if (categoryId && /^[a-f\d]{24}$/i.test(categoryId)) q.categoryId = new Types.ObjectId(categoryId);
  const items = await CategoryBudget.find(q).lean();
  res.json(items);
});

/** POST /api/category-budgets */
r.post("/", validateBody(CreateCategoryBudget), async (req, res) => {
  const b = (req as unknown as {
    data: {
      accountId: string;
      categoryId: string;
      amountMinor: number;
      fromMonth?: string | null;
      toMonth?: string | null;
    };
  }).data;

  const doc: Record<string, unknown> = {
    accountId: new Types.ObjectId(b.accountId),
    categoryId: new Types.ObjectId(b.categoryId),
    amountMinor: b.amountMinor,
    fromMonth: b.fromMonth ? toMonthDate(b.fromMonth) : null,
    toMonth: b.toMonth ? toMonthDate(b.toMonth) : null,
  };

  const created = await CategoryBudget.create(doc);

  // EVENT: categoryBudget.added
  await Event.create({
    accountId: new Types.ObjectId(b.accountId),
    date: DateTime.utc().toJSDate(),
    code: "categoryBudget.added",
    params: { categoryId: b.categoryId, amountMinor: b.amountMinor },
    createdByMemberId: null,
  });

  res.status(201).json(created);
});

/** PATCH /api/category-budgets/:id */
r.patch("/:id", validateBody(UpdateCategoryBudget), async (req, res) => {
  const { id } = req.params;

  const u = (req as unknown as {
    data: Partial<{ amountMinor: number; fromMonth: string | null; toMonth: string | null }>;
  }).data;

  const existing = await CategoryBudget.findById(id);
  if (!existing) return res.sendStatus(404);

  const patch: Record<string, unknown> = {};
  if (typeof u.amountMinor === "number") patch.amountMinor = u.amountMinor;
  if (u.fromMonth !== undefined) patch.fromMonth = u.fromMonth ? toMonthDate(u.fromMonth) : null;
  if (u.toMonth !== undefined) patch.toMonth = u.toMonth ? toMonthDate(u.toMonth) : null;

  const updated = await CategoryBudget.findByIdAndUpdate(id, patch, { new: true });
  if (!updated) return res.sendStatus(404);

  // EVENT: categoryBudget.updated
  await Event.create({
    accountId: updated.accountId as unknown as Types.ObjectId,
    date: DateTime.utc().toJSDate(),
    code: "categoryBudget.updated",
    params: { categoryId: String(updated.categoryId), amountMinor: (updated as { amountMinor?: number }).amountMinor ?? 0 },
    createdByMemberId: null,
  });

  res.json(updated);
});

/** DELETE /api/category-budgets/:id */
r.delete("/:id", async (req, res) => {
  const { id } = req.params;

  // Vor dem Löschen laden (Variablen bereitstellen!)
  const existing = await CategoryBudget.findById(id);
  if (!existing) return res.sendStatus(404);

  await CategoryBudget.deleteOne({ _id: id });

  // EVENT: categoryBudget.removed
  await Event.create({
    accountId: existing.accountId as unknown as Types.ObjectId,
    date: DateTime.utc().toJSDate(),
    code: "categoryBudget.removed",
    params: { categoryId: String(existing.categoryId) },
    createdByMemberId: null,
  });

  res.sendStatus(204);
});

export default r;
