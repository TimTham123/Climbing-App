/**
 * Gym colour grades, easiest to hardest. Stored as numbers (0 = yellow ... 7 = white)
 * so sorting, "highest grade" and charts work on the order.
 */
export const GRADE_COLOURS = [
  { name: 'Yellow', swatch: '#e8c33a' },
  { name: 'Blue', swatch: '#3987e5' },
  { name: 'Purple', swatch: '#9461de' },
  { name: 'Green', swatch: '#2f9a2f' },
  { name: 'Orange', swatch: '#e57a26' },
  { name: 'Red', swatch: '#d94141' },
  { name: 'Black', swatch: '#0b0b0b' },
  { name: 'White', swatch: '#f4f3ef' },
] as const;

export const GRADES: number[] = GRADE_COLOURS.map((_, i) => i);
export const MAX_GRADE = GRADE_COLOURS.length - 1;

/** Clamp any stored number (e.g. older V-grade data) onto the colour scale. */
export function normaliseGrade(g: number | null | undefined): number | null {
  if (g == null || !isFinite(g)) return null;
  return Math.min(MAX_GRADE, Math.max(0, Math.round(g)));
}

export function gradeLabel(g: number | null | undefined): string {
  const n = normaliseGrade(g);
  return n == null ? '—' : GRADE_COLOURS[n].name;
}

export function gradeSwatch(g: number | null | undefined): string | null {
  const n = normaliseGrade(g);
  return n == null ? null : GRADE_COLOURS[n].swatch;
}

export function parseGrade(s: string): number | null {
  const i = GRADE_COLOURS.findIndex((c) => c.name.toLowerCase() === s.trim().toLowerCase());
  return i >= 0 ? i : null;
}
