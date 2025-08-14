import { Router } from "express";
import { Types } from "mongoose";
import Recurrence from "../models/Recurrence.js";
import { toMonthDate } from "../lib/month.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { QueryRecurrences, CreateRecurrence, UpdateRecurrence } from "../validation/recurrences.js";

const r = Router();

/** GET /api/recurrences?accountId=...&activeOn=YYYY-MM&nextFrom=ISO&nextTo=ISO */
r.get("/", validateQuery(QueryRecurrences), async (req, res) => {
  const { accountId, activeOn, nextFrom, nextTo } = (req as any).q;
  const q: any = {};
  if (accountId) q.accountId = new Types.ObjectId(accountId);
  if (activeOn) {
    const M = toMonthDate(activeOn);
    q.$and = [
      { $or: [{ activeFrom: null }, { activeFrom: { $lte: M } }] },
      { $or: [{ activeUntil: null }, { activeUntil: { $gte: M } }] },
    ];
  }
  if (nextFrom || nextTo) {
    q.nextPlanned = {};
    if (nextFrom) q.nextPlanned.$gte = new Date(nextFrom);
    if (nextTo) q.nextPlanned.$lte = new Date(nextTo);
  }
  res.json(await Recurrence.find(q).lean());
});

/** POST /api/recurrences */
r.post("/", validateBody(CreateRecurrence), async (req, res) => {
  const b = (req as any).data;
  const doc: any = {
    accountId: new Types.ObjectId(b.accountId),
    categoryId: b.categoryId ? new Types.ObjectId(b.categoryId) : null,
    title: b.title ?? null,
    type: b.type,
    amountCents: b.amountCents,
    schedule: {
      freq: b.schedule?.freq ?? "monthly",
      dayOfMonth: b.schedule?.dayOfMonth ?? 1,
    },
    activeFrom: b.activeFrom ? toMonthDate(b.activeFrom) : new Date(),
    activeUntil: b.activeUntil ? toMonthDate(b.activeUntil) : null,
    createdByMemberId: b.createdByMemberId ? new Types.ObjectId(b.createdByMemberId) : null,
    nextPlanned: b.nextPlanned ? new Date(b.nextPlanned) : null,
    lastEmitted: b.lastEmitted ? new Date(b.lastEmitted) : null,
  };
  const created = await Recurrence.create(doc);
  res.status(201).json(created);
});

/** PATCH /api/recurrences/:id */
r.patch("/:id", validateBody(UpdateRecurrence), async (req, res) => {
  const { id } = req.params;
  const u: any = { ...(req as any).data };
  if ("accountId" in u) u.accountId = new Types.ObjectId(u.accountId);
  if ("categoryId" in u && u.categoryId) u.categoryId = new Types.ObjectId(u.categoryId);
  if ("createdByMemberId" in u && u.createdByMemberId) u.createdByMemberId = new Types.ObjectId(u.createdByMemberId);
  if ("activeFrom" in u && u.activeFrom) u.activeFrom = toMonthDate(u.activeFrom);
  if ("activeUntil" in u && u.activeUntil) u.activeUntil = toMonthDate(u.activeUntil);
  if ("nextPlanned" in u && u.nextPlanned) u.nextPlanned = new Date(u.nextPlanned);
  if ("lastEmitted" in u && u.lastEmitted) u.lastEmitted = new Date(u.lastEmitted);
  const updated = await Recurrence.findByIdAndUpdate(id, u, { new: true });
  if (!updated) return res.sendStatus(404);
  res.json(updated);
});

/** DELETE /api/recurrences/:id */
r.delete("/:id", async (req, res) => {
  const ok = await Recurrence.findByIdAndDelete(req.params.id);
  if (!ok) return res.sendStatus(404);
  res.sendStatus(204);
});

export default r;
