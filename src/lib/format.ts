export function fmtNum(n: number | null | undefined, digits = 1): string {
  if (n == null || !isFinite(n)) return '—';
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return String(r);
}

export function fmtKg(kg: number | null | undefined, load: 'external' | 'bodyweight' | 'none' = 'external'): string {
  if (load === 'none') return '';
  if (load === 'bodyweight') {
    if (!kg) return 'BW';
    return kg > 0 ? `BW+${fmtNum(kg, 2)} kg` : `BW${fmtNum(kg, 2)} kg`;
  }
  if (kg == null) return '— kg';
  return `${fmtNum(kg, 2)} kg`;
}

export function pct(part: number, whole: number): number | null {
  if (!whole) return null;
  return Math.round((part / whole) * 100);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
