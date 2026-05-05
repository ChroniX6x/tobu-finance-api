import { Router } from "express";
import { Types } from "mongoose";
import Account from "../models/Account.js";
import Category from "../models/Category.js";
import Transaction from "../models/Transaction.js";
import Member from "../models/Member.js";
import MemberIncome from "../models/MemberIncome.js";
import CarryOver from "../models/CarryOver.js";
import AccountBalance from "../models/AccountBalance.js";
import CategoryBudget from "../models/CategoryBudget.js";
import Recurrence from "../models/Recurrence.js";

import { validateBody, validateQuery } from "../middleware/validate.js";
import {
  QueryAccounts,
  CreateAccount,
  UpdateAccount,
  QueryAccountExpanded,
  AddMemberToAccount,
} from "../validation/accounts.js";
import ContributionRule from "../models/ContributionRule.js";

import { DateTime } from "luxon";
import Event from "../models/Event.js";

const r = Router();

const monthToRange = (m: string) => {
  // inclusive start (1st of month 00:00Z), exclusive end (1st of next month 00:00Z)
  const [y, mo] = m.split("-").map(Number);
  const start = new Date(Date.UTC(y, mo - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(mo === 12 ? y + 1 : y, mo === 12 ? 0 : mo, 1, 0, 0, 0, 0));
  return { start, end };
};

/** GET /api/accounts?memberId=... (optional) */
r.get("/", validateQuery(QueryAccounts), async (req, res) => {
  const { memberId } = (req as any).q as { memberId?: string };
  const q: any = {};
  if (memberId) q["members.memberId"] = new Types.ObjectId(memberId);
  const items = await Account.find(q).lean();
  res.json(items);
});

/** GET /api/accounts/:id -> single account by id */
r.get("/:id", async (req, res) => {
  const { id } = req.params;
  if (!/^[a-f\d]{24}$/i.test(id)) return res.status(400).json({ error: "INVALID_ID" });
  const acc = await Account.findById(id).lean();
  if (!acc) return res.sendStatus(404);
  res.json(acc);
});

/** GET /api/accounts/:id/expanded?include=...&from=YYYY-MM&to=YYYY-MM&status=booked|pending */
r.get("/:id/expanded", validateQuery(QueryAccountExpanded), async (req, res) => {
  const { id } = req.params;
  if (!/^[a-f\d]{24}$/i.test(id)) return res.status(400).json({ error: "INVALID_ID" });
  const inc: string[] = ((req as any).q?.include ?? []) as string[];
  const from: string | undefined = (req as any).q?.from;
  const to: string | undefined = (req as any).q?.to;
  const status: "booked" | "pending" | undefined = (req as any).q?.status;

  const acc = await Account.findById(id).lean();
  if (!acc) return res.sendStatus(404);

  // common range filter
  const range =
    from && to
      ? (() => {
          const a = monthToRange(from);
          const b = monthToRange(to);
          return { start: a.start, end: b.end };
        })()
      : undefined;

  const accountId = new Types.ObjectId(id);

  // Build promises per include
  const tasks: Record<string, Promise<any>> = {};

  if (inc.includes("members")) {
    // resolve member documents used in account.members
    const memberIds = (acc.members ?? []).map((m: any) => new Types.ObjectId(m.memberId));
    tasks.members = Member.find({ _id: { $in: memberIds } }).lean();
  }
  if (inc.includes("categories")) {
    tasks.categories = Category.find({ accountId }).lean();
  }
  if (inc.includes("transactions")) {
    const tq: any = { accountId };
    if (status) tq.status = status;
    if (range) {
      // "month" stored as Date (1st of month) – filter by range
      tq.month = { $gte: range.start, $lt: range.end };
    }
    tasks.transactions = Transaction.find(tq).lean();
  }
  if (inc.includes("memberIncomes")) {
    const iq: any = { accountId };
    if (range) {
      // income active on intersection with [from,to)
      // (fromMonth/toMonth may be null -> treat as open range)
      iq.$or = [
        { fromMonth: { $lte: range.end }, toMonth: { $gte: range.start } },
        { fromMonth: { $lte: range.end }, toMonth: null },
        { fromMonth: null, toMonth: { $gte: range.start } },
        { fromMonth: null, toMonth: null },
      ];
    }
    tasks.memberIncomes = MemberIncome.find(iq).lean();
  }
  if (inc.includes("carryovers")) {
    const cq: any = { accountId };
    if (range) cq.month = { $gte: range.start, $lt: range.end };
    tasks.carryovers = CarryOver.find(cq).lean();
  }
  if (inc.includes("accountBalances")) {
    const bq: any = { accountId };
    if (range) bq.month = { $gte: range.start, $lt: range.end };
    tasks.accountBalances = AccountBalance.find(bq).lean();
  }
  if (inc.includes("categoryBudgets")) {
    const bq: any = { accountId };
    if (range) {
      // budgets valid within range
      bq.$or = [
        { fromMonth: { $lte: range.end }, toMonth: { $gte: range.start } },
        { fromMonth: { $lte: range.end }, toMonth: null },
        { fromMonth: null, toMonth: { $gte: range.start } },
        { fromMonth: null, toMonth: null },
      ];
    }
    tasks.categoryBudgets = CategoryBudget.find(bq).lean();
  }
  if (inc.includes("recurrences")) {
    const rq: any = { accountId };
    if (range) {
      // any recurrence with active range overlapping [from,to)
      rq.$or = [
        { activeFrom: { $lte: range.end }, activeUntil: { $gte: range.start } },
        { activeFrom: { $lte: range.end }, activeUntil: null },
      ];
    }
    tasks.recurrences = Recurrence.find(rq).lean();
  }

  const results = await Promise.all(Object.values(tasks));
  const keys = Object.keys(tasks);

  const expanded: any = { account: acc };
  keys.forEach((k, i) => (expanded[k] = results[i]));

  res.json(expanded);
});

/** POST /api/accounts { name, currency?, members?: [{memberId, role?}] } */
r.post("/", validateBody(CreateAccount), async (req, res) => {
  const b = (req as any).data;
  const members = Array.isArray(b.members)
    ? b.members.map((m: any) => ({
        memberId: new Types.ObjectId(m.memberId),
        role: m.role ?? "member",
      }))
    : [];
  const created = await Account.create({
    name: b.name ?? null,
    currency: b.currency ?? "EUR",
    members,
    settings: b.settings ?? { monthGranularity: "YYYY-MM" },
  });
  res.status(201).json(created);
});

/** PATCH /api/accounts/:id */
r.patch("/:id", validateBody(UpdateAccount), async (req, res) => {
  const { id } = req.params;
  const u: any = { ...(req as any).data };
  if (Array.isArray(u.members)) {
    u.members = u.members.map((m: any) => ({
      memberId: new Types.ObjectId(m.memberId),
      role: m.role ?? "member",
    }));
    // Guard: ensure at least one owner remains after the update
    const ownerCount = u.members.filter((m: any) => m.role === "owner").length;
    if (ownerCount === 0) {
      return res.status(409).json({ error: "NO_OWNER", message: "Das members-Array muss mindestens einen Owner enthalten." });
    }
  }
  const updated = await Account.findByIdAndUpdate(id, u, { new: true });
  if (!updated) return res.sendStatus(404);
  res.json(updated);
});

/** POST /api/accounts/:id/members  { memberId, role } -> add/update role */
r.post("/:id/members", validateBody(AddMemberToAccount), async (req, res) => {
  const { id } = req.params;
  const { memberId, role } = (req as any).data as { memberId: string; role: string };

  const mId = new Types.ObjectId(memberId);
  const acc = await Account.findById(id);
  if (!acc) return res.sendStatus(404);
  const idx = acc.members.findIndex((x: any) => String(x.memberId) === String(mId));
  if (idx >= 0) acc.members[idx].role = role ?? acc.members[idx].role ?? "member";
  else acc.members.push({ memberId: mId, role: role ?? "member" });
  await acc.save();

  await Event.create({
    accountId: acc._id,
    date: DateTime.utc().toJSDate(),
    code: "account.member.added",
    params: { memberId: mId.toString() },
    createdByMemberId: mId,
  });

  res.json(acc);
});

/** DELETE /api/accounts/:id/members/:memberId */
r.delete("/:id/members/:memberId", async (req, res) => {
  const { id, memberId } = req.params;
  if (!/^[a-f\d]{24}$/i.test(memberId ?? "")) return res.status(400).json({ error: "INVALID_MEMBER_ID" });

  const mId = new Types.ObjectId(memberId);
  const accId = new Types.ObjectId(id);

  // Guard: check the account exists and the member is in it
  const acc = await Account.findById(accId).lean();
  if (!acc) return res.sendStatus(404);

  const accountMembers: any[] = (acc as any).members ?? [];
  const memberEntry = accountMembers.find((m) => String(m.memberId) === String(mId));
  if (!memberEntry) return res.status(404).json({ error: "MEMBER_NOT_IN_ACCOUNT" });

  // Guard: last owner
  const owners = accountMembers.filter((m) => m.role === "owner");
  if (memberEntry.role === "owner" && owners.length === 1) {
    return res.status(409).json({ error: "LAST_OWNER", message: "Der letzte Owner kann nicht entfernt werden." });
  }

  // Guard: last member
  if (accountMembers.length === 1) {
    return res.status(409).json({ error: "LAST_MEMBER", message: "Das letzte Mitglied kann nicht entfernt werden." });
  }

  // Guard: member still referenced
  const [txRef, catRef, ruleRef, miRef, coRef] = await Promise.all([
    Transaction.exists({ accountId: accId, paidByMemberId: mId }),
    Category.exists({ accountId: accId, "customSplit.memberId": mId }),
    ContributionRule.exists({
      accountId: accId,
      $or: [{ "distribution.memberId": mId }, { "distribution.customSplit.memberId": mId }],
    }),
    MemberIncome.exists({ accountId: accId, memberId: mId }),
    CarryOver.exists({ accountId: accId, memberId: mId }),
  ]);

  const blockers: string[] = [];
  if (txRef) blockers.push("Wird als Zahler in Buchungen verwendet");
  if (catRef) blockers.push("Wird in einer Kategorieverteilung verwendet");
  if (ruleRef) blockers.push("Wird in Beitragsregeln verwendet");
  if (miRef) blockers.push("Hat Einkommensdaten");
  if (coRef) blockers.push("Hat Übertragseinträge");

  if (blockers.length > 0) {
    return res.status(409).json({ error: "MEMBER_REFERENCED", usageHints: blockers });
  }

  const updated = await Account.findByIdAndUpdate(
    id,
    { $pull: { members: { memberId: mId } } },
    { new: true }
  );
  if (!updated) return res.sendStatus(404);

  await Event.create({
    accountId: updated._id,
    date: DateTime.utc().toJSDate(),
    code: "account.member.removed",
    params: { memberId: mId.toString() },
    createdByMemberId: mId,
  });

  res.json(updated);
});

export default r;
