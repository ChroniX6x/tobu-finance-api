import { Router } from "express";
import { Types } from "mongoose";
import { DateTime } from "luxon";

import Account from "../models/Account.js";
import AccountBalance from "../models/AccountBalance.js";
import Transaction from "../models/Transaction.js";

import {
  computeReliableBalanceBlock,
  buildCarriedSeries,
  computeStalenessDays,
  type BalanceSnapshot,
} from "../utils/reliableBalance.js";

const r = Router();

/**
 * GET /api/dashboard/accounts?memberId=<ObjectId>
 *
 * Listet alle Accounts, in denen memberId enthalten ist, inkl.:
 * - Reliable Balance Block (currentBalanceMinor, currentMonthIso, balanceChangePct)
 * - Staleness (stalenessDays, isStale)
 * - Mini-Sparkline mit carry-forward (miniLineDataMinor)
 */
r.get("/accounts", async (req, res) => {
  const { memberId } = (req.query ?? {}) as { memberId?: string };

  if (!memberId || !/^[a-f\d]{24}$/i.test(memberId)) {
    return res.status(400).json({ error: "INVALID_MEMBER_ID" });
  }

  // Alle relevanten Accounts laden (Mitgliedschaft des Users)
  const accounts = await Account.find({ "members.memberId": new Types.ObjectId(memberId) })
    .select({ name: 1, members: 1, settings: 1 })
    .lean();

  // Falls keine Accounts: leere Liste zurück
  if (accounts.length === 0) {
    return res.json([]);
  }

  // Für jeden Account: Balances seit X Monaten (etwas großzügiger als Sparkline-Länge für Change %)
  // Sparkline-Länge: n = min(Setting.historyMonths, 12) aber mindestens 5 für gute Lesbarkeit
  const now = DateTime.utc();
  const results: Array<{
    id: string;
    name: string | null;
    memberCount: number;
    currentBalanceMinor: number;
    currentMonthIso: string;
    balanceChangePct: number;
    stalenessDays: number;
    isStale: boolean;
    miniLineDataMinor: { labelsIso: string[]; dataMinor: number[]; carried: boolean[] };
  }> = [];

  for (const acc of accounts) {
    const accountId = new Types.ObjectId((acc as { _id: unknown })._id as string);
    const name = (acc as { name?: string | null }).name ?? null;
    const memberCount = Array.isArray((acc as { members?: unknown[] }).members) ? (acc as { members: unknown[] }).members.length : 0;

    // Settings/Defaults
    const historyMonthsSetting = (acc as { settings?: { dashboard?: { historyMonths?: number } } })?.settings?.dashboard?.historyMonths ?? 6;
    const staleDaysThreshold = (acc as { settings?: { alerts?: { staleDaysThreshold?: number } } })?.settings?.alerts?.staleDaysThreshold ?? 30;

    // Sparkline-Länge bestimmen
    const sparkMonths = Math.max(5, Math.min(12, historyMonthsSetting));

    // Balances ab "heute - max(24, sparkMonths+2) Monate" holen (für Change % zwei echte Punkte nötig)
    const sinceIso = now.minus({ months: Math.max(24, sparkMonths + 2) }).set({
      day: 1, hour: 0, minute: 0, second: 0, millisecond: 0,
    });
    const balancesRaw = await AccountBalance.find({
      accountId,
      month: { $gte: sinceIso.toJSDate() },
    })
      .select({ month: 1, closingBalanceCents: 1 })
      .lean();

    const snapshotsAsc: BalanceSnapshot[] = (balancesRaw as Array<{ month: Date; closingBalanceCents?: number }>)
      .map((b) => ({ month: b.month, valueMinor: Number(b.closingBalanceCents ?? 0) }))
      .sort((a, b) => a.month.getTime() - b.month.getTime());

    // Reliable Balance & Change
    const rb = computeReliableBalanceBlock(snapshotsAsc);

    // Staleness: max(bookDate, createdAt) über alle Tx in Account
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

    // Sparkline: carry-forward Serie (letzte sparkMonths inkl. aktueller Monat)
    const series = buildCarriedSeries(snapshotsAsc, sparkMonths, now.toJSDate());

    results.push({
      id: String(accountId),
      name,
      memberCount,
      currentBalanceMinor: rb.currentBalanceMinor,
      currentMonthIso: rb.currentMonthIso,
      balanceChangePct: rb.balanceChangePct,
      stalenessDays,
      isStale,
      miniLineDataMinor: {
        labelsIso: series.labelsIso,
        dataMinor: series.dataMinor,
        carried: series.carried,
      },
    });
  }

  res.json(results);
});

export default r;
