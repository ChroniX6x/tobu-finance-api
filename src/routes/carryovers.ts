import { Router } from "express";
import { Types } from "mongoose";
import CarryOver from "../models/CarryOver.js";
import { toMonthDate } from "../lib/month.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { QueryCarryOvers, UpsertCarryOver } from "../validation/carryovers.js";

const r = Router();

/** GET /api/carryovers?accountId=&memberId=&from=YYYY-MM&to=YYYY-MM */
r.get("/", validateQuery(QueryCarryOvers), async (req, res) => {
  const { accountId, memberId, from, to } = (req as any).q;
  const q: any = {};
  if (accountId) q.accountId = new Types.ObjectId(accountId);
  if (memberId) q.memberId = new Types.ObjectId(memberId);
  if (from || to) {
    q.month = {};
    if (from) q.month.$gte = toMonthDate(from);
    if (to) q.month.$lte = toMonthDate(to);
  }
  res.json(await CarryOver.find(q).lean());
});

/** PUT /api/carryovers  (Upsert pro accountId+memberId+month) */
r.put("/", validateBody(UpsertCarryOver), async (req, res) => {
  const b = (req as any).data;
  const key = {
    accountId: new Types.ObjectId(b.accountId),
    memberId: new Types.ObjectId(b.memberId),
    month: toMonthDate(b.month),
  };
  const update: any = {
    $set: {
      amountMinor: b.amountMinor,
      reason: b.reason ?? "",
    },
  };
  const doc = await CarryOver.findOneAndUpdate(key, update, { new: true, upsert: true });
  res.json(doc);
});

/** DELETE /api/carryovers/:id */
r.delete("/:id", async (req, res) => {
  const ok = await CarryOver.findByIdAndDelete(req.params.id);
  if (!ok) return res.sendStatus(404);
  res.sendStatus(204);
});

export default r;
