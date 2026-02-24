import { Router } from "express";
import { Types } from "mongoose";
import Transaction from "../models/Transaction.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { CreateTx, PatchTx, QueryTx, monthFromBookDate, monthFromYYYYMM } from "../validation/transactions.js";
import Event from "../models/Event.js";
import { DateTime } from "luxon";

const r = Router();

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Derive month Date from bookDate string or YYYY-MM string. bookDate takes precedence. */
function deriveMonth(bookDate?: string | null, month?: string | null): Date | null {
  if (bookDate) return monthFromBookDate(bookDate);
  if (month) return monthFromYYYYMM(month);
  return null;
}

/** Sum amountMinor of all direct children of a parent (excluding one optional id). */
async function sumChildren(parentId: Types.ObjectId, excludeId?: Types.ObjectId): Promise<number> {
  const match: Record<string, unknown> = { parentTransactionId: parentId };
  if (excludeId) match._id = { $ne: excludeId };
  const agg = await Transaction.aggregate<{ total: number }>([
    { $match: match },
    { $group: { _id: null, total: { $sum: "$amountMinor" } } },
  ]);
  return agg[0]?.total ?? 0;
}

// ─── GET /api/transactions ────────────────────────────────────────────────────

r.get("/", validateQuery(QueryTx), async (req, res) => {
  const { accountId, month, monthFrom, monthTo, status, q: search, parentTransactionId: ptxId, page, pageSize, sort } = (req as any).q;

  // Determine mode: parent-list mode (default) vs. child-list mode (explicit ObjectId)
  const isParentMode = !ptxId || ptxId === "null";

  const filter: Record<string, unknown> = {
    accountId: new Types.ObjectId(accountId),
    parentTransactionId: isParentMode ? null : new Types.ObjectId(ptxId),
  };

  if (status) filter.status = status;

  if (month) {
    filter.month = monthFromYYYYMM(month);
  } else if (monthFrom || monthTo) {
    const range: Record<string, Date> = {};
    if (monthFrom) range.$gte = monthFromYYYYMM(monthFrom);
    if (monthTo) range.$lte = monthFromYYYYMM(monthTo);
    filter.month = range;
  }

  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { notes: { $regex: search, $options: "i" } },
    ];
  }

  const sortField = sort.startsWith("amount") ? "amountMinor" : "bookDate";
  const sortDir = sort.endsWith("Asc") ? 1 : -1;
  const skip = (page - 1) * pageSize;

  const [parents, total] = await Promise.all([
    Transaction.find(filter).sort({ [sortField]: sortDir, _id: 1 }).skip(skip).limit(pageSize).lean(),
    Transaction.countDocuments(filter),
  ]);

  let items: unknown[];

  if (isParentMode && parents.length > 0) {
    // Batch-fetch all children for the returned page of parents in one query
    const parentIds = parents.map((p) => p._id);
    const allChildren = await Transaction.find({ parentTransactionId: { $in: parentIds } })
      .sort({ amountMinor: -1, _id: 1 })
      .lean();

    // Group children by parentTransactionId string key
    const childMap = new Map<string, typeof allChildren>();
    for (const child of allChildren) {
      const pid = (child.parentTransactionId as Types.ObjectId).toString();
      if (!childMap.has(pid)) childMap.set(pid, []);
      childMap.get(pid)!.push(child);
    }

    items = parents.map((p) => ({
      ...p,
      children: childMap.get((p._id as Types.ObjectId).toString()) ?? [],
    }));
  } else {
    // Child-list mode or empty page: no embedding needed
    items = parents;
  }

  res.json({ items, total, page, pageSize });
});

// ─── POST /api/transactions ───────────────────────────────────────────────────

r.post("/", validateBody(CreateTx), async (req, res) => {
  const b = (req as any).data;
  const isChild = !!b.parentTransactionId;

  let parentDoc: InstanceType<typeof Transaction> | null = null;

  if (isChild) {
    parentDoc = await Transaction.findById(b.parentTransactionId);
    if (!parentDoc) return res.status(422).json({ error: "PARENT_NOT_FOUND" });
    if (parentDoc.parentTransactionId) return res.status(422).json({ error: "PARENT_IS_CHILD" });

    // check split constraint
    const assigned = await sumChildren(parentDoc._id as Types.ObjectId);
    if (assigned + b.amountMinor > parentDoc.amountMinor) {
      return res.status(422).json({ error: "SPLIT_CONSTRAINT_EXCEEDED", assigned, parentTotal: parentDoc.amountMinor });
    }
  }

  const derivedMonth = deriveMonth(b.bookDate, b.month);
  if (!derivedMonth) return res.status(422).json({ error: "MONTH_REQUIRED", message: "Provide bookDate or month." });

  const doc: Record<string, unknown> = {
    accountId: new Types.ObjectId(b.accountId),
    categoryId: b.categoryId ? new Types.ObjectId(b.categoryId) : null,
    title: b.title,
    notes: b.notes ?? null,
    amountMinor: b.amountMinor,
    month: derivedMonth,
    bookDate: b.bookDate ? new Date(b.bookDate) : null,
    status: b.status ?? "pending",
    isFromSharedAccount: isChild ? parentDoc!.isFromSharedAccount : b.isFromSharedAccount,
    paidByMemberId: isChild
      ? parentDoc!.paidByMemberId
      : (b.paidByMemberId ? new Types.ObjectId(b.paidByMemberId) : null),
    parentTransactionId: isChild ? new Types.ObjectId(b.parentTransactionId) : null,
    recurrenceId: b.recurrenceId ? new Types.ObjectId(b.recurrenceId) : null,
    // type: always from parent for children
    type: isChild ? parentDoc!.type : b.type,
  };

  const created = await Transaction.create(doc);

  await Event.create({
    accountId: doc.accountId,
    date: DateTime.utc().toJSDate(),
    code: isChild ? "transaction.splitChildCreated" : "transaction.created",
    params: {
      transactionId: String(created._id),
      ...(isChild ? { parentTransactionId: b.parentTransactionId } : {}),
      type: doc.type,
      amountMinor: doc.amountMinor,
      title: b.title,
      categoryId: b.categoryId ?? undefined,
    },
    createdByMemberId: (doc.paidByMemberId as Types.ObjectId) ?? null,
  });

  res.status(201).json(created);
});

// ─── PATCH /api/transactions/:id ─────────────────────────────────────────────

r.patch("/:id", validateBody(PatchTx), async (req, res) => {
  const { id } = req.params;
  const b = (req as any).data;

  const prev = await Transaction.findById(id);
  if (!prev) return res.sendStatus(404);

  const isChild = !!prev.parentTransactionId;

  // Children: block changes to inherited fields
  if (isChild) {
    if (b.type !== undefined) return res.status(422).json({ error: "CHILD_FIELD_IMMUTABLE", field: "type" });
    if (b.isFromSharedAccount !== undefined) return res.status(422).json({ error: "CHILD_FIELD_IMMUTABLE", field: "isFromSharedAccount" });
    if (b.paidByMemberId !== undefined) return res.status(422).json({ error: "CHILD_FIELD_IMMUTABLE", field: "paidByMemberId" });
  }

  // Build next state for cross-field validation
  const nextBookDate = "bookDate" in b ? b.bookDate : (prev.bookDate ? prev.bookDate.toISOString() : null);
  const nextStatus = b.status ?? prev.status;
  const nextIsShared = b.isFromSharedAccount ?? prev.isFromSharedAccount;
  const nextPaidBy = "paidByMemberId" in b ? b.paidByMemberId : String(prev.paidByMemberId ?? "");

  if (nextStatus === "booked" && !nextBookDate) {
    return res.status(422).json({ error: "BOOKED_REQUIRES_BOOKDATE" });
  }
  if (nextIsShared === false && !nextPaidBy) {
    return res.status(422).json({ error: "PRIVATE_REQUIRES_PAIDBYMEMBER" });
  }
  if ("bookDate" in b && b.bookDate === null && nextStatus === "booked") {
    return res.status(422).json({ error: "CANNOT_CLEAR_BOOKDATE_WHILE_BOOKED" });
  }

  // Split constraints
  if (typeof b.amountMinor === "number") {
    if (isChild) {
      const parentDoc = await Transaction.findById(prev.parentTransactionId);
      if (!parentDoc) return res.status(422).json({ error: "PARENT_NOT_FOUND" });
      const assignedWithoutThis = await sumChildren(parentDoc._id as Types.ObjectId, prev._id as Types.ObjectId);
      if (assignedWithoutThis + b.amountMinor > parentDoc.amountMinor) {
        return res.status(422).json({ error: "SPLIT_CONSTRAINT_EXCEEDED", assignedWithoutThis, parentTotal: parentDoc.amountMinor });
      }
    } else {
      // parent amount shrinking: check children still fit
      const assigned = await sumChildren(prev._id as Types.ObjectId);
      if (assigned > b.amountMinor) {
        return res.status(422).json({ error: "SPLIT_CONSTRAINT_EXCEEDED", assigned, newParentTotal: b.amountMinor });
      }
    }
  }

  // Build patch
  const patch: Record<string, unknown> = {};
  if (b.categoryId !== undefined) patch.categoryId = b.categoryId ? new Types.ObjectId(b.categoryId) : null;
  if (b.title !== undefined) patch.title = b.title;
  if (b.notes !== undefined) patch.notes = b.notes ?? null;
  if (b.type !== undefined) patch.type = b.type;
  if (typeof b.amountMinor === "number") patch.amountMinor = b.amountMinor;
  if (b.status !== undefined) patch.status = b.status;
  if (b.isFromSharedAccount !== undefined) patch.isFromSharedAccount = b.isFromSharedAccount;
  if (b.paidByMemberId !== undefined) patch.paidByMemberId = b.paidByMemberId ? new Types.ObjectId(b.paidByMemberId) : null;
  if (b.recurrenceId !== undefined) patch.recurrenceId = b.recurrenceId ? new Types.ObjectId(b.recurrenceId) : null;

  // bookDate + derived month
  if ("bookDate" in b) {
    patch.bookDate = b.bookDate ? new Date(b.bookDate) : null;
    // month: re-derive if bookDate is set, keep existing if cleared
    patch.month = b.bookDate ? monthFromBookDate(b.bookDate) : prev.month;
  } else if (b.month !== undefined) {
    patch.month = monthFromYYYYMM(b.month);
  }

  const updated = await Transaction.findByIdAndUpdate(id, patch, { new: true });
  if (!updated) return res.sendStatus(404);

  // Cascade: if type or status changed on a parent, update children
  if (!isChild) {
    const childPatch: Record<string, unknown> = {};
    if (patch.type) childPatch.type = patch.type;
    if (patch.status) childPatch.status = patch.status;
    if (patch.bookDate !== undefined) {
      childPatch.bookDate = patch.bookDate;
      childPatch.month = patch.month;
    }
    if (Object.keys(childPatch).length) {
      await Transaction.updateMany({ parentTransactionId: updated._id }, childPatch);
    }
  }

  // Events
  if (prev.status !== "booked" && updated.status === "booked") {
    await Event.create({
      accountId: updated.accountId,
      date: DateTime.utc().toJSDate(),
      code: "transaction.booked",
      params: { transactionId: String(updated._id), type: updated.type, amountMinor: updated.amountMinor, title: updated.title ?? undefined },
      createdByMemberId: updated.paidByMemberId ?? null,
    });
  } else if (prev.status !== updated.status) {
    await Event.create({
      accountId: updated.accountId,
      date: DateTime.utc().toJSDate(),
      code: "transaction.statusChanged",
      params: { transactionId: String(updated._id), from: prev.status, to: updated.status, title: updated.title ?? undefined },
      createdByMemberId: updated.paidByMemberId ?? null,
    });
  }

  res.json(updated);
});

// ─── DELETE /api/transactions/:id ─────────────────────────────────────────────

r.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const target = await Transaction.findById(id);
  if (!target) return res.sendStatus(404);

  const isParent = !target.parentTransactionId;

  if (isParent) {
    // best-effort cascade: delete children first, then parent
    await Transaction.deleteMany({ parentTransactionId: target._id });
  }

  await Transaction.findByIdAndDelete(id);

  if (!target.parentTransactionId) {
    // it was a parent – nothing more needed
  } else {
    // it was a child – emit event
    await Event.create({
      accountId: target.accountId,
      date: DateTime.utc().toJSDate(),
      code: "transaction.splitChildDeleted",
      params: { transactionId: String(target._id), parentTransactionId: String(target.parentTransactionId) },
      createdByMemberId: target.paidByMemberId ?? null,
    }).catch(() => {}); // non-fatal
  }

  res.sendStatus(204);
});

export default r;
