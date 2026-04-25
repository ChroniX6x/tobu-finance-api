// src/routes/month-view.ts
import { Router } from "express";
import { Types } from "mongoose";
import { DateTime } from "luxon";
import { z } from "zod";

import Account from "../models/Account.js";
import Member from "../models/Member.js";
import Transaction from "../models/Transaction.js";
import Category from "../models/Category.js";
import CategoryBudget from "../models/CategoryBudget.js";
import MemberIncome from "../models/MemberIncome.js";
import CarryOver from "../models/CarryOver.js";
import ContributionRule from "../models/ContributionRule.js";

import { validateQuery } from "../middleware/validate.js";
import { monthRangeFromISO, toMonthAnchorISO } from "../utils/date.js";
import { incomeWeights, distribute, type Dist } from "../utils/contrib.js";

// ---- Validation ----
const QueryMonthView = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Invalid month format. Expected YYYY-MM")
    .optional(),
});

const r = Router();

/**
 * GET /api/accounts/:id/month-view?month=YYYY-MM
 *
 * Returns a fully-calculated read-model for a single month:
 *  - KPIs (totalDue, totalPaid, totalSpent, carryoverTotal)
 *  - Per-member contribution status
 *  - Category spend vs budget
 *  - Contribution breakdown per rule
 *  - Member incomes + weights
 *  - Carryovers
 *
 * Defaults to the current calendar month when `month` is omitted.
 */
r.get("/:id/month-view", validateQuery(QueryMonthView), async (req, res) => {
  const { id } = req.params;
  if (!/^[a-f\d]{24}$/i.test(id)) return res.status(400).json({ error: "INVALID_ID" });

  const account = await Account.findById(id).lean();
  if (!account) return res.sendStatus(404);

  const accountId = new Types.ObjectId(id);

  // Resolve target month
  const now = DateTime.utc();
  const monthParam: string | undefined = (req as any).q?.month;
  const targetMonthISO: string = monthParam
    ? toMonthAnchorISO(`${monthParam as string}-01`)
    : toMonthAnchorISO(now.toJSDate());

  const { start: monthStart, end: monthEnd } = monthRangeFromISO(targetMonthISO);

  // History: last 6 months including current month
  const HIST_MONTHS = 6;
  const histStart = DateTime.fromISO(targetMonthISO).minus({ months: HIST_MONTHS - 1 }).toJSDate();

  // Build member ID list and role map from the account document
  const memberRefs = (account.members ?? []) as Array<{ memberId: unknown; role?: "owner" | "member" }>;
  const memberIds: string[] = memberRefs.map((m) => String(m.memberId));
  const roleByMember: Record<string, "owner" | "member"> = {};
  for (const m of memberRefs) roleByMember[String(m.memberId)] = m.role ?? "member";

  // Fetch all required data in parallel
  const [memberDocs, ruleDocs, incomeDocs, txDocs, carryoverDocs, categoryDocs, budgetDocs, histTxDocs] =
    await Promise.all([
      // Member details (name + avatar)
      Member.find(
        { _id: { $in: memberIds.map((x) => new Types.ObjectId(x)) } },
        { name: 1, avatar: 1 }
      ).lean(),

      // Contribution rules active during this month
      ContributionRule.find({
        accountId,
        $and: [
          { $or: [{ fromMonth: null }, { fromMonth: { $lte: monthEnd } }] },
          { $or: [{ toMonth: null }, { toMonth: { $gte: monthStart } }] },
        ],
      }).lean(),

      // Member incomes active during this month
      MemberIncome.find(
        {
          accountId,
          $and: [
            { $or: [{ fromMonth: null }, { fromMonth: { $lte: monthEnd } }] },
            { $or: [{ toMonth: null }, { toMonth: { $gte: monthStart } }] },
          ],
        },
        { memberId: 1, amountMinor: 1 }
      ).lean(),

      // All transactions in this month (booked + pending)
      Transaction.find({
        accountId,
        month: { $gte: monthStart, $lt: monthEnd },
      }).lean(),

      // Carryovers recorded for this month
      CarryOver.find(
        { accountId, month: { $gte: monthStart, $lt: monthEnd } },
        { memberId: 1, amountMinor: 1, reason: 1 }
      ).lean(),

      // Categories for this account
      Category.find({ accountId }, { name: 1 }).lean(),

      // Category budgets active during this month
      CategoryBudget.find(
        {
          accountId,
          $and: [
            { $or: [{ fromMonth: null }, { fromMonth: { $lte: monthEnd } }] },
            { $or: [{ toMonth: null }, { toMonth: { $gte: monthStart } }] },
          ],
        },
        { categoryId: 1, amountMinor: 1 }
      ).lean(),

      // Expense transactions for the last HIST_MONTHS months (for category history chart)
      Transaction.find(
        {
          accountId,
          type: "expense",
          status: "booked",
          month: { $gte: histStart, $lt: monthEnd },
        },
        { month: 1, categoryId: 1, amountMinor: 1 }
      ).lean(),
    ]);

  // ---- Lookup maps ----
  const memberNameById: Record<string, string | null> = {};
  const memberAvatarById: Record<string, string | null> = {};
  for (const m of memberDocs) {
    memberNameById[String(m._id)] = (m as { name?: string | null }).name ?? null;
    memberAvatarById[String(m._id)] = (m as { avatar?: string | null }).avatar ?? null;
  }

  const catNameById: Record<string, string | null> = {};
  for (const c of categoryDocs) {
    catNameById[String(c._id)] = (c as { name?: string | null }).name ?? null;
  }

  const budgetByCat: Record<string, number> = {};
  for (const b of budgetDocs) {
    budgetByCat[String((b as { categoryId: unknown }).categoryId)] = Number(
      (b as { amountMinor?: number }).amountMinor ?? 0
    );
  }

  // Aggregate incomes per member (summing multiple income records)
  const incomeByMember: Record<string, number> = {};
  for (const inc of incomeDocs) {
    const k = String((inc as { memberId: unknown }).memberId);
    incomeByMember[k] = (incomeByMember[k] ?? 0) + Number((inc as { amountMinor?: number }).amountMinor ?? 0);
  }

  // ---- Contribution calculation ----
  const incWeights = incomeWeights(memberIds, incomeByMember);
  const weightByMember: Record<string, number> = {};
  for (const w of incWeights) weightByMember[w.memberId] = w.weight;

  const ensureDist = (rule: unknown): Dist => {
    const d = (
      rule as {
        distribution?: {
          mode?: string;
          memberId?: unknown;
          customSplit?: Array<{ memberId: unknown; split?: number }>;
        };
      }
    ).distribution ?? {};
    if (d.mode === "perMember") return { mode: "perMember", memberId: String(d.memberId ?? "") };
    if (d.mode === "customSplit") {
      return {
        mode: "customSplit",
        customSplit: (d.customSplit ?? []).map((s) => ({
          memberId: String(s.memberId ?? ""),
          split: Number(s.split ?? 0),
        })),
      };
    }
    return { mode: "proRataIncome" };
  };

  // Aggregate monthly due per member across all active rules
  const dueByMember: Record<string, number> = {};
  for (const rule of ruleDocs) {
    const amount = Number((rule as { amountMinor?: number }).amountMinor ?? 0);
    if (!amount) continue;
    const partial = distribute(amount, ensureDist(rule), memberIds, incWeights);
    for (const k of Object.keys(partial)) dueByMember[k] = (dueByMember[k] ?? 0) + (partial[k] ?? 0);
  }

  // ---- Transaction aggregation ----
  const paidByMember: Record<string, number> = {};
  const spentByCat: Record<string, number> = {};
  /** ISO string of most-recent booked income transaction per member */
  const lastPaymentDateByMember: Record<string, string> = {};
  /** Sum of private-advance (isFromSharedAccount=false) expense amounts per member */
  const privateAdvancesByMember: Record<string, number> = {};
  let totalPaidMinor = 0;
  let totalSpentMinor = 0;

  for (const tx of txDocs) {
    const t = tx as {
      type?: string;
      status?: string;
      amountMinor?: number;
      paidByMemberId?: unknown;
      categoryId?: unknown;
      bookDate?: Date | null;
      isFromSharedAccount?: boolean | null;
    };
    const amt = Number(t.amountMinor ?? 0);
    // Only booked transactions count towards KPIs and aggregations
    if (t.status !== "booked") continue;

    if (t.type === "income") {
      totalPaidMinor += amt;
      if (t.paidByMemberId) {
        const mid = String(t.paidByMemberId);
        paidByMember[mid] = (paidByMember[mid] ?? 0) + amt;
        // Track most recent payment date per member
        if (t.bookDate) {
          const iso = (t.bookDate instanceof Date ? t.bookDate : new Date(t.bookDate)).toISOString();
          if (!lastPaymentDateByMember[mid] || iso > lastPaymentDateByMember[mid]) {
            lastPaymentDateByMember[mid] = iso;
          }
        }
      }
    } else if (t.type === "expense") {
      totalSpentMinor += amt;
      if (t.categoryId) {
        const cid = String(t.categoryId);
        spentByCat[cid] = (spentByCat[cid] ?? 0) + amt;
      }
      // Track private advances: expenses paid out-of-pocket by a specific member
      if (t.isFromSharedAccount === false && t.paidByMemberId) {
        const mid = String(t.paidByMemberId);
        privateAdvancesByMember[mid] = (privateAdvancesByMember[mid] ?? 0) + amt;
      }
    }
  }

  // ---- Carryover aggregation ----
  const carryoverByMember: Record<string, number> = {};
  for (const co of carryoverDocs) {
    const mid = String((co as { memberId: unknown }).memberId);
    carryoverByMember[mid] = (carryoverByMember[mid] ?? 0) + Number((co as { amountMinor?: number }).amountMinor ?? 0);
  }
  const carryoverTotalMinor = Object.values(carryoverByMember).reduce((a, b) => a + b, 0);
  const totalDueMinor = Object.values(dueByMember).reduce((a, b) => a + b, 0);

  // ---- Build response objects ----

  const membersResult = memberIds.map((mid) => {
    const monthlyDue = dueByMember[mid] ?? 0;
    const paidAmount = paidByMember[mid] ?? 0;
    const carryoverAmt = carryoverByMember[mid] ?? 0;
    return {
      id: mid,
      name: memberNameById[mid] ?? null,
      avatar: memberAvatarById[mid] ?? null,
      role: roleByMember[mid] ?? "member",
      monthlyDueMinor: monthlyDue,
      paidAmountMinor: paidAmount,
      openAmountMinor: Math.max(0, monthlyDue - paidAmount),
      paid: monthlyDue > 0 && paidAmount >= monthlyDue,
      carryoverMinor: carryoverAmt,
      lastPaymentDate: lastPaymentDateByMember[mid] ?? null,
      privateAdvancesMinor: privateAdvancesByMember[mid] ?? 0,
    };
  });

  // All category IDs with spend or a defined budget for this month
  const allCatIds = new Set([...Object.keys(spentByCat), ...Object.keys(budgetByCat)]);
  const categoriesResult = Array.from(allCatIds)
    .map((cid) => {
      const spent = spentByCat[cid] ?? 0;
      const budget = budgetByCat[cid] ?? null;
      const status: "ok" | "over" | "no_budget" =
        budget === null ? "no_budget" : spent > budget ? "over" : "ok";
      return { id: cid, name: catNameById[cid] ?? null, spentMinor: spent, budgetMinor: budget, status };
    })
    .sort((a, b) => b.spentMinor - a.spentMinor);

  const contributionBreakdown = ruleDocs.map((rule) => {
    const r0 = rule as {
      _id: unknown;
      description?: string | null;
      type?: string;
      amountMinor?: number;
      distribution?: { mode?: string; memberId?: unknown; customSplit?: Array<{ memberId: unknown; split?: number }> };
    };
    const amount = Number(r0.amountMinor ?? 0);
    const dist = ensureDist(rule);
    const perMember = amount ? distribute(amount, dist, memberIds, incWeights) : {};
    return {
      ruleId: String(r0._id),
      description: r0.description ?? null,
      type: r0.type ?? "base",
      amountMinor: amount,
      distributionMode: r0.distribution?.mode ?? "proRataIncome",
      perMember,
    };
  });

  const memberIncomesResult = Object.entries(incomeByMember).map(([memberId, amountMinor]) => ({
    memberId,
    amountMinor,
    weight: weightByMember[memberId] ?? 0,
  }));

  const carryoversResult = carryoverDocs.map((co) => ({
    memberId: String((co as { memberId: unknown }).memberId),
    amountMinor: Number((co as { amountMinor?: number }).amountMinor ?? 0),
    reason: (co as { reason?: string }).reason ?? "",
  }));

  // ---- Category history aggregation (last HIST_MONTHS months) ----
  const spentByCatByMonth: Record<string, Record<string, number>> = {};
  for (const tx of histTxDocs) {
    const t = tx as { month?: unknown; categoryId?: unknown; amountMinor?: number };
    if (!t.month || !t.categoryId) continue;
    const rawDate = t.month instanceof Date ? t.month : new Date(String(t.month));
    const monthKey = DateTime.fromJSDate(rawDate).toFormat("yyyy-MM");
    const catId = String(t.categoryId);
    if (!spentByCatByMonth[monthKey]) spentByCatByMonth[monthKey] = {};
    (spentByCatByMonth[monthKey] as Record<string, number>)[catId] =
      ((spentByCatByMonth[monthKey] as Record<string, number>)[catId] ?? 0) + Number(t.amountMinor ?? 0);
  }
  const categoryHistory = Array.from({ length: HIST_MONTHS }, (_, i) => {
    const m = DateTime.fromISO(targetMonthISO)
      .minus({ months: HIST_MONTHS - 1 - i })
      .toFormat("yyyy-MM");
    return { month: m, spentByCategoryId: (spentByCatByMonth[m] ?? {}) as Record<string, number> };
  });

  // Resolve display month label (YYYY-MM)
  const resolvedMonthLabel = monthParam ?? now.set({ day: 1 }).toFormat("yyyy-MM");

  res.json({
    account: {
      id: String(accountId),
      name: (account as { name?: string | null }).name ?? null,
      monthIso: resolvedMonthLabel,
    },
    kpis: {
      totalDueMinor,
      totalPaidMinor,
      totalSpentMinor,
      carryoverTotalMinor,
    },
    members: membersResult,
    categories: categoriesResult,
    contributionBreakdown,
    memberIncomes: memberIncomesResult,
    carryovers: carryoversResult,
    categoryHistory,
  });
});

export default r;
