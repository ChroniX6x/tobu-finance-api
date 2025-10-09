import { Router } from "express";
import { Types } from "mongoose";
import Account from "../models/Account.js";
import AccountBalance from "../models/AccountBalance.js";
import Member from "../models/Member.js";
import { validateQuery } from "../middleware/validate.js";
import { QueryDashboardAccounts } from "../validation/dashboard.js";

const r = Router();

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
    const members = await Member.find({ userId: userObjId }).select({ _id: 1 }).lean();
    memberIds = members.map(m => new Types.ObjectId(m._id));
  }
  if (memberId) {
    memberIds.push(new Types.ObjectId(memberId));
  }
  if (memberIds.length === 0) return res.json([]); // kein Treffer

  // 2) Finde alle Accounts, an denen einer dieser Member beteiligt ist
  const accounts = await Account.find({
    "members.memberId": { $in: memberIds },
  }).select({ name: 1, members: 1 }).lean();

  if (accounts.length === 0) return res.json([]);

  const accountIds = accounts.map(a => new Types.ObjectId(a._id));

  // 3) Hole Balances in einem Rutsch: für alle Accounts und die letzten N Monate
  const monthsDates = lastNMonthsDates(months);
  const firstMonth = monthsDates[0];
  const lastMonth = monthsDates[monthsDates.length - 1];

  const balances = await AccountBalance.find({
    accountId: { $in: accountIds },
    month: { $gte: firstMonth, $lte: lastMonth },
  }).select({ accountId: 1, month: 1, closingBalanceCents: 1 }).lean();

  // Map: accountId -> Map(monthISO -> closingBalanceCents)
  const byAccount: Record<string, Map<string, number>> = {};
  for (const b of balances) {
    const aid = String(b.accountId);
    const key = new Date(b.month).toISOString(); // exakt Tag 1, 00:00Z
    if (!byAccount[aid]) byAccount[aid] = new Map();
    byAccount[aid].set(key, b.closingBalanceCents ?? 0);
  }

  // 4) Aggregiere Ergebnis
  const result = accounts.map(acc => {
    const aid = String(acc._id);
    const monthValues = monthsDates.map(d => {
      const key = d.toISOString();
      // Falls kein Balance-Eintrag existiert -> 0 (du kannst hier auch null verwenden, wenn dir das lieber ist)
      return byAccount[aid]?.get(key) ?? 0;
    });
    const currentBalance = monthValues[monthValues.length - 1] ?? 0;

    return {
      id: aid,
      name: acc.name ?? null,
      memberCount: Array.isArray(acc.members) ? acc.members.length : 0,
      currentBalance,
      balanceHistory: monthValues, // älteste -> neueste
    };
  });

  res.json(result);
});

export default r;
