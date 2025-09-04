import { DateTime } from "luxon";

/** ISO-String (oder Date) -> JS Date auf Monatsanker [UTC, 1. des Monats, 00:00:00.000] */
export function toMonthDate(input: string | Date): Date {
  const dt = typeof input === "string"
    ? DateTime.fromISO(input, { zone: "utc" })
    : DateTime.fromJSDate(input, { zone: "utc" });
  return dt.set({ day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 }).toUTC().toJSDate();
}

/** Liefert [start,end) JS Dates zu einem Monatsanker-ISO */
export function monthRangeFromISO(isoMonthAnchor: string): { start: Date; end: Date } {
  const start = DateTime.fromISO(isoMonthAnchor, { zone: "utc" }).set({ day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 }).toUTC();
  const end = start.plus({ months: 1 });
  return { start: start.toJSDate(), end: end.toJSDate() };
}

/** Erzeugt die ISO-Monatsanker der letzten n Monate (inkl. Referenzmonat), älteste -> neueste */
export function lastNMonthAnchorsISO(n: number, ref: Date = new Date()): string[] {
  const refDT = DateTime.fromJSDate(ref, { zone: "utc" });
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(
      refDT.minus({ months: i }).set({ day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 }).toUTC().toISO({ suppressMilliseconds: false }) as string
    );
  }
  return out;
}
