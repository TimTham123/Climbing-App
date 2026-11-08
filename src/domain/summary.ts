import { KEY_LIFTS, isMobilityExercise, romMetric } from '../data/library';
import { addDays, weekDates, weekdayIndex, type ISODate } from '../lib/dates';
import { mean } from '../lib/format';
import type {
  CheckIn,
  ChecklistLog,
  ClimbEntry,
  ClimbStyle,
  Grip,
  HangSession,
  MobilityLog,
  ProgrammeVersion,
  Project,
  RomMeasurement,
  Session,
} from '../db/types';
import { fingerLoadWeek, type FingerDay } from './fingerLoad';
import { isClimbingSession, programmeForDate, sessionClimbMinutes } from './session';

export interface SummaryInput {
  weekStart: ISODate;
  today: ISODate;
  programmes: ProgrammeVersion[];
  sessions: Session[];
  climbs: ClimbEntry[];
  hangs: HangSession[];
  mobility: MobilityLog[];
  rom: RomMeasurement[];
  checkins: CheckIn[];
  checklists?: ChecklistLog[];
  projects?: Project[];
}

export interface LiftBest {
  exerciseId: string;
  name: string;
  load: 'external' | 'bodyweight' | 'none';
  topWeight: number | null;
  topReps: number | null;
  totalReps: number;
  sets: number;
}

export interface ProjectWeek {
  projectId: string;
  name: string;
  grade: number | null;
  attempts: number;
  sessions: number;
  sent: boolean;
  bestHighPoint: number | null;
  totalMoves: number | null;
}

export interface RomChange {
  metric: string;
  label: string;
  unit: string;
  side: 'L' | 'R' | null;
  value: number;
  previous: number | null;
  better: 'higher' | 'lower';
}

export interface WeeklySummary {
  weekStart: ISODate;
  weekEnd: ISODate;
  isCurrentWeek: boolean;
  consistency: {
    planned: number;
    plannedToDate: number;
    completed: number;
    inProgress: number;
    skipped: number;
    trainingMinutes: number;
    exercisesPlanned: number;
    exercisesDone: number;
    completionPct: number | null;
    climbingSessions: number;
    walks: number;
  };
  strength: LiftBest[];
  climbing: {
    problems: number;
    sends: number;
    attempts: number;
    topSent: number | null;
    topAttempted: number | null;
    minutes: number;
    byStyle: Partial<Record<ClimbStyle, { problems: number; sends: number }>>;
    board: { problems: number; sends: number; topSent: number | null; angles: number[] };
    projects: ProjectWeek[];
  };
  fingers: {
    hangSessions: number;
    grips: Grip[];
    hangSets: number;
    hangSeconds: number;
    blocks: Array<{ date: ISODate; grip: Grip; edgeMm: number | null; hangSec: number; sets: number; loadMode: string; loadKg: number; feetAssisted: boolean }>;
    days: FingerDay[];
    loadedDays: number;
  };
  mobility: {
    days: number;
    standalone: number;
    inSessions: number;
    warmupsCompleted: number;
    rom: RomChange[];
  };
  recovery: {
    checkins: number;
    sleepHours: number | null;
    sleepQuality: number | null;
    energy: number | null;
    fatigue: number | null;
    finger: { avg: number | null; max: number | null };
    elbow: { avg: number | null; max: number | null };
    shoulder: { avg: number | null; max: number | null };
  };
}

const round1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

export function sessionMinutes(s: Session): number {
  if (s.durationMin != null) return s.durationMin;
  if (s.completedAt && s.startedAt && s.completedAt > s.startedAt) {
    return Math.min(360, Math.round((s.completedAt - s.startedAt) / 60000));
  }
  return 0;
}

export function weeklySummary(input: SummaryInput): WeeklySummary {
  const { weekStart, today } = input;
  const dates = weekDates(weekStart);
  const weekEnd = dates[6];
  const inWeek = (d: ISODate) => d >= weekStart && d <= weekEnd;

  // ---- Consistency
  let planned = 0;
  let plannedToDate = 0;
  for (const d of dates) {
    const v = programmeForDate(input.programmes, d);
    const day = v?.days.find((x) => x.weekday === weekdayIndex(d));
    if (day && !day.isRest) {
      planned += 1;
      if (d <= today) plannedToDate += 1;
    }
  }
  const sessions = input.sessions.filter((s) => inWeek(s.date));
  const training = sessions.filter((s) => s.kind !== 'walk');
  const completed = training.filter((s) => s.status === 'completed');
  const logged = training.filter((s) => s.status !== 'skipped');
  const programmeLogged = logged.filter((s) => s.kind === 'programme');
  const exercisesPlanned = programmeLogged.reduce((a, s) => a + s.items.filter((i) => !i.isExtra).length, 0);
  const exercisesDone = programmeLogged.reduce((a, s) => a + s.items.filter((i) => !i.isExtra && i.status === 'done').length, 0);
  const climbs = input.climbs.filter((c) => inWeek(c.date));
  const climbsBySession = new Map<string, number>();
  climbs.forEach((c) => c.sessionId && climbsBySession.set(c.sessionId, (climbsBySession.get(c.sessionId) ?? 0) + 1));

  // ---- Strength
  const strength: LiftBest[] = [];
  const liftIds = new Set<string>(KEY_LIFTS);
  logged.forEach((s) => s.items.forEach((i) => i.mode === 'reps' && i.load !== 'none' && liftIds.add(i.exerciseId)));
  liftIds.forEach((id) => {
    let best: LiftBest | null = null;
    for (const s of logged) {
      for (const i of s.items) {
        if (i.exerciseId !== id) continue;
        const done = i.sets.filter((x) => x.done && x.value != null);
        if (!done.length) continue;
        const b: LiftBest = best ?? { exerciseId: id, name: i.name, load: i.load, topWeight: null, topReps: null, totalReps: 0, sets: 0 };
        for (const set of done) {
          const w = i.load === 'none' ? null : set.weightKg ?? 0;
          const v = set.value ?? 0;
          if (b.topReps == null || (w ?? 0) > (b.topWeight ?? 0) || ((w ?? 0) === (b.topWeight ?? 0) && v > b.topReps)) {
            b.topWeight = w;
            b.topReps = v;
          }
          b.totalReps += v;
          b.sets += 1;
        }
        best = b;
      }
    }
    if (best) strength.push(best);
  });

  // ---- Climbing
  const sentGrades = climbs.filter((c) => c.sent && c.grade != null).map((c) => c.grade as number);
  const triedGrades = climbs.filter((c) => c.grade != null).map((c) => c.grade as number);
  const byStyle: WeeklySummary['climbing']['byStyle'] = {};
  climbs.forEach((c) => {
    const e = byStyle[c.style] ?? { problems: 0, sends: 0 };
    e.problems += 1;
    if (c.sent) e.sends += 1;
    byStyle[c.style] = e;
  });
  const boardClimbs = climbs.filter((c) => c.style === 'board' || /board|spray/i.test(c.wall));
  const boardSent = boardClimbs.filter((c) => c.sent && c.grade != null).map((c) => c.grade as number);
  const projectMap = new Map<string, ProjectWeek>();
  climbs
    .filter((c) => c.projectId)
    .forEach((c) => {
      const p = input.projects?.find((x) => x.id === c.projectId);
      const e =
        projectMap.get(c.projectId!) ??
        ({
          projectId: c.projectId!,
          name: p?.name ?? c.name ?? 'Project',
          grade: p?.grade ?? c.grade,
          attempts: 0,
          sessions: 0,
          sent: false,
          bestHighPoint: null,
          totalMoves: p?.totalMoves ?? null,
        } as ProjectWeek);
      e.attempts += c.attempts;
      e.sessions += 1;
      e.sent = e.sent || c.sent;
      if (c.highPoint != null) e.bestHighPoint = Math.max(e.bestHighPoint ?? 0, c.highPoint);
      projectMap.set(c.projectId!, e);
    });

  // ---- Fingers
  const hangs = input.hangs.filter((h) => inWeek(h.date));
  const fingerDays = fingerLoadWeek({ weekStart, programmes: input.programmes, sessions: input.sessions, climbs: input.climbs, hangs: input.hangs });
  const grips = new Set<Grip>();
  const blocks: WeeklySummary['fingers']['blocks'] = [];
  hangs.forEach((h) =>
    h.blocks.forEach((b) => {
      grips.add(b.grip);
      blocks.push({ date: h.date, grip: b.grip, edgeMm: b.edgeMm ?? null, hangSec: b.hangSec, sets: b.sets, loadMode: b.loadMode, loadKg: b.loadKg, feetAssisted: b.feetAssisted });
    }),
  );

  // ---- Mobility
  const mob = input.mobility.filter((m) => inWeek(m.date));
  const mobilityDays = new Set<ISODate>(mob.map((m) => m.date));
  let inSessions = 0;
  logged.forEach((s) => {
    const n = s.items.filter((i) => i.status === 'done' && isMobilityExercise(i.exerciseId)).length;
    inSessions += n;
    if (n) mobilityDays.add(s.date);
  });
  const warmupsCompleted = (input.checklists ?? []).filter((c) => inWeek(c.date) && c.kind === 'warmup' && c.done.length > 0).length;
  const romInWeek = input.rom.filter((r) => inWeek(r.date));
  const romChanges: RomChange[] = [];
  const seen = new Set<string>();
  [...romInWeek]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .forEach((r) => {
      const key = `${r.metric}:${r.side ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      const prev = input.rom
        .filter((x) => x.metric === r.metric && (x.side ?? null) === (r.side ?? null) && x.date < weekStart)
        .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      const def = romMetric(r.metric);
      romChanges.push({
        metric: r.metric,
        label: def?.label ?? r.metric,
        unit: def?.unit ?? '',
        side: r.side ?? null,
        value: r.value,
        previous: prev ? prev.value : null,
        better: def?.better ?? 'higher',
      });
    });

  // ---- Recovery
  const cks = input.checkins.filter((c) => inWeek(c.date));
  const vals = (k: keyof CheckIn) => cks.map((c) => c[k]).filter((v): v is number => typeof v === 'number');
  const region = (k: 'finger' | 'elbow' | 'shoulder') => {
    const v = vals(k);
    return { avg: round1(mean(v)), max: v.length ? Math.max(...v) : null };
  };

  return {
    weekStart,
    weekEnd,
    isCurrentWeek: today >= weekStart && today <= weekEnd,
    consistency: {
      planned,
      plannedToDate,
      completed: completed.length,
      inProgress: training.filter((s) => s.status === 'in_progress').length,
      skipped: training.filter((s) => s.status === 'skipped').length,
      trainingMinutes: completed.reduce((a, s) => a + sessionMinutes(s), 0),
      exercisesPlanned,
      exercisesDone,
      completionPct: exercisesPlanned ? Math.round((exercisesDone / exercisesPlanned) * 100) : null,
      climbingSessions: completed.filter((s) => isClimbingSession(s, climbsBySession.get(s.id) ?? 0)).length,
      walks: sessions.filter((s) => s.kind === 'walk').length,
    },
    strength,
    climbing: {
      problems: climbs.length,
      sends: climbs.filter((c) => c.sent).length,
      attempts: climbs.reduce((a, c) => a + c.attempts, 0),
      topSent: sentGrades.length ? Math.max(...sentGrades) : null,
      topAttempted: triedGrades.length ? Math.max(...triedGrades) : null,
      minutes: logged.reduce((a, s) => a + sessionClimbMinutes(s), 0),
      byStyle,
      board: {
        problems: boardClimbs.length,
        sends: boardClimbs.filter((c) => c.sent).length,
        topSent: boardSent.length ? Math.max(...boardSent) : null,
        angles: Array.from(new Set(boardClimbs.map((c) => c.angle).filter((a): a is number => a != null))).sort((a, b) => a - b),
      },
      projects: Array.from(projectMap.values()),
    },
    fingers: {
      hangSessions: hangs.length,
      grips: Array.from(grips),
      hangSets: blocks.reduce((a, b) => a + b.sets, 0),
      hangSeconds: blocks.reduce((a, b) => a + b.sets * b.hangSec, 0),
      blocks,
      days: fingerDays,
      loadedDays: fingerDays.filter((d) => d.loaded).length,
    },
    mobility: {
      days: mobilityDays.size,
      standalone: mob.length,
      inSessions,
      warmupsCompleted,
      rom: romChanges,
    },
    recovery: {
      checkins: cks.length,
      sleepHours: round1(mean(vals('sleepHours'))),
      sleepQuality: round1(mean(vals('sleepQuality'))),
      energy: round1(mean(vals('energy'))),
      fatigue: round1(mean(vals('fatigue'))),
      finger: region('finger'),
      elbow: region('elbow'),
      shoulder: region('shoulder'),
    },
  };
}

/** Week starts (Mondays) ending with `lastWeekStart`, oldest first. */
export function weekStarts(lastWeekStart: ISODate, count: number): ISODate[] {
  return Array.from({ length: count }, (_, i) => addDays(lastWeekStart, -7 * (count - 1 - i)));
}

export function weeklySeries(input: Omit<SummaryInput, 'weekStart'>, starts: ISODate[]): WeeklySummary[] {
  return starts.map((weekStart) => weeklySummary({ ...input, weekStart }));
}

/** Earliest date with any training data, used to bound history charts. */
export function firstDataDate(input: Pick<SummaryInput, 'sessions' | 'climbs' | 'hangs' | 'checkins' | 'mobility'>): ISODate | null {
  const dates = [
    ...input.sessions.map((s) => s.date),
    ...input.climbs.map((c) => c.date),
    ...input.hangs.map((h) => h.date),
    ...input.checkins.map((c) => c.date),
    ...input.mobility.map((m) => m.date),
  ].sort();
  return dates[0] ?? null;
}
