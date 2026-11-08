import { isMobilityExercise } from '../data/library';
import { clone, uid } from '../lib/id';
import type { ISODate } from '../lib/dates';
import type {
  DayPlan,
  ItemMode,
  LoadType,
  PlanItem,
  Prescription,
  ProgrammeVersion,
  Session,
  SessionItem,
  SetLog,
} from '../db/types';

/* ------------------------------------------------------------------ */
/* Programme lookup                                                    */
/* ------------------------------------------------------------------ */

/** The programme version in force on a date (latest effectiveFrom <= date). */
export function programmeForDate(versions: ProgrammeVersion[], date: ISODate): ProgrammeVersion | null {
  if (!versions.length) return null;
  const sorted = [...versions].sort((a, b) =>
    a.effectiveFrom === b.effectiveFrom ? a.createdAt - b.createdAt : a.effectiveFrom < b.effectiveFrom ? -1 : 1,
  );
  let found: ProgrammeVersion | null = null;
  for (const v of sorted) if (v.effectiveFrom <= date) found = v;
  return found ?? sorted[0];
}

/* ------------------------------------------------------------------ */
/* Prescription text                                                   */
/* ------------------------------------------------------------------ */

function range(min?: number | null, max?: number | null): string {
  if (min == null && max == null) return '';
  if (min != null && max != null && max !== min) return `${min}–${max}`;
  return String(min ?? max);
}

export function unitFor(mode: ItemMode): string {
  switch (mode) {
    case 'time':
      return 's';
    case 'count':
      return 'climbs';
    case 'climb':
      return 'min';
    default:
      return 'reps';
  }
}

/** "3 × 5–8", "2 × 30 s each side", "3 climbs", "50–60 min" */
export function formatRx(rx: Prescription | null | undefined, mode: ItemMode): string {
  if (!rx) return '';
  const amount = range(rx.min, rx.max);
  const per = rx.per ? ` ${rx.per}` : '';
  if (mode === 'check') return rx.note ?? '';
  if (mode === 'count') return amount ? `${amount} climbs` : rx.note ?? '';
  if (mode === 'climb') return amount ? `${amount} min` : rx.note ?? '';
  const sets = rx.setsMax && rx.setsMax !== rx.sets ? `${rx.sets}–${rx.setsMax}` : String(rx.sets);
  if (!amount) return rx.note ?? `${sets} sets`;
  return `${sets} × ${amount}${mode === 'time' ? ' s' : ''}${per}`;
}

export function rxEqual(a: Prescription | null | undefined, b: Prescription | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return (
    a.sets === b.sets &&
    (a.setsMax ?? null) === (b.setsMax ?? null) &&
    (a.min ?? null) === (b.min ?? null) &&
    (a.max ?? null) === (b.max ?? null) &&
    (a.per ?? null) === (b.per ?? null) &&
    (a.note ?? null) === (b.note ?? null)
  );
}

/* ------------------------------------------------------------------ */
/* Deload                                                              */
/* ------------------------------------------------------------------ */

/** Items whose volume is reduced in a deload week. Mobility, drills and checks stay as written. */
export function isDeloadable(item: Pick<PlanItem, 'mode' | 'exerciseId'>): boolean {
  if (item.mode === 'climb') return true;
  if (item.mode === 'reps' || item.mode === 'time') return !isMobilityExercise(item.exerciseId);
  return false;
}

/**
 * Reduce volume by roughly `pct` percent. Three or more sets lose sets; two-set
 * items keep their sets and lose reps; climbing blocks lose minutes.
 */
export function deloadRx(rx: Prescription, mode: ItemMode, pct: number): Prescription {
  const f = Math.max(0, Math.min(90, pct)) / 100;
  const out = clone(rx);
  const shrink = (n: number | null | undefined) => (n == null ? n : Math.max(1, Math.round(n * (1 - f))));
  if (mode === 'climb') {
    out.min = shrink(rx.min);
    out.max = shrink(rx.max);
    return out;
  }
  if (rx.sets >= 3) {
    out.sets = Math.max(1, Math.round(rx.sets * (1 - f)));
    out.setsMax = rx.setsMax ? Math.max(out.sets, Math.round(rx.setsMax * (1 - f))) : null;
  } else {
    out.min = shrink(rx.min);
    out.max = shrink(rx.max);
    if (out.min != null && out.max != null && out.max < out.min) out.max = out.min;
  }
  return out;
}

/** Planned volume (sets × reps or seconds or minutes) used to verify the deload size. */
export function rxVolume(rx: Prescription, mode: ItemMode): number {
  const amount = rx.max != null && rx.min != null ? (rx.min + rx.max) / 2 : rx.min ?? rx.max ?? 0;
  if (mode === 'climb') return amount;
  return rx.sets * amount;
}

/* ------------------------------------------------------------------ */
/* Building sessions                                                   */
/* ------------------------------------------------------------------ */

export interface PrefillSource {
  /** Last logged sets for an exercise (most recent session first) */
  lastSets?: (exerciseId: string) => SetLog[] | null;
  /** A confirmed load target for an exercise, if any */
  loadTarget?: (exerciseId: string) => number | null;
}

export function emptySet(value: number | null, weightKg: number | null): SetLog {
  return { id: uid('set_'), value, weightKg, rir: null, done: false };
}

/** Default number for the next set: the bottom of the range (reps/time) or 1 (count). */
export function defaultValue(target: Prescription, mode: ItemMode): number | null {
  if (mode === 'count') return 1;
  if (mode === 'reps' || mode === 'time') return target.min ?? target.max ?? null;
  return null;
}

export function plannedSetCount(target: Prescription, mode: ItemMode): number {
  if (mode === 'count') return target.min ?? 1;
  if (mode === 'reps' || mode === 'time') return Math.max(1, target.sets);
  return 0;
}

export function buildItem(plan: PlanItem, target: Prescription, prefill: PrefillSource = {}): SessionItem {
  const last = prefill.lastSets?.(plan.exerciseId) ?? null;
  const confirmed = prefill.loadTarget?.(plan.exerciseId) ?? null;
  const lastWeight = last?.find((s) => s.done && s.weightKg != null)?.weightKg ?? null;
  const weight = plan.load === 'none' ? null : confirmed ?? lastWeight ?? (plan.load === 'bodyweight' ? 0 : null);
  const count = plannedSetCount(target, plan.mode);
  const value = defaultValue(target, plan.mode);
  return {
    id: uid('itm_'),
    planItemId: plan.id,
    exerciseId: plan.exerciseId,
    name: plan.name,
    section: plan.section,
    mode: plan.mode,
    load: plan.load,
    prescribed: clone(plan.rx),
    target: clone(target),
    targetModified: false,
    status: 'pending',
    sets: Array.from({ length: plan.mode === 'count' ? 0 : count }, () => emptySet(value, weight)),
    restSec: plan.restSec ?? null,
    climbStyle: plan.climbStyle ?? null,
    minutes: null,
    substitutedFor: null,
    isExtra: false,
    difficulty: null,
    notes: null,
  };
}

export interface BuildSessionOptions {
  date: ISODate;
  plannedDate?: ISODate | null;
  versionId?: string | null;
  deload?: boolean;
  deloadPct?: number;
  blockWeek?: number | null;
  prefill?: PrefillSource;
  now?: number;
}

export function buildSession(day: DayPlan, opts: BuildSessionOptions): Session {
  const now = opts.now ?? Date.now();
  const deload = !!opts.deload;
  const items = day.items.map((p) => {
    const target = deload && isDeloadable(p) ? deloadRx(p.rx, p.mode, opts.deloadPct ?? 35) : clone(p.rx);
    return buildItem(p, target, opts.prefill);
  });
  return {
    id: uid('ses_'),
    date: opts.date,
    plannedDate: opts.plannedDate ?? opts.date,
    weekday: day.weekday,
    programmeVersionId: opts.versionId ?? null,
    kind: 'programme',
    title: day.title,
    category: day.category,
    status: 'in_progress',
    startedAt: now,
    completedAt: null,
    durationMin: null,
    rpe: null,
    notes: null,
    deload,
    blockWeek: opts.blockWeek ?? null,
    company: null,
    items,
    updatedAt: now,
  };
}

export function newExtraItem(input: {
  exerciseId: string;
  name: string;
  mode: ItemMode;
  load: LoadType;
  rx: Prescription;
  section?: string;
  climbStyle?: SessionItem['climbStyle'];
}): SessionItem {
  const count = plannedSetCount(input.rx, input.mode);
  const value = defaultValue(input.rx, input.mode);
  return {
    id: uid('itm_'),
    planItemId: null,
    exerciseId: input.exerciseId,
    name: input.name,
    section: input.section ?? 'Added',
    mode: input.mode,
    load: input.load,
    prescribed: null,
    target: clone(input.rx),
    targetModified: false,
    status: 'pending',
    sets: Array.from({ length: input.mode === 'count' ? 0 : count }, () =>
      emptySet(value, input.load === 'bodyweight' ? 0 : null),
    ),
    restSec: null,
    climbStyle: input.climbStyle ?? null,
    minutes: null,
    substitutedFor: null,
    isExtra: true,
    difficulty: null,
    notes: null,
  };
}

/* ------------------------------------------------------------------ */
/* Completion                                                          */
/* ------------------------------------------------------------------ */

export function doneSets(item: SessionItem): SetLog[] {
  return item.sets.filter((s) => s.done);
}

/** How many sets/climbs the target asks for. */
export function targetCount(item: SessionItem): number {
  return plannedSetCount(item.target, item.mode);
}

/** True when the logged work meets the target, so the item can be marked done automatically. */
export function meetsTarget(item: SessionItem): boolean {
  if (item.mode === 'reps' || item.mode === 'time') return doneSets(item).length >= targetCount(item);
  if (item.mode === 'count') {
    const climbs = doneSets(item).reduce((a, s) => a + (s.value ?? 0), 0);
    return climbs >= targetCount(item);
  }
  return false;
}

export interface Completion {
  planned: number;
  done: number;
  skipped: number;
  pending: number;
  extra: number;
  pct: number | null;
}

/** Programme items completed vs planned. Extra (added) items are reported separately. */
export function sessionCompletion(session: Pick<Session, 'items'>): Completion {
  const planned = session.items.filter((i) => !i.isExtra);
  const done = planned.filter((i) => i.status === 'done').length;
  const skipped = planned.filter((i) => i.status === 'skipped').length;
  return {
    planned: planned.length,
    done,
    skipped,
    pending: planned.length - done - skipped,
    extra: session.items.filter((i) => i.isExtra && i.status === 'done').length,
    pct: planned.length ? Math.round((done / planned.length) * 100) : null,
  };
}

/** Short text of what was logged: "6 · 6 · 5 @ BW" */
export function loggedSummary(item: SessionItem): string {
  const sets = doneSets(item);
  if (item.mode === 'check') return item.status === 'done' ? 'Done' : '';
  if (item.mode === 'climb') return item.minutes ? `${item.minutes} min` : '';
  if (item.mode === 'count') {
    const n = sets.reduce((a, s) => a + (s.value ?? 0), 0);
    return n ? `${n} climbs` : '';
  }
  if (!sets.length) return '';
  const values = sets.map((s) => (s.value == null ? '—' : String(s.value))).join(' · ');
  const unit = item.mode === 'time' ? ' s' : '';
  if (item.load === 'none') return `${values}${unit}`;
  const weights = Array.from(new Set(sets.map((s) => s.weightKg ?? 0)));
  const w =
    weights.length === 1
      ? item.load === 'bodyweight'
        ? weights[0]
          ? `BW+${weights[0]} kg`
          : 'BW'
        : `${weights[0]} kg`
      : 'mixed load';
  return `${values}${unit} @ ${w}`;
}

/** Minutes of climbing recorded in a session's climb blocks. */
export function sessionClimbMinutes(session: Pick<Session, 'items'>): number {
  return session.items.filter((i) => i.mode === 'climb').reduce((a, i) => a + (i.minutes ?? 0), 0);
}

/** A session counts as a climbing session if a climb block has time logged or is marked done. */
export function isClimbingSession(session: Pick<Session, 'items'>, climbCount = 0): boolean {
  return climbCount > 0 || session.items.some((i) => i.mode === 'climb' && (i.status === 'done' || (i.minutes ?? 0) > 0));
}
