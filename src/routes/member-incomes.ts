import { Router } from "express";
import { Types } from "mongoose";
import { DateTime } from "luxon";

import MemberIncome from "../models/MemberIncome.js";
import Event from "../models/Event.js";
import { toMonthDate } from "../lib/month.js";

// Falls vorhanden, Validierung anhängen
import { validateBody } from "../middleware/validate.js";
import {
  CreateMemberIncome,
  UpdateMemberIncome,
} from "../validation/member-incomes.js";

const r = Router();

/** GET /api/member-incomes?accountId=...&memberId=... */
r.get("/", async (req, res) => {
  const { accountId, memberId } = (req.query ?? {}) as { accountId?: string; memberId?: string };
  const q: Record<string, unknown> = {};
  if (accountId && /^[a-f\d]{24}$/i.test(accountId)) q.accountId = new Types.ObjectId(accountId);
  if (memberId && /^[a-f\d]{24}$/i.test(memberId)) q.memberId = new Types.ObjectId(memberId);
  const items = await MemberIncome.find(q).lean();
  res.json(items);
});

/** POST /api/member-incomes */
r.post("/", validateBody(CreateMemberIncome), async (req, res) => {
  const b = (req as unknown as {
    data: {
      accountId: string;
      memberId: string;
      amountMinor: number;
      fromMonth?: string | null;
      toMonth?: string | null;
    };
  }).data;

  const doc: Record<string, unknown> = {
    accountId: new Types.ObjectId(b.accountId),
    memberId: new Types.ObjectId(b.memberId),
    amountMinor: b.amountMinor,
    fromMonth: b.fromMonth ? toMonthDate(b.fromMonth) : null,
    toMonth: b.toMonth ? toMonthDate(b.toMonth) : null,
  };

  const created = await MemberIncome.create(doc);

  // EVENT: memberIncome.added
  await Event.create({
    accountId: new Types.ObjectId(b.accountId),
    date: DateTime.utc().toJSDate(),
    code: "memberIncome.added",
    params: { memberId: b.memberId, amountMinor: b.amountMinor },
    createdByMemberId: new Types.ObjectId(b.memberId),
  });

  res.status(201).json(created);
});

/** PATCH /api/member-incomes/:id */
r.patch("/:id", validateBody(UpdateMemberIncome), async (req, res) => {
  const { id } = req.params;

  const u = (req as unknown as {
    data: Partial<{ amountMinor: number; fromMonth: string | null; toMonth: string | null }>;
  }).data;

  const existing = await MemberIncome.findById(id);
  if (!existing) return res.sendStatus(404);

  const patch: Record<string, unknown> = {};
  if (typeof u.amountMinor === "number") patch.amountMinor = u.amountMinor;
  if (u.fromMonth !== undefined) patch.fromMonth = u.fromMonth ? toMonthDate(u.fromMonth) : null;
  if (u.toMonth !== undefined) patch.toMonth = u.toMonth ? toMonthDate(u.toMonth) : null;

  const updated = await MemberIncome.findByIdAndUpdate(id, patch, { new: true });
  if (!updated) return res.sendStatus(404);

  // EVENT: memberIncome.updated
  await Event.create({
    accountId: updated.accountId as unknown as Types.ObjectId,
    date: DateTime.utc().toJSDate(),
    code: "memberIncome.updated",
    params: { memberId: String(updated.memberId), amountMinor: (updated as { amountMinor?: number }).amountMinor ?? 0 },
    createdByMemberId: updated.memberId as unknown as Types.ObjectId,
  });

  res.json(updated);
});

/** DELETE /api/member-incomes/:id */
r.delete("/:id", async (req, res) => {
  const { id } = req.params;

  // Vor dem Löschen laden (Variablen vorhanden halten!)
  const existing = await MemberIncome.findById(id);
  if (!existing) return res.sendStatus(404);

  await MemberIncome.deleteOne({ _id: id });

  // EVENT: memberIncome.removed
  await Event.create({
    accountId: existing.accountId as unknown as Types.ObjectId,
    date: DateTime.utc().toJSDate(),
    code: "memberIncome.removed",
    params: { memberId: String(existing.memberId) },
    createdByMemberId: existing.memberId as unknown as Types.ObjectId,
  });

  res.sendStatus(204);
});

export default r;
