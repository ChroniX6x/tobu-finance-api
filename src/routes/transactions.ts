import { Router } from "express";
import { Types } from "mongoose";
import Transaction from "../models/Transaction.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { CreateTx, QueryTx } from "../validation/transactions.js";
import { toMonthDate } from "../lib/month.js";
import { DateTime } from "luxon";
import Event from "../models/Event.js";

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
    amountMinor: b.amountMinor,
    month: b.month ? toMonthDate(b.month) : null,
    bookDate: b.bookDate ? new Date(b.bookDate) : null,
    status: b.status ?? "pending",
    isFromSharedAccount: b.isFromSharedAccount ?? null,
    paidByMemberId: b.paidByMemberId ? new Types.ObjectId(b.paidByMemberId) : null,
    recurrenceId: b.recurrenceId ? new Types.ObjectId(b.recurrenceId) : null,
  };
  const created = await Transaction.create(doc);

  await Event.create({
    accountId: doc.accountId,
    date: DateTime.utc().toJSDate(),
    code: "transaction.created",
    params: {
      transactionId: String(created._id),
      type: doc.type,
      amountMinor: doc.amountMinor,
      title: b.title ?? undefined,
      categoryId: b.categoryId ?? undefined,
    },
    createdByMemberId: doc.paidByMemberId ?? null,
  });

  res.status(201).json(created);
});

/** PATCH /api/transactions/:id */
r.patch("/:id", async (req, res) => {
  const { id } = req.params;

  // Vorher-Zustand lesen (für Event-Logik)
  const prev = await Transaction.findById(id);
  if (!prev) return res.sendStatus(404);

  const u = req.body as Partial<{
    accountId: string;
    categoryId: string | null;
    title: string | null;
    type: "income" | "expense";
    amountMinor: number;
    month: string | null;
    bookDate: string | null;
    status: "pending" | "booked";
    isFromSharedAccount: boolean | null;
    paidByMemberId: string | null;
    recurrenceId: string | null;
  }>;

  const patch: Record<string, unknown> = {};
  if (u.accountId) patch.accountId = new Types.ObjectId(u.accountId);
  if (u.categoryId !== undefined) patch.categoryId = u.categoryId ? new Types.ObjectId(u.categoryId) : null;
  if (u.title !== undefined) patch.title = u.title;
  if (u.type) patch.type = u.type;
  if (typeof u.amountMinor === "number") patch.amountMinor = u.amountMinor;
  if (u.month !== undefined && u.month) patch.month = toMonthDate(u.month);
  if (u.bookDate !== undefined) patch.bookDate = u.bookDate ? new Date(u.bookDate) : null;
  if (u.status) patch.status = u.status;
  if (u.isFromSharedAccount !== undefined) patch.isFromSharedAccount = u.isFromSharedAccount;
  if (u.paidByMemberId !== undefined) patch.paidByMemberId = u.paidByMemberId ? new Types.ObjectId(u.paidByMemberId) : null;
  if (u.recurrenceId !== undefined) patch.recurrenceId = u.recurrenceId ? new Types.ObjectId(u.recurrenceId) : null;

  const updated = await Transaction.findByIdAndUpdate(id, patch, { new: true });
  if (!updated) return res.sendStatus(404);

  // Event-Hooks für Statuswechsel
  if (prev.status !== "booked" && updated.status === "booked") {
    await Event.create({
      accountId: updated.accountId,
      date: DateTime.utc().toJSDate(),
      code: "transaction.booked",
      params: {
        transactionId: String(updated._id),
        type: updated.type,
        amountMinor: updated.amountMinor,
        title: updated.title ?? undefined,
        categoryId: updated.categoryId ? String(updated.categoryId) : undefined,
      },
      createdByMemberId: updated.paidByMemberId ?? null,
    });
  } else if (prev.status !== updated.status) {
    await Event.create({
      accountId: updated.accountId,
      date: DateTime.utc().toJSDate(),
      code: "transaction.statusChanged",
      params: {
        transactionId: String(updated._id),
        from: prev.status,
        to: updated.status,
        title: updated.title ?? undefined,
      },
      createdByMemberId: updated.paidByMemberId ?? null,
    });
  }

  res.json(updated);
});


/** DELETE /api/transactions/:id */
r.delete("/:id", async (req, res) => {
  const ok = await Transaction.findByIdAndDelete(req.params.id);
  if (!ok) return res.sendStatus(404);
  res.sendStatus(204);
});

export default r;
