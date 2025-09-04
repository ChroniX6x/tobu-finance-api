import { Router } from "express";
import { Types } from "mongoose";
import { DateTime } from "luxon";

import ContributionRule from "../models/ContributionRule.js";
import Event from "../models/Event.js";
import { toMonthDate } from "../lib/month.js";

// Falls vorhanden, Validierung anhängen (ansonsten diese zwei Imports + Middlewares entfernen)
import { validateBody } from "../middleware/validate.js";
import {
  CreateContributionRule,
  UpdateContributionRule,
} from "../validation/contribution-rules.js";

const r = Router();

/** GET /api/contribution-rules?accountId=...  (optional Filter) */
r.get("/", async (req, res) => {
  const { accountId } = (req.query ?? {}) as { accountId?: string };
  const q: Record<string, unknown> = {};
  if (accountId && /^[a-f\d]{24}$/i.test(accountId)) {
    q.accountId = new Types.ObjectId(accountId);
  }
  const items = await ContributionRule.find(q).lean();
  res.json(items);
});

/** POST /api/contribution-rules */
r.post("/", validateBody(CreateContributionRule), async (req, res) => {
  const b = (req as unknown as {
    data: {
      accountId: string;
      type: "base" | "additional" | "topup";
      amountCents: number;
      distribution: unknown;
      fromMonth?: string | null;
      toMonth?: string | null;
      createdByMemberId?: string | null;
    };
  }).data;

  const doc: Record<string, unknown> = {
    accountId: new Types.ObjectId(b.accountId),
    type: b.type,
    amountCents: b.amountCents,
    distribution: b.distribution,
    fromMonth: b.fromMonth ? toMonthDate(b.fromMonth) : null,
    toMonth: b.toMonth ? toMonthDate(b.toMonth) : null,
  };

  const created = await ContributionRule.create(doc);

  // EVENT: contributionRule.added
  await Event.create({
    accountId: new Types.ObjectId(b.accountId),
    date: DateTime.utc().toJSDate(),
    code: "contributionRule.added",
    params: { ruleId: String(created._id), ruleType: b.type, amountCents: b.amountCents },
    createdByMemberId: b.createdByMemberId ? new Types.ObjectId(b.createdByMemberId) : null,
  });

  res.status(201).json(created);
});

/** PATCH /api/contribution-rules/:id */
r.patch("/:id", validateBody(UpdateContributionRule), async (req, res) => {
  const { id } = req.params;
  const u = (req as unknown as {
    data: Partial<{
      type: "base" | "additional" | "topup";
      amountCents: number;
      distribution: unknown;
      fromMonth: string | null;
      toMonth: string | null;
      createdByMemberId: string | null;
    }>;
  }).data;

  const existing = await ContributionRule.findById(id);
  if (!existing) return res.sendStatus(404);

  const patch: Record<string, unknown> = {};
  if (u.type) patch.type = u.type;
  if (typeof u.amountCents === "number") patch.amountCents = u.amountCents;
  if (u.distribution !== undefined) patch.distribution = u.distribution;
  if (u.fromMonth !== undefined) patch.fromMonth = u.fromMonth ? toMonthDate(u.fromMonth) : null;
  if (u.toMonth !== undefined) patch.toMonth = u.toMonth ? toMonthDate(u.toMonth) : null;

  const updated = await ContributionRule.findByIdAndUpdate(id, patch, { new: true });
  if (!updated) return res.sendStatus(404);

  // EVENT: contributionRule.updated
  await Event.create({
    accountId: updated.accountId as unknown as Types.ObjectId,
    date: DateTime.utc().toJSDate(),
    code: "contributionRule.updated",
    params: {
      ruleId: String(updated._id),
      ruleType: (updated as { type: string }).type,
      amountCents: (updated as { amountCents?: number }).amountCents ?? 0,
    },
    createdByMemberId: u.createdByMemberId ? new Types.ObjectId(u.createdByMemberId) : null,
  });

  res.json(updated);
});

/** DELETE /api/contribution-rules/:id */
r.delete("/:id", async (req, res) => {
  const { id } = req.params;

  // Vor dem Löschen laden (für Event-Parameter)
  const existing = await ContributionRule.findById(id);
  if (!existing) return res.sendStatus(404);

  await ContributionRule.deleteOne({ _id: id });

  // EVENT: contributionRule.removed
  await Event.create({
    accountId: existing.accountId as unknown as Types.ObjectId,
    date: DateTime.utc().toJSDate(),
    code: "contributionRule.removed",
    params: { ruleId: String(existing._id), ruleType: (existing as { type: string }).type },
    createdByMemberId: null,
  });

  res.sendStatus(204);
});

export default r;
