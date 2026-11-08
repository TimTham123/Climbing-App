import { addDays, type ISODate } from '../lib/dates';
import { mean } from '../lib/format';
import type { CheckIn, HangSession, Session } from '../db/types';
import { sessionCompletion } from './session';

export type Region = 'finger' | 'elbow' | 'shoulder';
export const REGION_LABELS: Record<Region, string> = { finger: 'Finger', elbow: 'Elbow', shoulder: 'Shoulder' };

export interface DiscomfortFlag {
  region: Region;
  level: 'rising' | 'high';
  values: Array<{ date: ISODate; value: number }>;
  message: string;
}

const LOAD_ADVICE: Record<Region, string> = {
  finger: 'Consider reducing or modifying finger loading: easier grades, larger holds, fewer limit attempts, and no hangboarding until it settles.',
  elbow: 'Consider reducing or modifying pulling and steep climbing volume until it settles.',
  shoulder: 'Consider reducing or modifying overhead, pressing and dynamic shoulder loading until it settles.',
};

/** Recent check-in values for a region, oldest first, within `days` of `today`. */
export function regionSeries(checkins: CheckIn[], region: Region, today: ISODate, days = 14): Array<{ date: ISODate; value: number }> {
  const from = addDays(today, -days + 1);
  return checkins
    .filter((c) => c.date >= from && c.date <= today && c[region] != null)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((c) => ({ date: c.date, value: c[region] as number }));
}

/**
 * Flags when discomfort is high (≥ 5/10) or rising: the last three readings
 * strictly increase and the latest is at least 3/10, or the latest is at least
 * 2 points above the average of the earlier readings in the window.
 * The latest reading must be from the last 3 days to raise a flag.
 */
export function discomfortFlags(checkins: CheckIn[], today: ISODate, hangs: HangSession[] = []): DiscomfortFlag[] {
  const flags: DiscomfortFlag[] = [];
  (['finger', 'elbow', 'shoulder'] as Region[]).forEach((region) => {
    const series = regionSeries(checkins, region, today);
    if (!series.length) return;
    const latest = series[series.length - 1];
    if (latest.date < addDays(today, -2)) return;
    const label = REGION_LABELS[region];
    const tail = series.slice(-3);
    const trail = tail.map((p) => p.value).join(' → ');
    if (latest.value >= 5) {
      flags.push({
        region,
        level: 'high',
        values: series,
        message: `${label} discomfort logged at ${latest.value}/10. ${LOAD_ADVICE[region]}`,
      });
      return;
    }
    const earlier = series.slice(0, -1).map((p) => p.value);
    const rising3 = tail.length === 3 && tail[0].value < tail[1].value && tail[1].value < tail[2].value && latest.value >= 3;
    const avg = mean(earlier);
    const jump = earlier.length >= 2 && avg != null && latest.value >= 3 && latest.value - avg >= 2;
    if (rising3 || jump) {
      flags.push({
        region,
        level: 'rising',
        values: series,
        message: `${label} discomfort is rising (${rising3 ? trail : `${Math.round(avg! * 10) / 10} avg → ${latest.value}`}). ${LOAD_ADVICE[region]}`,
      });
    }
  });

  // Discomfort recorded during a hangboard session in the last 3 days
  const recentHang = hangs
    .filter((h) => h.date >= addDays(today, -2) && h.date <= today)
    .flatMap((h) => h.blocks.map((b) => ({ date: h.date, value: b.discomfort ?? 0 })))
    .filter((x) => x.value >= 4);
  if (recentHang.length && !flags.some((f) => f.region === 'finger')) {
    const worst = recentHang.reduce((a, b) => (b.value > a.value ? b : a));
    flags.push({
      region: 'finger',
      level: worst.value >= 5 ? 'high' : 'rising',
      values: recentHang,
      message: `Finger discomfort of ${worst.value}/10 was logged during a hangboard session. ${LOAD_ADVICE.finger}`,
    });
  }
  return flags;
}

export const NOT_A_DIAGNOSIS =
  'This is a prompt based on your own entries, not a diagnosis. Avoid training through pain. If discomfort persists or worsens, consider seeing a physiotherapist or doctor.';

/* ------------------------------------------------------------------ */
/* Recovery vs performance                                             */
/* ------------------------------------------------------------------ */

export function isPoorRecovery(c: CheckIn): boolean {
  return (c.sleepHours != null && c.sleepHours < 6) || (c.energy != null && c.energy <= 2) || (c.fatigue != null && c.fatigue >= 4);
}

export interface RecoveryGroup {
  sessions: number;
  completionPct: number | null;
  avgRpe: number | null;
}

export interface RecoveryComparison {
  poor: RecoveryGroup;
  other: RecoveryGroup;
  paired: number;
}

/** Compares completed/in-progress programme sessions on poor-recovery days against other days. */
export function recoveryVsPerformance(checkins: CheckIn[], sessions: Session[]): RecoveryComparison {
  const byDate = new Map(checkins.map((c) => [c.date, c]));
  const poor: Session[] = [];
  const other: Session[] = [];
  for (const s of sessions) {
    if (s.kind !== 'programme' || s.status === 'skipped') continue;
    const c = byDate.get(s.date);
    if (!c) continue;
    (isPoorRecovery(c) ? poor : other).push(s);
  }
  const group = (list: Session[]): RecoveryGroup => {
    const comps = list.map((s) => sessionCompletion(s).pct).filter((p): p is number => p != null);
    const rpes = list.map((s) => s.rpe).filter((r): r is number => r != null);
    const c = mean(comps);
    const r = mean(rpes);
    return {
      sessions: list.length,
      completionPct: c == null ? null : Math.round(c),
      avgRpe: r == null ? null : Math.round(r * 10) / 10,
    };
  };
  return { poor: group(poor), other: group(other), paired: poor.length + other.length };
}
