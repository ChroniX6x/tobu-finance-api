export type Dist =
  | { mode: "perMember"; memberId: string }
  | { mode: "customSplit"; customSplit: { memberId: string; split: number }[] }
  | { mode: "proRataIncome" };

export function normalizeCustomSplit(
  arr: { memberId: string; split: number }[]
): { memberId: string; weight: number }[] {
  const total = arr.reduce((a, b) => a + (Number(b.split) || 0), 0) || 1;
  return arr.map((x) => ({ memberId: x.memberId, weight: (Number(x.split) || 0) / total }));
}

export function incomeWeights(
  members: string[],
  incomesByMemberMinor: Record<string, number | undefined>
): { memberId: string; weight: number }[] {
  let sum = 0;
  const vals = members.map((id) => {
    const v = Math.max(0, Number(incomesByMemberMinor[id] ?? 0));
    sum += v;
    return { memberId: id, v };
  });
  if (sum <= 0) {
    const eq = 1 / Math.max(1, members.length);
    return members.map((id) => ({ memberId: id, weight: eq }));
  }
  return vals.map((x) => ({ memberId: x.memberId, weight: x.v / sum }));
}

/**
 * Distributes `amountMinor` cents across members using the largest-remainder
 * (Hamilton) method, ensuring sum(result) === amountMinor exactly.
 * This prevents rounding drift (e.g. 10001 / 3 = 3334+3334+3334 = 10002 with
 * naive Math.round) which would cause KPI totals to silently diverge.
 */
function largestRemainder(
  amountMinor: number,
  weights: { memberId: string; weight: number }[]
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!amountMinor || !weights.length) return out;

  let distributed = 0;
  const parts = weights.map((w) => {
    const exact = amountMinor * w.weight;
    const floor = Math.floor(exact);
    distributed += floor;
    return { memberId: w.memberId, floor, frac: exact - floor };
  });

  // Assign floor values
  for (const p of parts) out[p.memberId] = (out[p.memberId] ?? 0) + p.floor;

  // Distribute remaining cents to members with the largest fractional parts
  let remaining = amountMinor - distributed;
  const sorted = [...parts].sort((a, b) => b.frac - a.frac);
  for (let i = 0; remaining > 0; i++, remaining--) {
    const s = sorted[i % sorted.length];
    if (s) out[s.memberId] = (out[s.memberId] ?? 0) + 1;
  }

  return out;
}

export function distribute(
  amountMinor: number,
  dist: Dist,
  members: string[],
  incomeW: { memberId: string; weight: number }[]
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!amountMinor) return out;

  if (dist.mode === "perMember") {
    out[dist.memberId] = (out[dist.memberId] ?? 0) + amountMinor;
    return out;
  }

  if (dist.mode === "customSplit") {
    const weights = normalizeCustomSplit(dist.customSplit || []);
    const partial = largestRemainder(amountMinor, weights);
    for (const [k, v] of Object.entries(partial)) out[k] = (out[k] ?? 0) + v;
    return out;
  }

  // proRataIncome: use income weights
  const weights = members.map((id) => ({
    memberId: id,
    weight: incomeW.find((w) => w.memberId === id)?.weight ?? 0,
  }));
  const partial = largestRemainder(amountMinor, weights);
  for (const [k, v] of Object.entries(partial)) out[k] = (out[k] ?? 0) + v;
  return out;
}
