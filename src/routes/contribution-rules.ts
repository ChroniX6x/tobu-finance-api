import { Router } from "express";
import ContributionRule from "../models/ContributionRule.js";
import { validateBody } from "../middleware/validate.js";
import { CreateRule } from "../validation/contribution-rules.js";
import { toMonthDate } from "../lib/month.js";
import { Types } from "mongoose";

const r = Router();

r.get("/", async (req, res) => {
  const { accountId, month } = req.query as any;
  const q: any = {};
  if (accountId) q.accountId = new Types.ObjectId(accountId);
  if (month) {
    const M = toMonthDate(month);
    q.$and = [
      { $or: [ { fromMonth: null }, { fromMonth: { $lte: M } } ] },
      { $or: [ { toMonth: null },   { toMonth:   { $gte: M } } ] }
    ];
  }
  res.json(await ContributionRule.find(q).lean());
});

r.post("/", validateBody(CreateRule), async (req, res) => {
  const b = (req as any).data;
  const doc: any = {
    accountId: new Types.ObjectId(b.accountId),
    type: b.type, recurring: b.recurring, description: b.description ?? null,
    amountCents: b.amountCents, distribution: b.distribution,
    fromMonth: b.fromMonth ? toMonthDate(b.fromMonth) : null,
    toMonth:   b.toMonth   ? toMonthDate(b.toMonth)   : null,
    meta: b.meta ?? {}
  };
  if (doc.distribution?.memberId) doc.distribution.memberId = new Types.ObjectId(doc.distribution.memberId);
  if (Array.isArray(doc.distribution?.customSplit)) {
    doc.distribution.customSplit = doc.distribution.customSplit.map((x:any)=>({ memberId: new Types.ObjectId(x.memberId), split: x.split }));
  }
  const created = await ContributionRule.create(doc);
  res.status(201).json(created);
});

export default r;
