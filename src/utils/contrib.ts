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
  incomesByMemberCents: Record<string, number | undefined>
): { memberId: string; weight: number }[] {
  let sum = 0;
  const vals = members.map((id) => {
    const v = Math.max(0, Number(incomesByMemberCents[id] ?? 0));
    sum += v;
    return { memberId: id, v };
  });
  if (sum <= 0) {
    const eq = 1 / Math.max(1, members.length);
    return members.map((id) => ({ memberId: id, weight: eq }));
  }
  return vals.map((x) => ({ memberId: x.memberId, weight: x.v / sum }));
}

export function distribute(
  amountCents: number,
  dist: Dist,
  members: string[],
  incomeW: { memberId: string; weight: number }[]
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!amountCents) return out;

  if (dist.mode === "perMember") {
    out[dist.memberId] = (out[dist.memberId] ?? 0) + amountCents;
    return out;
  }
  if (dist.mode === "customSplit") {
    for (const s of normalizeCustomSplit(dist.customSplit || [])) {
      out[s.memberId] = (out[s.memberId] ?? 0) + Math.round(amountCents * s.weight);
    }
    return out;
  }
  const map: Record<string, number> = {};
  for (const w of incomeW) map[w.memberId] = w.weight;
  for (const id of members) {
    const w = map[id] ?? 0;
    out[id] = (out[id] ?? 0) + Math.round(amountCents * w);
  }
  return out;
}
