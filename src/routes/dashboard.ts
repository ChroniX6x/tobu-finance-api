import { Router } from "express";
import { Types } from "mongoose";
import Account from "../models/Account.js";
import AccountBalance from "../models/AccountBalance.js";
import Member from "../models/Member.js";
import { validateQuery } from "../middleware/validate.js";
import { QueryDashboardAccounts } from "../validation/dashboard.js";

const r = Router();

// Staleness threshold in days (later from account.settings.alerts.stalenessDays)
const DEFAULT_STALENESS_THRESHOLD_DAYS = 30;

// Baue Liste der letzten N Monate (älteste -> neueste), als Date (UTC 1. des Monats 00:00)
function lastNMonthsDates(n: number): Date[] {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-11
  const out: Date[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1, 0, 0, 0, 0));
    out.push(d);
  }
  return out;
}

/**
 * Findet den letzten verlässlichen Balance-Stand (≤ heute)
 */
function findLastReliableBalance(
  balances: Array<{ month: Date; closingBalanceMinor: number }>,
  today: Date
): { month: string; balanceMinor: number } | null {
  // Sortiere Balances absteigend nach Monat
  const sorted = balances
    .filter(b => b.month <= today)
    .sort((a, b) => b.month.getTime() - a.month.getTime());
  
  if (sorted.length === 0) return null;
  
  const last = sorted[0];
  if (!last) return null;
  
  return {
    month: last.month.toISOString(),
    balanceMinor: last.closingBalanceMinor ?? 0,
  };
}

/**
 * Berechnet Staleness in Tagen: heute - Ende des currentMonth
 */
function calculateStaleness(currentMonthISO: string, today: Date): number {
  const monthDate = new Date(currentMonthISO);
  const y = monthDate.getUTCFullYear();
  const m = monthDate.getUTCMonth();
  // Ende des Monats = Anfang des nächsten Monats - 1 Tag
  const endOfMonth = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
  
  const diffMs = today.getTime() - endOfMonth.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Findet fehlende Monate im Betrachtungsfenster
 */
function findMissingMonths(
  monthsDates: Date[],
  balanceMap: Map<string, number>
): string[] {
  const missing: string[] = [];
  for (const d of monthsDates) {
    const key = d.toISOString();
    if (!balanceMap.has(key)) {
      missing.push(key);
    }
  }
  return missing;
}

/**
 * GET /api/dashboard/accounts?userId=... | ?memberId=... [&months=5]
 * Liefert kompakte Kacheldaten fürs Dashboard.
 * - months: Anzahl Monate in balanceHistory (Standard 5, 1..24)
 * - Entweder userId (alle Member des Users -> deren Accounts) ODER memberId direkt
 */
r.get("/accounts", validateQuery(QueryDashboardAccounts), async (req, res) => {
  const { userId, memberId, months = 5 } = (req as any).q as {
    userId?: string;
    memberId?: string;
    months?: number;
  };

  // 1) Bestimme relevante memberIds
  let memberIds: Types.ObjectId[] = [];
  if (userId) {
    const userObjId = new Types.ObjectId(userId);
    const members = await Member.find({ userId: userObjId }, { _id: 1 }).lean();
    memberIds = members.map((m: any) => new Types.ObjectId(m._id));
  }
  if (memberId) {
    memberIds.push(new Types.ObjectId(memberId));
  }
  if (memberIds.length === 0) return res.json([]); // kein Treffer

  // 2) Finde alle Accounts, an denen einer dieser Member beteiligt ist
  const accounts = await Account.find(
    { "members.memberId": { $in: memberIds } },
    { name: 1, members: 1, settings: 1 }
  ).lean();

  if (accounts.length === 0) return res.json([]);

  const accountIds = accounts.map((a: any) => new Types.ObjectId(a._id));
  const today = new Date();

  // 3) Hole ALLE Balances für diese Accounts (nicht nur letzte N Monate)
  // um letzten verlässlichen Stand zu finden
  const allBalances = await AccountBalance.find(
    { accountId: { $in: accountIds } },
    { accountId: 1, month: 1, closingBalanceMinor: 1 }
  ).lean();

  // Group balances by account
  const balancesByAccount: Record<string, Array<{ month: Date; closingBalanceMinor: number }>> = {};
  for (const b of allBalances) {
    const aid = String(b.accountId);
    if (!balancesByAccount[aid]) balancesByAccount[aid] = [];
    balancesByAccount[aid].push({
      month: b.month,
      closingBalanceMinor: b.closingBalanceMinor ?? 0,
    });
  }

  // 4) Für balanceHistory: Hole nur Balances im gewünschten Fenster
  const monthsDates = lastNMonthsDates(months);
  const firstMonth = monthsDates[0];
  const lastMonth = monthsDates[monthsDates.length - 1];

  const windowBalances = await AccountBalance.find(
    {
      accountId: { $in: accountIds },
      month: { $gte: firstMonth, $lte: lastMonth },
    },
    { accountId: 1, month: 1, closingBalanceMinor: 1 }
  ).lean();

  // Map: accountId -> Map(monthISO -> closingBalanceMinor)
  const byAccount: Record<string, Map<string, number>> = {};
  for (const b of balanceData) {
    const aid = String(b.accountId);
    const key = b.month.toISOString();
    if (!byAccount[aid]) byAccount[aid] = new Map();
    byAccount[aid].set(key, b.closingBalanceMinor ?? 0);
  }

  // 5) Aggregiere Ergebnis
  const result = accounts.map((acc: any) => {
    const aid = String(acc._id);
    const accountBalances = balancesByAccount[aid] ?? [];
    
    // Finde letzten verlässlichen Stand
    const lastReliable = findLastReliableBalance(accountBalances, today);
    
    const currentBalanceMinor = lastReliable?.balanceMinor ?? 0;
    const currentMonth = lastReliable?.month ?? today.toISOString();
    
    // Berechne Staleness
    const stalenessDays = calculateStaleness(currentMonth, today);
    const stalenessThreshold = (acc as any).settings?.alerts?.stalenessDays ?? DEFAULT_STALENESS_THRESHOLD_DAYS;
    const isStale = stalenessDays > stalenessThreshold;
    
    // Balance History (reale Werte, keine 0-Fallbacks)
    const balanceMap = byAccount[aid] ?? new Map();
    const balanceHistoryMinor = monthsDates.map(d => {
      const key = d.toISOString();
      return balanceMap.get(key);
    }).filter((v): v is number => v !== undefined);
    
    // Fehlende Monate im Betrachtungsfenster
    const missingMonths = findMissingMonths(monthsDates, balanceMap);

    return {
      id: aid,
      name: acc.name ?? null,
      memberCount: Array.isArray(acc.members) ? acc.members.length : 0,
      currentBalanceMinor,
      currentMonth,
      stalenessDays,
      isStale,
      balanceHistoryMinor,
      missingMonths,
    };
  });

  res.json(result);
});

export default r;
