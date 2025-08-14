import { Router } from "express";
import { Types } from "mongoose";
import MemberIncome from "../models/MemberIncome.js";
import { toMonthDate } from "../lib/month.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { QueryMemberIncomes, CreateMemberIncome, UpdateMemberIncome } from "../validation/member-incomes.js";

const r = Router();

/** GET /api/member-incomes?accountId=&memberId=&from=YYYY-MM&to=YYYY-MM */
r.get("/", validateQuery(QueryMemberIncomes), async (req, res) => {
  const { accountId, memberId, from, to } = (req as any).q;
  const q: any = {};
  if (accountId) q.accountId = new Types.ObjectId(accountId);
  if (memberId) q.memberId = new Types.ObjectId(memberId);
  if (from || to) {
    const $and: any[] = [];
    if (from) $and.push({ $or: [{ toMonth: null }, { toMonth: { $gte: toMonthDate(from) } }] });
    if (to) $and.push({ $or: [{ fromMonth: null }, { fromMonth: { $lte: toMonthDate(to) } }] });
    if ($and.length) q.$and = $and;
  }
  res.json(await MemberIncome.find(q).lean());
});

/** POST /api/member-incomes */
r.post("/", validateBody(CreateMemberIncome), async (req, res) => {
  const b = (req as any).data;
  const created = await MemberIncome.create({
    accountId: new Types.ObjectId(b.accountId),
    memberId: new Types.ObjectId(b.memberId),
    amountCents: b.amountCents,
    fromMonth: b.fromMonth ? toMonthDate(b.fromMonth) : null,
    toMonth: b.toMonth ? toMonthDate(b.toMonth) : null,
    source: b.source ?? "salary",
    note: b.note ?? null,
  });
  res.status(201).json(created);
});

/** PATCH /api/member-incomes/:id */
r.patch("/:id", validateBody(UpdateMemberIncome), async (req, res) => {
  const { id } = req.params;
  const u: any = { ...(req as any).data };
  if ("accountId" in u) u.accountId = new Types.ObjectId(u.accountId);
  if ("memberId" in u) u.memberId = new Types.ObjectId(u.memberId);
  if ("fromMonth" in u && u.fromMonth) u.fromMonth = toMonthDate(u.fromMonth);
  if ("toMonth" in u && u.toMonth) u.toMonth = toMonthDate(u.toMonth);
  const updated = await MemberIncome.findByIdAndUpdate(id, u, { new: true });
  if (!updated) return res.sendStatus(404);
  res.json(updated);
});

/** DELETE /api/member-incomes/:id */
r.delete("/:id", async (req, res) => {
  const ok = await MemberIncome.findByIdAndDelete(req.params.id);
  if (!ok) return res.sendStatus(404);
  res.sendStatus(204);
});

export default r;
