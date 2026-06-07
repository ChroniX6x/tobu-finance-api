// src/routes/planning.ts
import { Router } from "express";
import { Types } from "mongoose";
import { DateTime } from "luxon";
import { z } from "zod";

import Account from "../models/Account.js";
import Member from "../models/Member.js";
import Category from "../models/Category.js";
import CategoryBudget from "../models/CategoryBudget.js";
import MemberIncome from "../models/MemberIncome.js";
import ContributionRule from "../models/ContributionRule.js";

import { validateQuery } from "../middleware/validate.js";
import { monthRangeFromISO, toMonthAnchorISO } from "../utils/date.js";
import { incomeWeights, distribute, type Dist } from "../utils/contrib.js";

// ---- Validation ----
const QueryPlanning = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Invalid month format. Expected YYYY-MM")
    .optional(),
});

const r = Router();

/**
 * GET /api/accounts/:accountId/planning?month=YYYY-MM
 *
 * Returns the Planning ReadModel for a given account and reference month.
 */
r.get("/:accountId/planning", validateQuery(QueryPlanning), async (req, res) => {
  const { accountId } = req.params;
  if (!/^[a-f\d]{24}$/i.test(accountId)) return res.status(400).json({ error: "INVALID_ID" });

  const account = await Account.findById(accountId).lean();
  if (!account) return res.sendStatus(404);

  const accId = new Types.ObjectId(accountId);

  // Resolve reference month
  const now = DateTime.utc();
  const monthParam: string | undefined = (req as any).q?.month;
  const refMonthISO: string = monthParam
    ? toMonthAnchorISO(`${monthParam}-01`)
    : toMonthAnchorISO(now.toJSDate());

  const refMonthLabel = refMonthISO.slice(0, 7); // "YYYY-MM"
  const { start: monthStart, end: monthEnd } = monthRangeFromISO(refMonthISO);

  // Member IDs from account
  const memberRefs = (account.members ?? []) as Array<{ memberId: unknown; role?: string }>;
  const memberIds: string[] = memberRefs.map((m) => String(m.memberId));
  const memberNameById: Record<string, string | null> = {};

  // Fetch data in parallel
  const [memberDocs, allBudgets, allIncomes, activeRuleDocs, allCategories] = await Promise.all([
    Member.find({ _id: { $in: memberIds.map((x) => new Types.ObjectId(x)) } }, { name: 1 }).lean(),

    // ALL budgets for this account (for planning view — show past/future too)
    CategoryBudget.find({ accountId: accId }).lean(),

    // ALL incomes for this account
    MemberIncome.find({ accountId: accId }).lean(),

    // Contribution rules active in the reference month
    ContributionRule.find({
      accountId: accId,
      $and: [
        { $or: [{ fromMonth: null }, { fromMonth: { $lte: monthEnd } }] },
        { $or: [{ toMonth: null }, { toMonth: { $gte: monthStart } }] },
      ],
    }).lean(),

    Category.find({ accountId: accId }, { name: 1 }).lean(),
  ]);

  for (const m of memberDocs) {
    memberNameById[String(m._id)] = (m as { name?: string | null }).name ?? null;
  }

  const catNameById: Record<string, string | null> = {};
  for (const c of allCategories) {
    catNameById[String(c._id)] = (c as { name?: string | null }).name ?? null;
  }

  // ---- Active incomes for reference month (for contribution calculations) ----
  const activeIncomes = allIncomes.filter((inc) => {
    const from = inc.fromMonth as unknown as Date | null;
    const to = inc.toMonth as unknown as Date | null;
    return (from == null || from <= monthEnd) && (to == null || to >= monthStart);
  });

  const incomeByMember: Record<string, number> = {};
  for (const inc of activeIncomes) {
    const mid = String((inc as { memberId: unknown }).memberId);
    incomeByMember[mid] = (incomeByMember[mid] ?? 0) + Number((inc as { amountMinor?: number }).amountMinor ?? 0);
  }

  const incWeights = incomeWeights(memberIds, incomeByMember);

  // ---- Helpers ----
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

  const isActiveInMonth = (from: Date | null | unknown, to: Date | null | unknown): boolean => {
    const f = from as Date | null;
    const t = to as Date | null;
    return (f == null || f <= monthEnd) && (t == null || t >= monthStart);
  };

  const toMonthLabel = (d: Date | null | unknown): string | null => {
    if (!d) return null;
    const date = d instanceof Date ? d : new Date(String(d));
    return DateTime.fromJSDate(date).toFormat("yyyy-MM");
  };

  // ---- Build budgets VM ----
  // Detect overlap conflicts per category
  const budgetsByCat: Record<string, typeof allBudgets> = {};
  for (const b of allBudgets) {
    const cid = String((b as { categoryId: unknown }).categoryId);
    if (!budgetsByCat[cid]) budgetsByCat[cid] = [];
    budgetsByCat[cid].push(b);
  }

  const budgetsVm = allBudgets.map((b) => {
    const bId = String(b._id);
    const cid = String((b as { categoryId: unknown }).categoryId);
    const from = b.fromMonth as unknown as Date | null;
    const to = b.toMonth as unknown as Date | null;
    const active = isActiveInMonth(from, to);

    // Check overlap conflict with siblings
    const siblings = (budgetsByCat[cid] ?? []).filter((s) => String(s._id) !== bId);
    let hasOverlapConflict = false;
    for (const s of siblings) {
      const sf = s.fromMonth as unknown as Date | null;
      const st = s.toMonth as unknown as Date | null;
      // Overlap: from1 <= to2 (or to2 null) AND from2 <= to1 (or to1 null)
      const overlap =
        (from == null || st == null || from <= st) &&
        (sf == null || to == null || sf <= to);
      if (overlap) { hasOverlapConflict = true; break; }
    }

    const usageHints: string[] = [];
    if (!active && !hasOverlapConflict) {
      if (to != null && to < monthStart) usageHints.push("Budget expired before reference month.");
      else if (from != null && from > monthEnd) usageHints.push("Budget starts after reference month.");
    }

    return {
      budgetId: bId,
      categoryId: cid,
      categoryName: catNameById[cid] ?? null,
      amountMinor: Number((b as { amountMinor?: number }).amountMinor ?? 0),
      fromMonth: toMonthLabel(from) ?? "open",
      toMonth: toMonthLabel(to),
      isActiveInReferenceMonth: active,
      hasOverlapConflict,
      usageHints,
    };
  });

  // ---- Build incomes VM ----
  const incomesByMember: Record<string, typeof allIncomes> = {};
  for (const inc of allIncomes) {
    const mid = String((inc as { memberId: unknown }).memberId);
    if (!incomesByMember[mid]) incomesByMember[mid] = [];
    incomesByMember[mid].push(inc);
  }

  // Which members are needed for proRata (those referenced in proRata active rules)
  const hasProRataActiveRule = activeRuleDocs.some(
    (rule) => (rule as { distribution?: { mode?: string } }).distribution?.mode === "proRataIncome"
  );

  const incomesVm = memberIds.map((mid) => {
    const memberIncList = (incomesByMember[mid] ?? []).sort((a, b) => {
      const af = (a.fromMonth as unknown as Date | null)?.getTime() ?? 0;
      const bf = (b.fromMonth as unknown as Date | null)?.getTime() ?? 0;
      return bf - af; // newest first
    });

    const activeInc = memberIncList.find((inc) => {
      const from = inc.fromMonth as unknown as Date | null;
      const to = inc.toMonth as unknown as Date | null;
      return isActiveInMonth(from, to);
    }) ?? null;

    const totalIncome = Object.values(incomeByMember).reduce((a, b) => a + b, 0);
    const memberIncomeAmt = incomeByMember[mid] ?? 0;
    const incomeSharePct = totalIncome > 0 ? Math.round((memberIncomeAmt / totalIncome) * 10000) / 100 : null;

    const missingForProRata = hasProRataActiveRule && activeInc == null;

    const toIncVm = (inc: (typeof allIncomes)[0]) => ({
      incomeId: String(inc._id),
      amountMinor: Number((inc as { amountMinor?: number }).amountMinor ?? 0),
      fromMonth: toMonthLabel(inc.fromMonth) ?? "open",
      toMonth: toMonthLabel(inc.toMonth),
    });

    return {
      memberId: mid,
      memberName: memberNameById[mid] ?? null,
      activeIncome: activeInc ? toIncVm(activeInc) : null,
      incomeSharePct,
      missingForProRata,
      history: memberIncList.filter((inc) => {
        const from = inc.fromMonth as unknown as Date | null;
        const to = inc.toMonth as unknown as Date | null;
        return !isActiveInMonth(from, to);
      }).map(toIncVm),
    };
  });

  // ---- Build contributionBlocks and specialBlocks ----
  const allBlocksVm = activeRuleDocs.map((rule) => {
    const ruleRaw = rule as {
      _id: unknown;
      type?: string;
      description?: string | null;
      amountMinor?: number;
      recurring?: boolean;
      fromMonth?: unknown;
      toMonth?: unknown;
      distribution?: { mode?: string; memberId?: unknown; customSplit?: Array<{ memberId: unknown; split?: number }> };
    };

    const amount = Number(ruleRaw.amountMinor ?? 0);
    const dist = ensureDist(rule);
    const ruleType = (ruleRaw.type ?? "base") as "base" | "additional" | "topup";
    const isBase = ruleType === "base";

    const perMemberRaw = amount ? distribute(amount, dist, memberIds, incWeights) : {};
    const totalDistributed = Object.values(perMemberRaw).reduce((a, b) => a + b, 0) || 1;

    const effectByMember = memberIds.map((mid) => {
      const amt = perMemberRaw[mid] ?? 0;
      return {
        memberId: mid,
        amountMinor: amt,
        sharePct: Math.round((amt / totalDistributed) * 10000) / 100,
      };
    });

    // Title: base rules get a generated title, others use description
    const title = isBase
      ? `Basisbedarf (${dist.mode === "proRataIncome" ? "ProRata Einkommen" : dist.mode === "customSplit" ? "Custom Split" : "Per Mitglied"})`
      : (ruleRaw.description ?? "Regel");

    const usageHints: string[] = [];
    if (isBase) usageHints.push("Abgeleitet aus Kategorie-Budgets");

    return {
      id: String(ruleRaw._id),
      source: (isBase ? "generatedBase" : "contributionRule") as "generatedBase" | "contributionRule",
      ruleId: String(ruleRaw._id),
      type: ruleType,
      title,
      description: ruleRaw.description ?? null,
      amountMinor: amount,
      recurring: Boolean(ruleRaw.recurring ?? true),
      fromMonth: toMonthLabel(ruleRaw.fromMonth),
      toMonth: toMonthLabel(ruleRaw.toMonth),
      distribution: {
        mode: (ruleRaw.distribution?.mode ?? "proRataIncome") as "perMember" | "customSplit" | "proRataIncome",
        ...(ruleRaw.distribution?.mode === "perMember" ? { memberId: String(ruleRaw.distribution?.memberId ?? "") } : {}),
        ...(ruleRaw.distribution?.mode === "customSplit"
          ? {
              customSplit: (ruleRaw.distribution?.customSplit ?? []).map((s) => ({
                memberId: String(s.memberId ?? ""),
                split: Number(s.split ?? 0),
              })),
            }
          : {}),
      },
      isActiveInReferenceMonth: true, // already filtered by query
      isEditable: !isBase,
      effectByMember,
      usageHints,
    };
  });

  // base + additional → contributionBlocks; topup → specialBlocks
  const contributionBlocks = allBlocksVm.filter((b) => b.type === "base" || b.type === "additional");
  const specialBlocks = allBlocksVm.filter((b) => b.type === "topup");

  // ---- Build preview ----
  const dueByMember: Record<string, number> = {};
  for (const block of allBlocksVm) {
    const dist = ensureDist(activeRuleDocs.find((r) => String((r as { _id: unknown })._id) === block.ruleId));
    if (!dist) continue;
    const partial = distribute(block.amountMinor, dist, memberIds, incWeights);
    for (const k of Object.keys(partial)) dueByMember[k] = (dueByMember[k] ?? 0) + (partial[k] ?? 0);
  }

  const plannedNeedMinor = Object.values(dueByMember).reduce((a, b) => a + b, 0);

  const memberDuePreview = memberIds.map((mid) => ({
    memberId: mid,
    memberName: memberNameById[mid] ?? null,
    dueMinor: dueByMember[mid] ?? 0,
    breakdown: allBlocksVm
      .filter((b) => (b.effectByMember.find((e) => e.memberId === mid)?.amountMinor ?? 0) > 0)
      .map((b) => ({
        blockId: b.id,
        title: b.title,
        amountMinor: b.effectByMember.find((e) => e.memberId === mid)?.amountMinor ?? 0,
      })),
  }));

  // ---- Build hints ----
  const hints = [];

  // Income missing hints
  for (const inc of incomesVm) {
    if (inc.missingForProRata) {
      hints.push({
        code: "INCOME_MISSING",
        severity: "warn" as const,
        message: `${inc.memberName ?? inc.memberId} hat kein aktives Einkommen für den Referenzmonat. ProRata-Verteilung ist unvollständig.`,
        target: { kind: "income" as const, memberId: inc.memberId },
      });
    }
  }

  // Budget overlap hints
  for (const b of budgetsVm) {
    if (b.hasOverlapConflict) {
      hints.push({
        code: "BUDGET_OVERLAP",
        severity: "error" as const,
        message: `Budget für Kategorie "${b.categoryName ?? b.categoryId}" überschneidet sich mit einem anderen Budget.`,
        target: { kind: "budget" as const, id: b.budgetId },
      });
    }
  }

  // No budgets at all
  if (allBudgets.length === 0) {
    hints.push({
      code: "NO_BUDGETS",
      severity: "info" as const,
      message: "Es sind noch keine Kategorie-Budgets definiert. Der Basisbedarf kann nicht berechnet werden.",
      target: { kind: "general" as const },
    });
  }

  // No active budgets
  const activeBudgets = budgetsVm.filter((b) => b.isActiveInReferenceMonth);
  if (allBudgets.length > 0 && activeBudgets.length === 0) {
    hints.push({
      code: "NO_ACTIVE_BUDGETS",
      severity: "warn" as const,
      message: "Für den Referenzmonat sind keine Budgets aktiv.",
      target: { kind: "general" as const },
    });
  }

  // ---- Build overview ----
  const activeBudgetSumMinor = activeBudgets.reduce((sum, b) => sum + b.amountMinor, 0);
  const proRataRulesActive = activeRuleDocs.filter(
    (r) => (r as { distribution?: { mode?: string } }).distribution?.mode === "proRataIncome"
  );
  let proRataStatus: "notUsed" | "complete" | "incomplete";
  if (proRataRulesActive.length === 0) {
    proRataStatus = "notUsed";
  } else {
    const missingMembers = incomesVm.filter((i) => i.missingForProRata);
    proRataStatus = missingMembers.length === 0 ? "complete" : "incomplete";
  }

  const overview = {
    activeBudgetSumMinor,
    activeBudgetCount: activeBudgets.length,
    activeContributionBlockCount: allBlocksVm.length,
    proRataStatus,
    hintCount: hints.length,
  };

  res.json({
    accountId,
    referenceMonth: refMonthLabel,
    overview,
    budgets: budgetsVm,
    incomes: incomesVm,
    contributionBlocks,
    specialBlocks,
    preview: {
      month: refMonthLabel,
      plannedNeedMinor,
      memberDuePreview,
    },
    hints,
    categories: allCategories.map((c: { _id: unknown; name?: string | null }) => ({
      id: String(c._id),
      name: c.name ?? null,
    })),
  });
});

export default r;
