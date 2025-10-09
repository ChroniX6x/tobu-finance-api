import { toMonthAnchorISO } from "../utils/date.js";

export type InsightKind = "warning" | "info" | "critical" | "task";
export type InsightSeverity = "info" | "warn" | "error";

export interface Insight {
  id: string;
  createdAt: string; // ISO
  month?: string;    // ISO Monatsanker
  kind: InsightKind;
  severity: InsightSeverity;
  scope: "all" | "me";
  assigneeId?: string;
  code: string;
  params?: Record<string, unknown>;
  entityRef?: { type: "transaction" | "category" | "member" | "account"; id: string };
  actions?: Array<{ labelCode: string; route?: string }>;
}

type BuildParams = {
  accountId: string;
  currentMonthISO: string;
  pendingRecurringCount: number;
  extraContribCount: number;
  extraContribSumMinor: number;
  forecastMinor: number;
  thresholdForecastMinor: number;
  carryovers: Array<{ memberId?: string | null; amountMinor: number }>;
  carryoverLargeMinor: number;
  overBudget: Array<{ categoryId: string; categoryName: string | null; actualMinor: number; budgetMinor: number }>;
  missingBudget: Array<{ categoryId: string; categoryName: string | null; actualMinor: number }>;
  openDues: Array<{ memberId: string; monthlyDueMinor: number; paidAmountMinor: number }>;
};

export function buildInsights(p: BuildParams): Insight[] {
  const out: Insight[] = [];
  const now = new Date().toISOString();
  const monthISO = toMonthAnchorISO(p.currentMonthISO);

  for (const m of p.openDues) {
    out.push({
      id: `ins:due-open:${m.memberId}:${monthISO}`,
      createdAt: now,
      month: monthISO,
      kind: "warning",
      severity: "warn",
      scope: "all",
      assigneeId: m.memberId,
      code: "due-open",
      params: { memberId: m.memberId, monthISO, monthlyDueMinor: m.monthlyDueMinor, paidAmountMinor: m.paidAmountMinor },
      entityRef: { type: "member", id: m.memberId },
      actions: [{ labelCode: "confirm", route: `/accounts/${p.accountId}/contributions?month=${monthISO}` }],
    });
  }

  if (p.pendingRecurringCount > 0) {
    out.push({
      id: `ins:recurring-pending:${monthISO}`,
      createdAt: now,
      month: monthISO,
      kind: "warning",
      severity: "warn",
      scope: "all",
      code: "recurring-pending",
      params: { count: p.pendingRecurringCount, monthISO },
      actions: [{ labelCode: "review_recurring", route: `/accounts/${p.accountId}/recurring?month=${monthISO}` }],
    });
  }

  if (p.extraContribCount > 0) {
    out.push({
      id: `ins:extra-contrib-active:${monthISO}`,
      createdAt: now,
      month: monthISO,
      kind: "info",
      severity: "info",
      scope: "all",
      code: "extra-contrib-active",
      params: { count: p.extraContribCount, sumMinor: p.extraContribSumMinor, monthISO },
    });
  }

  for (const ob of p.overBudget) {
    out.push({
      id: `ins:category-over-budget:${ob.categoryId}:${monthISO}`,
      createdAt: now,
      month: monthISO,
      kind: "warning",
      severity: "warn",
      scope: "all",
      code: "category-over-budget",
      params: { categoryId: ob.categoryId, categoryName: ob.categoryName, monthISO, actualMinor: ob.actualMinor, budgetMinor: ob.budgetMinor },
      entityRef: { type: "category", id: ob.categoryId },
      actions: [{ labelCode: "open_category_budget", route: `/accounts/${p.accountId}/budgets?month=${monthISO}&categoryId=${ob.categoryId}` }],
    });
  }

  for (const mb of p.missingBudget) {
    out.push({
      id: `ins:missing-budget:${mb.categoryId}:${monthISO}`,
      createdAt: now,
      month: monthISO,
      kind: "info",
      severity: "info",
      scope: "all",
      code: "missing-budget",
      params: { categoryId: mb.categoryId, categoryName: mb.categoryName, monthISO, actualMinor: mb.actualMinor },
      entityRef: { type: "category", id: mb.categoryId },
      actions: [{ labelCode: "open_category_budget", route: `/accounts/${p.accountId}/budgets?month=${monthISO}&categoryId=${mb.categoryId}` }],
    });
  }

  for (const c of p.carryovers) {
    if (Math.abs(c.amountMinor) >= p.carryoverLargeMinor) {
      const mid = c.memberId ? String(c.memberId) : "unknown";
      const insight: Insight = {
        id: `ins:carryover-large:${mid}:${monthISO}`,
        createdAt: now,
        month: monthISO,
        kind: "warning",
        severity: "warn",
        scope: "all",
        code: "carryover-large",
        params: { memberId: c.memberId ?? null, monthISO, amountMinor: c.amountMinor },
        actions: [{ labelCode: "settle_carryover", route: `/accounts/${p.accountId}/carryovers?month=${monthISO}` }],
      };
      if (c.memberId) {
        insight.entityRef = { type: "member", id: mid };
      }
      out.push(insight);
    }
  }

  if (p.forecastMinor < p.thresholdForecastMinor) {
    out.push({
      id: `ins:balance-low-forecast:${monthISO}`,
      createdAt: now,
      month: monthISO,
      kind: "critical",
      severity: "error",
      scope: "all",
      code: "balance-low-forecast",
      params: { forecastMinor: p.forecastMinor, thresholdMinor: p.thresholdForecastMinor, monthISO },
      actions: [{ labelCode: "open_settings", route: `/accounts/${p.accountId}/settings` }],
    });
  }

  return out;
}
