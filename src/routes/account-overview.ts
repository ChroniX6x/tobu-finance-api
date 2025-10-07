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

import { monthRangeFromISO, lastNMonthAnchorsISO } from "../utils/date.js"; // kannst du lassen, wird noch benutzt
import { round1, linRegForecastNext } from "../utils/math.js";
import { incomeWeights, distribute, type Dist } from "../utils/contrib.js";
import { buildInsights } from "../services/insights.js";
import { renderEventText } from "../utils/renderEvent.js";
import {
  computeReliableBalanceBlock,
  buildCarriedSeries,
  computeStalenessDays,
  type BalanceSnapshot,
} from "../utils/reliableBalance.js";

const r = Router();

/** GET /api/accounts/:id/overview */
r.get("/:id/overview", async (req, res) => {
  const { id } = req.params;
  if (!/^[a-f\d]{24}$/i.test(id)) return res.status(400).json({ error: "INVALID_ID" });

  const account = await Account.findById(id).lean();
  if (!account) return res.sendStatus(404);

  const accountId = new Types.ObjectId(id);

  // Settings
  const historyMonths = account.settings?.dashboard?.historyMonths ?? 6;
  const topK = account.settings?.dashboard?.topKCategories ?? 5;
  const lowForecast = account.settings?.alerts?.lowBalanceForecastCents ?? 100_000;
  const carryoverLarge = account.settings?.alerts?.carryoverLargeCents ?? 10_000;
  const staleDaysThreshold = (account as { settings?: { alerts?: { staleDaysThreshold?: number } } })?.settings?.alerts?.staleDaysThreshold ?? 30;

  // current month ISO (Monatsanker)
  const now = DateTime.utc();
  const currentMonthISO = now.set({ day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 }).toISO({ suppressMilliseconds: false }) as string;
  const { start: curStart, end: curEnd } = monthRangeFromISO(currentMonthISO);

  // --- Mitglieder-Basisdaten ---
  const memberIds = (account.members ?? []).map((m: unknown) => String((m as { memberId: unknown }).memberId));
  const roleByMember: Record<string, "owner" | "member" | undefined> = {};
  for (const m of account.members ?? []) {
    roleByMember[String((m as { memberId: unknown }).memberId)] = (m as { role?: "owner" | "member" }).role ?? "member";
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

  // --- Balance Snapshots (ECHT, unsortiert->sortiert ASC) ---
  const sinceIso = DateTime.utc().minus({ months: Math.max(24, historyMonths + 2) }).set({ day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 });
  const balancesRaw = await AccountBalance.find({
    accountId,
    month: { $gte: sinceIso.toJSDate() },
  })
    .select({ month: 1, closingBalanceCents: 1 })
    .lean();

  const snapshotsAsc: BalanceSnapshot[] = (balancesRaw as Array<{ month: Date; closingBalanceCents?: number }>)
    .map((b) => ({ month: b.month, valueMinor: Number(b.closingBalanceCents ?? 0) }))
    .sort((a, b) => a.month.getTime() - b.month.getTime());

  // Zuverlässiger Balance-Block + Change %
  const rb = computeReliableBalanceBlock(snapshotsAsc);

  // Staleness
  // lastTransactionDate: max(bookDate, createdAt) über alle Transaktionen des Accounts
  const lastTxAgg = await Transaction.aggregate([
    { $match: { accountId } },
    {
      $project: {
        refDate: {
          $cond: [
            { $ifNull: ["$bookDate", false] },
            "$bookDate",
            "$createdAt",
          ],
        },
      },
    },
    { $sort: { refDate: -1 } },
    { $limit: 1 },
  ]);
  const lastTransactionDate: Date | null = (lastTxAgg[0]?.refDate as Date | undefined) ?? null;

  const rbMonthDate = DateTime.fromISO(rb.currentMonthIso, { zone: "utc" }).toJSDate();
  const { stalenessDays, isStale } = computeStalenessDays(rbMonthDate, lastTransactionDate, staleDaysThreshold);

  // --- Chart (carry-forward) ---
  const carried = buildCarriedSeries(snapshotsAsc, historyMonths, now.toJSDate());
  const forecast = linRegForecastNext(carried.dataMinor); // Forecast über die (carry-forward) Serie

  // --- Income vs Expense (booked im aktuellen Monat) ---
  const txAgg = await Transaction.aggregate([
    { $match: { accountId, month: { $gte: curStart, $lt: curEnd }, status: "booked" } },
    { $group: { _id: "$type", sum: { $sum: "$amountCents" } } },
  ]);
  const sumByType: Record<string, number> = {};
  for (const g of txAgg as Array<{ _id: string; sum?: number }>) sumByType[g._id] = g.sum ?? 0;
  const incomeSum = sumByType["income"] ?? 0;
  const expenseSum = sumByType["expense"] ?? 0;

  // --- Top-Kategorien (Expenses, booked im aktuellen Monat) ---
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

  // --- Pending recurring ---
  const pendingRecurringCount = await Transaction.countDocuments({
    accountId,
    month: { $gte: curStart, $lt: curEnd },
    status: "pending",
    recurrenceId: { $ne: null },
  });

  // --- Contribution Rules aktiv in M ---
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

  // --- Incomes aktiv in M (proRataIncome) ---
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

  // --- monthlyDue per member (Rules verteilen) ---
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

  // --- paidAmount (booked Income in M) ---
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

  // --- Budget Checks (nur für Insights) ---
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

  // --- Carryovers (in M) ---
  const carryovers = await CarryOver.find({ accountId, month: { $gte: curStart, $lt: curEnd } })
    .select({ memberId: 1, amountCents: 1 })
    .lean();

  // --- Insights (on-the-fly) ---
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

  // --- Timeline (letzte 20) ---
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

  // --- Response ---
  res.json({
    // NEU – zuverlässiger Block
    account: {
      id: String(accountId),
      name: (account as { name?: string | null }).name ?? null,

      currentBalanceMinor: rb.currentBalanceMinor,
      currentMonthIso: rb.currentMonthIso,
      balanceChangePct: rb.balanceChangePct,
      stalenessDays,
      isStale,

      // legacy Felder (kompatibel lassen, falls UI die noch nutzt)
      currentMonth: rb.currentMonthIso,                                     // vorher "YYYY-MM-01T..." – bleibt ISO
      currentBalance: rb.currentBalanceMinor,                                // Achtung: bisher evtl. in Cents? -> hier bewusst gleich gelassen
      forecast,                                                              // in Cents (Minor)
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
      history: {
        labels: carried.labelsIso,              // ISO
        data: carried.dataMinor,                // Minor (Cents)
        carried: carried.carried,               // boolean[]
      },
      incomeVsExpense: { income: incomeSum, expense: expenseSum }, // Minor
      topCategories,
    },

    insights,
    timeline,
  });
});

export default r;
