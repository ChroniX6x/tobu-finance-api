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
  extraContribSumCents: number;
  forecastCents: number;
  thresholdForecastCents: number;
  carryovers: Array<{ memberId?: string | null; amountCents: number }>;
  carryoverLargeCents: number;
  overBudget: Array<{ categoryId: string; categoryName: string | null; actualCents: number; budgetCents: number }>;
  missingBudget: Array<{ categoryId: string; categoryName: string | null; actualCents: number }>;
  openDues: Array<{ memberId: string; monthlyDueCents: number; paidAmountCents: number }>;
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
      params: { memberId: m.memberId, monthISO, monthlyDueCents: m.monthlyDueCents, paidAmountCents: m.paidAmountCents },
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
      params: { count: p.extraContribCount, sumCents: p.extraContribSumCents, monthISO },
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
      params: { categoryId: ob.categoryId, categoryName: ob.categoryName, monthISO, actualCents: ob.actualCents, budgetCents: ob.budgetCents },
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
      params: { categoryId: mb.categoryId, categoryName: mb.categoryName, monthISO, actualCents: mb.actualCents },
      entityRef: { type: "category", id: mb.categoryId },
      actions: [{ labelCode: "open_category_budget", route: `/accounts/${p.accountId}/budgets?month=${monthISO}&categoryId=${mb.categoryId}` }],
    });
  }

  for (const c of p.carryovers) {
    if (Math.abs(c.amountCents) >= p.carryoverLargeCents) {
      const mid = c.memberId ? String(c.memberId) : "unknown";
      out.push({
        id: `ins:carryover-large:${mid}:${monthISO}`,
        createdAt: now,
        month: monthISO,
        kind: "warning",
        severity: "warn",
        scope: "all",
        code: "carryover-large",
        params: { memberId: c.memberId ?? null, monthISO, amountCents: c.amountCents },
        entityRef: c.memberId ? { type: "member", id: mid } : undefined,
        actions: [{ labelCode: "settle_carryover", route: `/accounts/${p.accountId}/carryovers?month=${monthISO}` }],
      });
    }
  }

  if (p.forecastCents < p.thresholdForecastCents) {
    out.push({
      id: `ins:balance-low-forecast:${monthISO}`,
      createdAt: now,
      month: monthISO,
      kind: "critical",
      severity: "error",
      scope: "all",
      code: "balance-low-forecast",
      params: { forecastCents: p.forecastCents, thresholdCents: p.thresholdForecastCents, monthISO },
      actions: [{ labelCode: "open_settings", route: `/accounts/${p.accountId}/settings` }],
    });
  }

  return out;
}
