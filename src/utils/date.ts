import { DateTime } from "luxon";

/** Monatsanker als ISO (UTC 1. des Monats 00:00:00.000Z) */
export const toMonthAnchorISO = (d: Date | string | number): string => {
  const dt = typeof d === "string" || typeof d === "number" ? DateTime.fromISO(String(d), { zone: "utc" }) : DateTime.fromJSDate(d, { zone: "utc" });
  const start = dt.set({ day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 }).toUTC();
  return start.toISO({ suppressMilliseconds: false }) as string;
};

/** [start,end) für Monatsanker (ISO) – JS Date für Mongo-Queries */
export const monthRangeFromISO = (isoMonthAnchor: string): { start: Date; end: Date } => {
  const startDT = DateTime.fromISO(isoMonthAnchor, { zone: "utc" }).set({ day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 }).toUTC();
  const endDT = startDT.plus({ months: 1 });
  return { start: startDT.toJSDate(), end: endDT.toJSDate() };
};

/** Letzte N Monatsanker (älteste → neueste) als ISO */
export const lastNMonthAnchorsISO = (n: number, ref: Date = new Date()): string[] => {
  const refDT = DateTime.fromJSDate(ref, { zone: "utc" });
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const dt = refDT.minus({ months: i }).set({ day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 }).toUTC();
    out.push(dt.toISO({ suppressMilliseconds: false }) as string);
  }
  return out;
};

/** Forward-Fill für Balanceserie (fehlende Monate = letzter bekannter Wert; vor erstem Wert = 0) */
export const forwardFill = (labelsISO: string[], valuesByISO: Record<string, number | undefined>): number[] => {
  const out: number[] = [];
  let last = 0;
  let seenAny = false;
  for (const iso of labelsISO) {
    const v = valuesByISO[iso];
    if (typeof v === "number") {
      last = v;
      seenAny = true;
      out.push(last);
    } else {
      out.push(seenAny ? last : 0);
    }
  }
  return out;
};
