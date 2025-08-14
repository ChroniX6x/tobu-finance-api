/** YYYY-MM -> Date (UTC, 1. des Monats, 00:00:00) */
export function toMonthDate(yyyyMM: string): Date {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(yyyyMM);
  if (!m) throw new Error("Month must be YYYY-MM");
  const y = Number(m[1]); const mon = Number(m[2]) - 1;
  return new Date(Date.UTC(y, mon, 1, 0, 0, 0, 0));
}
