import { DateTime } from "luxon";

export type BalanceSnapshot = {
  month: Date;              // JS Date Monatsanker (UTC 1., 00:00)
  valueMinor: number;       // z. B. closingBalanceCents
};

export type ReliableBalance = {
  currentBalanceMinor: number;
  currentMonthIso: string;  // YYYY-MM (genauer: ISO des Monatsankers, z. B. 2025-09-01T00:00:00.000Z)
  balanceChangePct: number; // gegen vorletzten echten Snapshot, sonst 0
};

export type CarriedSeries = {
  labelsIso: string[];       // Monatsanker ISO (YYYY-MM-01T00:00:00.000Z)
  dataMinor: number[];       // carry-forward
  carried: boolean[];        // true wenn forward-fill, false wenn realer Snapshot
};

/** wählt den letzten Snapshot ≤ heute (UTC) */
export function pickLastSnapshot(snapshotsAsc: BalanceSnapshot[]): BalanceSnapshot | null {
  const today = DateTime.utc();
  let last: BalanceSnapshot | null = null;
  for (const s of snapshotsAsc) {
    const m = DateTime.fromJSDate(s.month, { zone: "utc" });
    if (m <= today) last = s;
  }
  return last;
}

/** berechnet prozentuale Änderung zwischen den zwei letzten **echten** Snapshots */
export function computeChangePctFromRealSnapshots(snapshotsAsc: BalanceSnapshot[]): number {
  if (snapshotsAsc.length < 2) return 0;
  const last = snapshotsAsc[snapshotsAsc.length - 1];
  const prev = snapshotsAsc[snapshotsAsc.length - 2];
  const a = prev.valueMinor;
  const b = last.valueMinor;
  if (!a) return 0;
  return Math.round(((b - a) / a) * 1000) / 10; // 1 Nachkommastelle
}

/** baut eine carried-forward Serie über die letzten N Monate bis inkl. ref (UTC) */
export function buildCarriedSeries(
  snapshotsAsc: BalanceSnapshot[],
  monthsBack: number,
  ref: Date = new Date()
): CarriedSeries {
  const refDT = DateTime.fromJSDate(ref, { zone: "utc" }).set({ day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 });
  const labelsIso: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    labelsIso.push(
      refDT.minus({ months: i }).toUTC().toISO({ suppressMilliseconds: false }) as string
    );
  }

  // Map Snapshot -> ISO
  const map: Record<string, number> = {};
  for (const s of snapshotsAsc) {
    const iso = DateTime.fromJSDate(s.month, { zone: "utc" })
      .set({ day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 })
      .toISO({ suppressMilliseconds: false }) as string;
    map[iso] = s.valueMinor;
  }

  const dataMinor: number[] = [];
  const carried: boolean[] = [];
  let lastKnown = 0;
  let seenAny = false;

  for (const iso of labelsIso) {
    const v = map[iso];
    if (typeof v === "number") {
      dataMinor.push(v);
      carried.push(false);
      lastKnown = v;
      seenAny = true;
    } else {
      dataMinor.push(seenAny ? lastKnown : 0);
      carried.push(seenAny); // nur als "carried" markieren, wenn wir schon echte Werte gesehen haben
    }
  }

  return { labelsIso, dataMinor, carried };
}

/** stalenessDays & isStale */
export function computeStalenessDays(
  lastBalanceMonth: Date,            // Monatsanker (UTC)
  lastTransactionDate: Date | null,  // letzter Buchungs-/Erstellungszeitpunkt
  thresholdDays: number = 30
): { stalenessDays: number; isStale: boolean } {
  const lastBalanceEom = DateTime.fromJSDate(lastBalanceMonth, { zone: "utc" })
    .endOf("month");
  const lastTx = lastTransactionDate ? DateTime.fromJSDate(lastTransactionDate, { zone: "utc" }) : null;
  const anchor = lastTx && lastTx > lastBalanceEom ? lastTx : lastBalanceEom;
  const diff = Math.max(0, Math.floor(DateTime.utc().diff(anchor, "days").days));
  return { stalenessDays: diff, isStale: diff > thresholdDays };
}

/** Zusammenfassung: zuverlässiger Balance-Block */
export function computeReliableBalanceBlock(snapshotsAsc: BalanceSnapshot[]): ReliableBalance {
  if (snapshotsAsc.length === 0) {
    return {
      currentBalanceMinor: 0,
      currentMonthIso: DateTime.utc().set({ day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 }).toISO() as string,
      balanceChangePct: 0,
    };
  }
  const last = pickLastSnapshot(snapshotsAsc) ?? snapshotsAsc[snapshotsAsc.length - 1];
  const changePct = computeChangePctFromRealSnapshots(snapshotsAsc);
  const currentMonthIso = DateTime.fromJSDate(last.month, { zone: "utc" })
    .set({ day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 })
    .toISO({ suppressMilliseconds: false }) as string;

  return {
    currentBalanceMinor: last.valueMinor,
    currentMonthIso,
    balanceChangePct: changePct,
  };
}
