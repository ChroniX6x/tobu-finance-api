export const round1 = (x: number): number => Math.round(x * 10) / 10;

export const linRegForecastNext = (series: number[]): number => {
  const n = series.length;
  if (n < 3) {
    const deltas = series.slice(1).map((v, i) => v - series[i]);
    const avg = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
    return Math.round((series[n - 1] ?? 0) + avg);
  }
  const xs = Array.from({ length: n }, (_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = series.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * series[i], 0);
  const sumX2 = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sumX2 - sumX * sumX || 1;
  const a = (n * sumXY - sumX * sumY) / denom;
  const b = (sumY - a * sumX) / n;
  return Math.round(a * n + b);
};
