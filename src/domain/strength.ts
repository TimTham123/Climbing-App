import type { ISODate } from '../lib/dates';
import type { LoadType, Session, SessionItem, SetLog } from '../db/types';

export interface ExercisePoint {
  date: ISODate;
  sessionId: string;
  load: LoadType;
  mode: SessionItem['mode'];
  sets: SetLog[];
  /** Heaviest load used on a completed set (added kg for bodyweight lifts) */
  topWeight: number | null;
  /** Most reps on a set at the top weight */
  topReps: number | null;
  totalReps: number;
  /** Σ reps × kg for external loads; null for bodyweight/unloaded work */
  volumeKg: number | null;
  deload: boolean;
  target: SessionItem['target'];
}

/** Every session where the exercise had at least one completed set, oldest first. */
export function exerciseHistory(sessions: Session[], exerciseId: string): ExercisePoint[] {
  const points: ExercisePoint[] = [];
  for (const s of sessions) {
    if (s.status === 'skipped') continue;
    for (const item of s.items) {
      if (item.exerciseId !== exerciseId || item.status === 'skipped') continue;
      const done = item.sets.filter((x) => x.done && x.value != null);
      if (!done.length) continue;
      const weights = done.map((x) => x.weightKg ?? 0);
      const topWeight = item.load === 'none' ? null : Math.max(...weights);
      const atTop = topWeight == null ? done : done.filter((x) => (x.weightKg ?? 0) === topWeight);
      const topReps = Math.max(...atTop.map((x) => x.value ?? 0));
      const totalReps = done.reduce((a, x) => a + (x.value ?? 0), 0);
      const volumeKg = item.load === 'external' ? done.reduce((a, x) => a + (x.value ?? 0) * (x.weightKg ?? 0), 0) : null;
      points.push({
        date: s.date,
        sessionId: s.id,
        load: item.load,
        mode: item.mode,
        sets: done,
        topWeight,
        topReps,
        totalReps,
        volumeKg,
        deload: s.deload,
        target: item.target,
      });
    }
  }
  return points.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
}

/** Exercise ids that appear with logged sets in any session. */
export function loggedExercises(sessions: Session[]): Array<{ exerciseId: string; name: string; count: number }> {
  const map = new Map<string, { exerciseId: string; name: string; count: number }>();
  for (const s of sessions) {
    for (const i of s.items) {
      if ((i.mode !== 'reps' && i.mode !== 'time') || !i.sets.some((x) => x.done)) continue;
      const e = map.get(i.exerciseId) ?? { exerciseId: i.exerciseId, name: i.name, count: 0 };
      e.count += 1;
      map.set(i.exerciseId, e);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

/** The most recent logged sets for an exercise, excluding one session (the one being built or edited). */
export function lastSetsFor(sessions: Session[], exerciseId: string, excludeSessionId?: string): { date: ISODate; sets: SetLog[]; item: SessionItem } | null {
  const ordered = [...sessions].sort((a, b) => (a.date === b.date ? b.startedAt - a.startedAt : a.date < b.date ? 1 : -1));
  for (const s of ordered) {
    if (s.id === excludeSessionId || s.status === 'skipped') continue;
    const item = s.items.find((i) => i.exerciseId === exerciseId && i.sets.some((x) => x.done));
    if (item) return { date: s.date, sets: item.sets.filter((x) => x.done), item };
  }
  return null;
}
