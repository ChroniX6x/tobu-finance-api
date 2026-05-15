import { Router } from "express";
import { Types } from "mongoose";
import { DateTime } from "luxon";

import CategoryBudget from "../models/CategoryBudget.js";
import Event from "../models/Event.js";
import { toMonthDate } from "../lib/month.js";
import { validateBody } from "../middleware/validate.js";
import {
  CreateCategoryBudget,
  UpdateCategoryBudget,
} from "../validation/category-budgets.js";
import { monthRangesOverlap } from "../utils/month-overlap.js";
import { regenerateBaseRules } from "../services/contribution-rule-generator.js";

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

  const newFrom = b.fromMonth ? toMonthDate(b.fromMonth) : null;
  const newTo = b.toMonth ? toMonthDate(b.toMonth) : null;

  // Overlap check: no two budgets for the same category may overlap in time
  const siblings = await CategoryBudget.find({
    accountId: new Types.ObjectId(b.accountId),
    categoryId: new Types.ObjectId(b.categoryId),
  }).lean();

  for (const s of siblings) {
    if (
      monthRangesOverlap(
        { fromMonth: newFrom, toMonth: newTo },
        { fromMonth: (s.fromMonth as unknown as Date | null), toMonth: (s.toMonth as unknown as Date | null) }
      )
    ) {
      return res.status(409).json({
        code: "BUDGET_OVERLAP",
        message: "A budget for this category already covers the given time range.",
      });
    }
  }

  const created = await CategoryBudget.create({
    accountId: new Types.ObjectId(b.accountId),
    categoryId: new Types.ObjectId(b.categoryId),
    amountMinor: b.amountMinor,
    fromMonth: newFrom,
    toMonth: newTo,
  });

  await Event.create({
    accountId: new Types.ObjectId(b.accountId),
    date: DateTime.utc().toJSDate(),
    code: "categoryBudget.added",
    params: { categoryId: b.categoryId, amountMinor: b.amountMinor },
    createdByMemberId: null,
  });

  await regenerateBaseRules(b.accountId);

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

  // Resolve effective new range (fall back to existing values if not in patch)
  const newFrom = u.fromMonth !== undefined
    ? (u.fromMonth ? toMonthDate(u.fromMonth) : null)
    : (existing.fromMonth as unknown as Date | null);
  const newTo = u.toMonth !== undefined
    ? (u.toMonth ? toMonthDate(u.toMonth) : null)
    : (existing.toMonth as unknown as Date | null);

  // Overlap check (exclude self)
  const siblings = await CategoryBudget.find({
    accountId: existing.accountId,
    categoryId: existing.categoryId,
    _id: { $ne: existing._id },
  }).lean();

  for (const s of siblings) {
    if (
      monthRangesOverlap(
        { fromMonth: newFrom, toMonth: newTo },
        { fromMonth: (s.fromMonth as unknown as Date | null), toMonth: (s.toMonth as unknown as Date | null) }
      )
    ) {
      return res.status(409).json({
        code: "BUDGET_OVERLAP",
        message: "The updated time range overlaps with another budget for the same category.",
      });
    }
  }

  const patch: Record<string, unknown> = {};
  if (typeof u.amountMinor === "number") patch.amountMinor = u.amountMinor;
  if (u.fromMonth !== undefined) patch.fromMonth = newFrom;
  if (u.toMonth !== undefined) patch.toMonth = newTo;

  const updated = await CategoryBudget.findByIdAndUpdate(id, patch, { new: true });
  if (!updated) return res.sendStatus(404);

  await Event.create({
    accountId: updated.accountId as unknown as Types.ObjectId,
    date: DateTime.utc().toJSDate(),
    code: "categoryBudget.updated",
    params: { categoryId: String(updated.categoryId), amountMinor: (updated as { amountMinor?: number }).amountMinor ?? 0 },
    createdByMemberId: null,
  });

  await regenerateBaseRules(String(updated.accountId));

  res.json(updated);
});

/** DELETE /api/category-budgets/:id */
r.delete("/:id", async (req, res) => {
  const { id } = req.params;

  const existing = await CategoryBudget.findById(id);
  if (!existing) return res.sendStatus(404);

  await CategoryBudget.deleteOne({ _id: id });

  await Event.create({
    accountId: existing.accountId as unknown as Types.ObjectId,
    date: DateTime.utc().toJSDate(),
    code: "categoryBudget.removed",
    params: { categoryId: String(existing.categoryId) },
    createdByMemberId: null,
  });

  await regenerateBaseRules(String(existing.accountId));

  res.sendStatus(204);
});

export default r;
