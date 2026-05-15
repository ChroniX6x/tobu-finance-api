/**
 * Returns true when two month-anchor time ranges overlap (inclusive on both ends).
 * null fromMonth = −∞, null toMonth = +∞.
 */
export function monthRangesOverlap(
  a: { fromMonth: Date | null; toMonth: Date | null },
  b: { fromMonth: Date | null; toMonth: Date | null }
): boolean {
  // a.start ≤ b.end  AND  b.start ≤ a.end
  const aStartLteBEnd = a.fromMonth == null || b.toMonth == null || a.fromMonth <= b.toMonth;
  const bStartLteAEnd = b.fromMonth == null || a.toMonth == null || b.fromMonth <= a.toMonth;
  return aStartLteBEnd && bStartLteAEnd;
}
