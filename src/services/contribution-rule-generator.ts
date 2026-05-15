import { Types } from "mongoose";
import { DateTime } from "luxon";

import CategoryBudget from "../models/CategoryBudget.js";
import Category from "../models/Category.js";
import ContributionRule from "../models/ContributionRule.js";

type CustomSplitEntry = { memberId: Types.ObjectId; split: number };

/**
 * Returns a stable key for a customSplit array so that two categories with
 * identical splits can be grouped into one shared base rule.
 * An empty (or absent) split maps to the special "__proRata__" key.
 */
function splitKey(customSplit: CustomSplitEntry[]): string {
  if (!customSplit || customSplit.length === 0) return "__proRata__";
  return customSplit
    .map((e) => `${String(e.memberId)}:${e.split}`)
    .sort()
    .join("|");
}

interface GroupData {
  amountMinor: number;
  fromMonth: Date | null;
  toMonth: Date | null;
  hasOpenBudget: boolean;
  customSplit: CustomSplitEntry[];
}

/**
 * Rebuilds all `type: 'base'` ContributionRules for an account from the current
 * CategoryBudgets. Called after every POST / PATCH / DELETE on category-budgets.
 *
 * Algorithm:
 *  1. Delete all existing base rules for the account.
 *  2. Load all budgets + their categories (for customSplit).
 *  3. Group categories by customSplit signature.
 *  4. For each group, write one new base rule whose amountMinor is the sum of
 *     currently-active budgets (i.e. budgets that are not yet expired).
 */
export async function regenerateBaseRules(
  accountId: string | Types.ObjectId
): Promise<void> {
  const accId =
    typeof accountId === "string"
      ? new Types.ObjectId(accountId)
      : accountId;

  // 1. Remove all existing base rules
  await ContributionRule.deleteMany({ accountId: accId, type: "base" });

  // 2. Load budgets
  const budgets = await CategoryBudget.find({ accountId: accId }).lean();
  if (budgets.length === 0) return;

  // 3. Load categories referenced by those budgets
  const categoryIds = [
    ...new Set(budgets.map((b) => String(b.categoryId))),
  ];
  const categories = await Category.find({
    _id: { $in: categoryIds.map((id) => new Types.ObjectId(id)) },
  }).lean();

  const categoryMap = new Map(categories.map((c) => [String(c._id), c]));

  // Current month anchor (first of current month, UTC)
  const currentMonthStart = DateTime.utc()
    .set({ day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 })
    .toJSDate();

  // 4. Group budgets by the customSplit signature of their category
  const groups = new Map<string, GroupData>();

  for (const budget of budgets) {
    const cat = categoryMap.get(String(budget.categoryId));
    const split = (cat?.customSplit ?? []) as unknown as CustomSplitEntry[];
    const key = splitKey(split);

    const budgetFrom = budget.fromMonth as unknown as Date | null;
    const budgetTo = budget.toMonth as unknown as Date | null;

    // A budget is "currently active" if it has not expired yet
    const isCurrentlyActive =
      (budgetFrom == null || budgetFrom <= currentMonthStart) &&
      (budgetTo == null || budgetTo >= currentMonthStart);

    if (!groups.has(key)) {
      groups.set(key, {
        amountMinor: 0,
        fromMonth: budgetFrom,
        toMonth: budgetTo,
        hasOpenBudget: budgetTo == null,
        customSplit: split,
      });
    }

    const g = groups.get(key)!;

    // Accumulate amount only for currently active budgets
    if (isCurrentlyActive) {
      g.amountMinor += budget.amountMinor as number;
    }

    // Expand time range to cover all budgets in this group (for MonthView queries)
    if (budgetFrom == null) {
      g.fromMonth = null; // −∞ wins
    } else if (g.fromMonth != null && budgetFrom < g.fromMonth) {
      g.fromMonth = budgetFrom;
    }

    if (budgetTo == null) {
      g.hasOpenBudget = true;
      g.toMonth = null; // +∞ wins
    } else if (!g.hasOpenBudget) {
      if (g.toMonth == null || budgetTo > g.toMonth) {
        g.toMonth = budgetTo;
      }
    }
  }

  // 5. Persist one base rule per group (skip groups with no active budget amount)
  const rulesData: object[] = [];

  for (const g of groups.values()) {
    if (g.amountMinor <= 0) continue;

    const isProRata = g.customSplit.length === 0;

    rulesData.push({
      accountId: accId,
      type: "base",
      recurring: true,
      description: null,
      amountMinor: g.amountMinor,
      distribution: isProRata
        ? { mode: "proRataIncome", memberId: null, customSplit: null }
        : {
            mode: "customSplit",
            memberId: null,
            customSplit: g.customSplit.map((e) => ({
              memberId: e.memberId,
              split: e.split,
            })),
          },
      fromMonth: g.fromMonth,
      toMonth: g.hasOpenBudget ? null : g.toMonth,
    });
  }

  if (rulesData.length > 0) {
    await ContributionRule.insertMany(rulesData);
  }
}
