/** V-scale grades. Stored as numbers: -1 = VB, 0 = V0, 1 = V1 ... */
export const GRADES: number[] = Array.from({ length: 16 }, (_, i) => i - 1); // VB..V14

export function gradeLabel(g: number | null | undefined): string {
  if (g == null || !isFinite(g)) return '—';
  return g < 0 ? 'VB' : `V${g}`;
}

export function parseGrade(s: string): number | null {
  const t = s.trim().toUpperCase();
  if (t === 'VB') return -1;
  const m = /^V?(\d{1,2})$/.exec(t);
  return m ? Number(m[1]) : null;
}
