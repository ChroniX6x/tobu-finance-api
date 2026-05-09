import { Router } from "express";
import { Types } from "mongoose";
import Account from "../models/Account.js";
import Member from "../models/Member.js";
import Category from "../models/Category.js";
import Transaction from "../models/Transaction.js";
import CategoryBudget from "../models/CategoryBudget.js";
import Recurrence from "../models/Recurrence.js";
import MemberIncome from "../models/MemberIncome.js";
import CarryOver from "../models/CarryOver.js";
import ContributionRule from "../models/ContributionRule.js";

const r = Router();

/** GET /api/accounts/:accountId/master-data */
r.get("/:accountId/master-data", async (req, res) => {
  const { accountId } = req.params;
  if (!/^[a-f\d]{24}$/i.test(accountId))
    return res.status(400).json({ error: "INVALID_ID" });

  const accId = new Types.ObjectId(accountId);
  const acc = await Account.findById(accId).lean();
  if (!acc) return res.sendStatus(404);

  const accountMemberIds = ((acc as any).members ?? []).map(
    (m: any) => new Types.ObjectId(m.memberId)
  );

  // Parallel data fetches
  const [
    memberDocs,
    categoryDocs,
    txPaidByMemberIds,
    contributionRules,
    miMemberIds,
    coMemberIds,
    txCategoryGroups,
    uncategorizedCount,
    budgetCategoryIds,
    recurrenceCategoryGroups,
  ] = await Promise.all([
    Member.find({ _id: { $in: accountMemberIds } }).lean(),
    Category.find({ accountId: accId }).lean(),
    Transaction.distinct("paidByMemberId", { accountId: accId }),
    ContributionRule.find({ accountId: accId }).lean(),
    MemberIncome.distinct("memberId", { accountId: accId }),
    CarryOver.distinct("memberId", { accountId: accId }),
    Transaction.aggregate([
      { $match: { accountId: accId, categoryId: { $ne: null } } },
      { $group: { _id: "$categoryId", count: { $sum: 1 } } },
    ]),
    Transaction.countDocuments({ accountId: accId, categoryId: null }),
    CategoryBudget.distinct("categoryId", { accountId: accId }),
    Recurrence.aggregate([
      { $match: { accountId: accId, categoryId: { $ne: null } } },
      { $group: { _id: "$categoryId", count: { $sum: 1 } } },
    ]),
  ]);

  // ── Member reference sets ──────────────────────────────────────────────────
  const txPaidBySet = new Set(txPaidByMemberIds.map((id: any) => String(id)));
  const miSet = new Set(miMemberIds.map((id: any) => String(id)));
  const coSet = new Set(coMemberIds.map((id: any) => String(id)));

  // Members referenced in any category's customSplit
  const categorySplitMemberSet = new Set<string>();
  for (const cat of categoryDocs as any[]) {
    for (const sp of cat.customSplit ?? []) {
      categorySplitMemberSet.add(String(sp.memberId));
    }
  }

  // Members referenced in contribution rules
  const rulesMemberSet = new Set<string>();
  for (const rule of contributionRules as any[]) {
    const d = rule.distribution;
    if (d?.memberId) rulesMemberSet.add(String(d.memberId));
    if (Array.isArray(d?.customSplit)) {
      for (const sp of d.customSplit) {
        if (sp?.memberId) rulesMemberSet.add(String(sp.memberId));
      }
    }
  }

  const accountMembers: any[] = (acc as any).members ?? [];
  const ownerCount = accountMembers.filter((m) => m.role === "owner").length;
  const memberCount = accountMembers.length;

  // Map memberDoc._id → memberDoc for name lookups
  const memberDocMap = new Map<string, any>();
  for (const doc of memberDocs as any[]) {
    memberDocMap.set(String(doc._id), doc);
  }

  // ── Member VMs ─────────────────────────────────────────────────────────────
  const memberVms = accountMembers.map((am) => {
    const memberId = String(am.memberId);
    const memberDoc = memberDocMap.get(memberId);
    const usageHints: string[] = [];

    if (txPaidBySet.has(memberId))
      usageHints.push("Wird als Zahler in Buchungen verwendet");
    if (categorySplitMemberSet.has(memberId))
      usageHints.push("Wird in einer Kategorieverteilung verwendet");
    if (rulesMemberSet.has(memberId))
      usageHints.push("Wird in Beitragsregeln verwendet");
    if (miSet.has(memberId))
      usageHints.push("Hat Einkommensdaten");
    if (coSet.has(memberId))
      usageHints.push("Hat Übertragseinträge");
    if (am.role === "owner" && ownerCount === 1)
      usageHints.push("Ist der letzte Owner des Accounts");
    if (memberCount === 1)
      usageHints.push("Ist das einzige Mitglied des Accounts");

    return {
      memberId,
      name: memberDoc?.name ?? null,
      email: memberDoc?.email ?? null,
      avatar: memberDoc?.avatar ?? null,
      role: am.role,
      hasUserAccount: memberDoc?.userId != null,
      canRemoveFromAccount: usageHints.length === 0,
      canChangeRole: !(am.role === "owner" && ownerCount === 1),
      usageHints,
    };
  });

  // ── Category reference maps ────────────────────────────────────────────────
  const txCountMap = new Map<string, number>();
  for (const g of txCategoryGroups as any[]) txCountMap.set(String(g._id), g.count);

  const recCountMap = new Map<string, number>();
  for (const g of recurrenceCategoryGroups as any[]) recCountMap.set(String(g._id), g.count);

  const budgetSet = new Set(budgetCategoryIds.map((id: any) => String(id)));

  // ── Category VMs ───────────────────────────────────────────────────────────
  const categoryVms = (categoryDocs as any[]).map((cat) => {
    const categoryId = String(cat._id);
    const txCount = txCountMap.get(categoryId) ?? 0;
    const recCount = recCountMap.get(categoryId) ?? 0;
    const hasBudget = budgetSet.has(categoryId);
    const usageHints: string[] = [];

    if (txCount > 0)
      usageHints.push(`Wird in ${txCount} Buchung${txCount !== 1 ? "en" : ""} verwendet`);
    if (recCount > 0)
      usageHints.push(`Wird in ${recCount} Wiederkehrer${recCount !== 1 ? "n" : ""} verwendet`);
    if (hasBudget)
      usageHints.push("Hat ein aktives Budget");

    const hasCustomSplit =
      Array.isArray(cat.customSplit) && cat.customSplit.length > 0;

    let customSplitLabel: string | null = null;
    if (hasCustomSplit) {
      customSplitLabel = cat.customSplit
        .map((sp: any) => {
          const m = memberDocMap.get(String(sp.memberId));
          return `${m?.name ?? "Unbekannt"} ${sp.split}\u00a0%`;
        })
        .join(", ");
    }

    return {
      categoryId,
      name: cat.name ?? null,
      customSplit: (cat.customSplit ?? []).map((sp: any) => ({
        memberId: String(sp.memberId),
        split: sp.split,
      })),
      hasCustomSplit,
      customSplitLabel,
      transactionCount: txCount,
      recurrenceCount: recCount,
      hasBudget,
      canDelete: usageHints.length === 0,
      usageHints,
    };
  });

  // ── Meta ───────────────────────────────────────────────────────────────────
  const infoHints: string[] = [];
  const warningHints: string[] = [];

  if (memberCount === 1) {
    infoHints.push(
      "Dieser Account hat aktuell nur ein Mitglied. Für ein Gemeinschaftskonto sind normalerweise mindestens zwei Mitglieder sinnvoll."
    );
  }
  if (uncategorizedCount > 0) {
    infoHints.push(
      `${uncategorizedCount} Buchung${uncategorizedCount !== 1 ? "en sind" : " ist"} nicht kategorisiert.`
    );
  }

  // ── Account VM ─────────────────────────────────────────────────────────────
  const settings = (acc as any).settings ?? {};
  const dashboard = settings.dashboard ?? {};
  const alerts = settings.alerts ?? {};

  const accountVm = {
    _id: String((acc as any)._id),
    name: (acc as any).name ?? null,
    currency: (acc as any).currency ?? "EUR",
    memberCount,
    settings: {
      dashboard: {
        historyMonths: dashboard.historyMonths ?? 6,
        topKCategories: dashboard.topKCategories ?? 5,
      },
      alerts: {
        lowBalanceForecastMinor: alerts.lowBalanceForecastMinor ?? null,
        carryoverLargeMinor: alerts.carryoverLargeMinor ?? null,
        stalenessDays: alerts.stalenessDays ?? null,
      },
    },
  };

  res.json({
    account: accountVm,
    members: memberVms,
    categories: categoryVms,
    meta: {
      uncategorizedTransactionCount: uncategorizedCount,
      hasSingleMemberInfo: memberCount === 1,
      infoHints,
      warningHints,
    },
  });
});

export default r;
