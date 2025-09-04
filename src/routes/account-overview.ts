import { Router } from "express";
import { Types } from "mongoose";
import { DateTime } from "luxon";

import Account from "../models/Account.js";
import Member from "../models/Member.js";
import Transaction from "../models/Transaction.js";
import AccountBalance from "../models/AccountBalance.js";
import Category from "../models/Category.js";
import CategoryBudget from "../models/CategoryBudget.js";
import MemberIncome from "../models/MemberIncome.js";
import CarryOver from "../models/CarryOver.js";
import ContributionRule from "../models/ContributionRule.js";
import Event from "../models/Event.js";

import { toMonthAnchorISO, monthRangeFromISO, lastNMonthAnchorsISO, forwardFill } from "../utils/date.js";
import { round1, linRegForecastNext } from "../utils/math.js";
import { incomeWeights, distribute, type Dist } from "../utils/contrib.js";
import { buildInsights } from "../services/insights.js";
import { renderEventText } from "../utils/renderEvent.js";

const r = Router();

r.get("/:id/overview", async (req, res) => {
  const { id } = req.params;
  if (!/^[a-f\d]{24}$/i.test(id)) return res.status(400).json({ error: "INVALID_ID" });

  const account = await Account.findById(id).lean();
  if (!account) return res.sendStatus(404);

  const accountId = new Types.ObjectId(id);
  const historyMonths = account.settings?.dashboard?.historyMonths ?? 6;
  const topK = account.settings?.dashboard?.topKCategories ?? 5;
  const lowForecast = account.settings?.alerts?.lowBalanceForecastCents ?? 100_000;
  const carryoverLarge = account.settings?.alerts?.carryoverLargeCents ?? 10_000;

  // current month (ISO Monatsanker via Luxon)
  const now = DateTime.utc();
  const currentMonthISO = now.set({ day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 }).toISO({ suppressMilliseconds: false }) as string;
  const { start: curStart, end: curEnd } = monthRangeFromISO(currentMonthISO);

  // Mitglieder
  const memberIds = (account.members ?? []).map((m: unknown) => {
    const mm = m as { memberId: unknown };
    return String(mm.memberId as unknown as string);
  });
  const roleByMember: Record<string, "owner" | "member" | undefined> = {};
  for (const m of account.members ?? []) {
    const mm = m as { memberId: unknown; role?: "owner" | "member" };
    roleByMember[String(mm.memberId as string)] = mm.role ?? "member";
  }

  const memberDocs = await Member.find({ _id: { $in: memberIds.map((x) => new Types.ObjectId(x)) } })
    .select({ name: 1, avatar: 1 })
    .lean();
  const memberNameById: Record<string, string | null> = {};
  const memberAvatarById: Record<string, string | null> = {};
  for (const m of memberDocs) {
    memberNameById[String(m._id)] = (m as { name?: string | null }).name ?? null;
    memberAvatarById[String(m._id)] = (m as { avatar?: string | null }).avatar ?? null;
  }

  // History Labels
  const labelsISO = lastNMonthAnchorsISO(historyMonths, now.toJSDate());
  const firstISO = labelsISO[0];
  const lastISO = labelsISO[labelsISO.length - 1];

  // Balances
  const balances = await AccountBalance.find({
    accountId,
    month: { $gte: new Date(firstISO), $lt: monthRangeFromISO(lastISO).end },
  })
    .select({ month: 1, closingBalanceCents: 1 })
    .lean();

  const byISO: Record<string, number | undefined> = {};
  for (const b of balances) {
    const iso = toMonthAnchorISO((b as { month: Date }).month);
    byISO[iso] = Number((b as { closingBalanceCents?: number }).closingBalanceCents ?? 0);
  }

  const historyData = forwardFill(labelsISO, byISO);
  const currentBalance = historyData[historyData.length - 1] ?? 0;
  const prevBalance = historyData.length > 1 ? historyData[historyData.length - 2] : 0;
  const balanceChangePct = prevBalance ? round1(((currentBalance - prevBalance) / prevBalance) * 100) : 0;
  const forecast = linRegForecastNext(historyData);

  // Income vs Expense (booked, current month)
  const txAgg = await Transaction.aggregate([
    { $match: { accountId, month: { $gte: curStart, $lt: curEnd }, status: "booked" } },
    { $group: { _id: "$type", sum: { $sum: "$amountCents" } } },
  ]);
  const sumByType: Record<string, number> = {};
  for (const g of txAgg as Array<{ _id: string; sum?: number }>) sumByType[g._id] = g.sum ?? 0;
  const incomeSum = sumByType["income"] ?? 0;
  const expenseSum = sumByType["expense"] ?? 0;

  // Top categories (booked expenses in current month)
  const topAgg = await Transaction.aggregate([
    { $match: { accountId, month: { $gte: curStart, $lt: curEnd }, status: "booked", type: "expense", categoryId: { $ne: null } } },
    { $group: { _id: "$categoryId", sum: { $sum: "$amountCents" } } },
    { $sort: { sum: -1 } },
    { $limit: topK },
  ]);
  const catIds = (topAgg as Array<{ _id: unknown }>).map((x) => x._id);
  const cats = await Category.find({ _id: { $in: catIds } }).select({ name: 1 }).lean();
  const catNameById: Record<string, string | null> = {};
  for (const c of cats) catNameById[String(c._id)] = (c as { name?: string | null }).name ?? null;
  const topCategories = (topAgg as Array<{ _id: unknown; sum?: number }>).map((x) => ({
    name: catNameById[String(x._id)] ?? null,
    sum: x.sum ?? 0,
  }));

  // Pending recurring (current month)
  const pendingRecurringCount = await Transaction.countDocuments({
    accountId,
    month: { $gte: curStart, $lt: curEnd },
    status: "pending",
    recurrenceId: { $ne: null },
  });

  // Contribution rules active this month
  const rules = await ContributionRule.find({
    accountId,
    $and: [
      { $or: [{ fromMonth: null }, { fromMonth: { $lte: curEnd } }] },
      { $or: [{ toMonth: null }, { toMonth: { $gte: curStart } }] },
    ],
  }).lean();

  const addRules = (rules as Array<{ type?: string; amountCents?: number }>).filter((r) => r.type === "additional");
  const topupRules = (rules as Array<{ type?: string; amountCents?: number }>).filter((r) => r.type === "topup");
  const extraContribCount = addRules.length + topupRules.length;
  const extraContribSumCents =
    addRules.reduce((a, r) => a + (r.amountCents ?? 0), 0) +
    topupRules.reduce((a, r) => a + (r.amountCents ?? 0), 0);

  // Incomes active in current month (for proRataIncome)
  const incomes = await MemberIncome.find({
    accountId,
    $and: [
      { $or: [{ fromMonth: null }, { fromMonth: { $lte: curEnd } }] },
      { $or: [{ toMonth: null }, { toMonth: { $gte: curStart } }] },
    ],
  })
    .select({ memberId: 1, amountCents: 1 })
    .lean();

  const incomeByMember: Record<string, number> = {};
  for (const m of incomes) {
    const k = String((m as { memberId: unknown }).memberId);
    const amt = Number((m as { amountCents?: number }).amountCents ?? 0);
    incomeByMember[k] = (incomeByMember[k] ?? 0) + amt;
  }

  const incWeights = incomeWeights(memberIds, incomeByMember);

  // monthlyDue per member
  const ensureDist = (r: unknown): Dist => {
    const d = (r as { distribution?: { mode?: string; memberId?: unknown; customSplit?: Array<{ memberId: unknown; split?: number }> } }).distribution ?? {};
    if (d.mode === "perMember") return { mode: "perMember", memberId: String(d.memberId ?? "") };
    if (d.mode === "customSplit") {
      const cs = (d.customSplit ?? []).map((s) => ({ memberId: String(s.memberId ?? ""), split: Number(s.split ?? 0) }));
      return { mode: "customSplit", customSplit: cs };
    }
    return { mode: "proRataIncome" };
  };
  const addTo = (dst: Record<string, number>, partial: Record<string, number>): void => {
    for (const k of Object.keys(partial)) dst[k] = (dst[k] ?? 0) + partial[k];
  };

  const dueByMember: Record<string, number> = {};
  for (const r0 of rules) {
    const amount = Number((r0 as { amountCents?: number }).amountCents ?? 0);
    if (!amount) continue;
    const part = distribute(amount, ensureDist(r0), memberIds, incWeights);
    addTo(dueByMember, part);
  }

  // paidAmount (booked income tx in current month)
  const paidAgg = await Transaction.aggregate([
    { $match: { accountId, month: { $gte: curStart, $lt: curEnd }, status: "booked", type: "income", paidByMemberId: { $ne: null } } },
    { $group: { _id: "$paidByMemberId", sum: { $sum: "$amountCents" } } },
  ]);
  const paidByMember: Record<string, number> = {};
  for (const x of paidAgg as Array<{ _id: unknown; sum?: number }>) paidByMember[String(x._id)] = x.sum ?? 0;

  const members = memberIds.map((mid) => {
    const monthlyDue = dueByMember[mid] ?? 0;
    const paidAmount = paidByMember[mid] ?? 0;
    return {
      id: mid,
      name: memberNameById[mid] ?? null,
      role: roleByMember[mid],
      avatar: memberAvatarById[mid] ?? null,
      monthlyDue,
      paidAmount,
      paid: paidAmount >= monthlyDue,
    };
  });

  // budgets check
  const expensesByCat = await Transaction.aggregate([
    { $match: { accountId, month: { $gte: curStart, $lt: curEnd }, status: "booked", type: "expense", categoryId: { $ne: null } } },
    { $group: { _id: "$categoryId", sum: { $sum: "$amountCents" } } },
  ]);
  const budgets = await CategoryBudget.find({
    accountId,
    $and: [
      { $or: [{ fromMonth: null }, { fromMonth: { $lte: curEnd } }] },
      { $or: [{ toMonth: null }, { toMonth: { $gte: curStart } }] },
    ],
  }).select({ categoryId: 1, amountCents: 1 }).lean();

  const budgetByCat: Record<string, number | undefined> = {};
  for (const b of budgets) budgetByCat[String((b as { categoryId: unknown }).categoryId)] = Number((b as { amountCents?: number }).amountCents ?? 0);

  const overBudget: Array<{ categoryId: string; categoryName: string | null; actualCents: number; budgetCents: number }> = [];
  const missingBudget: Array<{ categoryId: string; categoryName: string | null; actualCents: number }> = [];

  for (const e of expensesByCat as Array<{ _id: unknown; sum?: number }>) {
    const catId = String(e._id);
    const spent = e.sum ?? 0;
    const budget = budgetByCat[catId];
    const catName = catNameById[catId] ?? null;
    if (typeof budget !== "number") {
      missingBudget.push({ categoryId: catId, categoryName: catName, actualCents: spent });
    } else if (spent > budget) {
      overBudget.push({ categoryId: catId, categoryName: catName, actualCents: spent, budgetCents: budget });
    }
  }

  // carryovers (current month)
  const carryovers = await CarryOver.find({ accountId, month: { $gte: curStart, $lt: curEnd } })
    .select({ memberId: 1, amountCents: 1 })
    .lean();

  // insights
  const openDues = members.filter((m) => !m.paid).map((m) => ({ memberId: m.id, monthlyDueCents: m.monthlyDue, paidAmountCents: m.paidAmount }));
  const insights = buildInsights({
    accountId: String(accountId),
    currentMonthISO,
    pendingRecurringCount,
    extraContribCount,
    extraContribSumCents,
    forecastCents: forecast,
    thresholdForecastCents: lowForecast,
    carryovers: (carryovers as Array<{ memberId?: unknown; amountCents?: number }>).map((c) => ({
      memberId: c.memberId ? String(c.memberId) : null,
      amountCents: Number(c.amountCents ?? 0),
    })),
    carryoverLargeCents: carryoverLarge,
    overBudget,
    missingBudget,
    openDues,
  });

  // timeline (letzte 20)
  const events = await Event.find({ accountId }).sort({ date: -1 }).limit(20).lean();
  const timeline = events.map((ev) => {
    const createdByMemberId = (ev as { createdByMemberId?: unknown }).createdByMemberId;
    return {
      id: String((ev as { _id: unknown })._id),
      date: DateTime.fromJSDate((ev as { date: Date }).date).toUTC().toISO({ suppressMilliseconds: false }) as string,
      user: createdByMemberId ? (memberNameById[String(createdByMemberId)] ?? null) : null,
      text: renderEventText((ev as { code: string }).code, (ev as { params?: Record<string, unknown> }).params ?? {}),
    };
  });

  res.json({
    account: {
      id: String(accountId),
      name: (account as { name?: string | null }).name ?? null,
      currentMonth: currentMonthISO,
      currentBalance,
      balanceChangePct,
      forecast,
      warning: forecast < lowForecast ? "Forecast unter Schwellenwert" : null,
    },
    members,
    quickStats: {
      openDuesCount: openDues.length,
      pendingRecurringCount,
      extraContributionsCount: extraContribCount,
      extraContributionsSum: extraContribSumCents,
      warningsCount: insights.filter((i) => i.kind === "warning" || i.kind === "critical").length,
    },
    charts: {
      history: { labels: labelsISO, data: historyData },
      incomeVsExpense: { income: incomeSum, expense: expenseSum },
      topCategories,
    },
    insights,
    timeline,
  });
});

export default r;
