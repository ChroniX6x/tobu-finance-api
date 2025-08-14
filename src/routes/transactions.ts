import { Router } from "express";
import { Types } from "mongoose";
import Transaction from "../models/Transaction.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { CreateTx, QueryTx } from "../validation/transactions.js";
import { toMonthDate } from "../lib/month.js";

const r = Router();

/** GET /api/transactions?accountId=&month=&monthFrom=&monthTo=&status= */
r.get("/", validateQuery(QueryTx), async (req, res) => {
  const { accountId, month, monthFrom, monthTo, status } = (req as any).q;
  const q: any = {};
  if (accountId) q.accountId = new Types.ObjectId(accountId);
  if (status) q.status = status;
  if (month) q.month = toMonthDate(month);
  if (monthFrom || monthTo) {
    q.month = q.month || {};
    if (monthFrom) q.month.$gte = toMonthDate(monthFrom);
    if (monthTo) q.month.$lte = toMonthDate(monthTo);
  }
  const items = await Transaction.find(q).lean();
  res.json(items);
});

/** POST /api/transactions */
r.post("/", validateBody(CreateTx), async (req, res) => {
  const b = (req as any).data;
  const doc: any = {
    accountId: new Types.ObjectId(b.accountId),
    categoryId: b.categoryId ? new Types.ObjectId(b.categoryId) : null,
    title: b.title ?? null,
    type: b.type,
    amountCents: b.amountCents,
    month: b.month ? toMonthDate(b.month) : null,
    bookDate: b.bookDate ? new Date(b.bookDate) : null,
    status: b.status ?? "pending",
    isFromSharedAccount: b.isFromSharedAccount ?? null,
    paidByMemberId: b.paidByMemberId ? new Types.ObjectId(b.paidByMemberId) : null,
    recurrenceId: b.recurrenceId ? new Types.ObjectId(b.recurrenceId) : null,
  };
  const created = await Transaction.create(doc);
  res.status(201).json(created);
});

/** PATCH /api/transactions/:id */
r.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const u: any = { ...req.body };
  if ("accountId" in u && u.accountId) u.accountId = new Types.ObjectId(u.accountId);
  if ("categoryId" in u && u.categoryId) u.categoryId = new Types.ObjectId(u.categoryId);
  if ("paidByMemberId" in u && u.paidByMemberId) u.paidByMemberId = new Types.ObjectId(u.paidByMemberId);
  if ("recurrenceId" in u && u.recurrenceId) u.recurrenceId = new Types.ObjectId(u.recurrenceId);
  if ("month" in u && u.month) u.month = toMonthDate(u.month);
  if ("bookDate" in u && u.bookDate) u.bookDate = new Date(u.bookDate);
  const updated = await Transaction.findByIdAndUpdate(id, u, { new: true });
  if (!updated) return res.sendStatus(404);
  res.json(updated);
});

/** DELETE /api/transactions/:id */
r.delete("/:id", async (req, res) => {
  const ok = await Transaction.findByIdAndDelete(req.params.id);
  if (!ok) return res.sendStatus(404);
  res.sendStatus(204);
});

export default r;
