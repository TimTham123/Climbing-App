import { describe, expect, it } from 'vitest';
import { buildDefaultProgramme } from '../../src/data/programme';
import { buildSession } from '../../src/domain/session';
import { weeklySummary, weeklySeries, weekStarts } from '../../src/domain/summary';
import { fingerLoadWeek } from '../../src/domain/fingerLoad';
import { generateSampleData } from '../../src/data/sampleData';
import { defaultHangTemplate } from '../../src/data/defaults';
import type { CheckIn, ClimbEntry, HangSession, MobilityLog, ProgrammeVersion, Session } from '../../src/db/types';

const days = buildDefaultProgramme();
const programmes: ProgrammeVersion[] = [{ id: 'p1', effectiveFrom: '2000-01-01', createdAt: 0, label: 'Original', days }];

function done(s: Session, id: string, sets: Array<[number, number | null]> = []) {
  const it = s.items.find((i) => i.exerciseId === id)!;
  if (sets.length) it.sets = sets.map(([v, w], k) => ({ id: `${id}${k}`, value: v, weightKg: w, rir: 2, done: true }));
  it.status = 'done';
  return it;
}

function climb(date: string, sessionId: string | null, style: ClimbEntry['style'], grade: number, attempts: number, sent: boolean, wall = 'Gym boulder wall', angle: number | null = null): ClimbEntry {
  return { id: `${date}-${grade}-${attempts}-${style}`, date, sessionId, style, wall, angle, grade, attempts, sent, createdAt: 0, updatedAt: 0 };
}

function fixture() {
  const mon = buildSession(days[0], { date: '2026-11-02' });
  mon.id = 'mon';
  mon.status = 'completed';
  mon.durationMin = 80;
  mon.rpe = 7;
  done(mon, 'pull-ups', [[6, 0], [6, 0], [5, 0]]);
  done(mon, 'chest-supported-rows', [[8, 30], [8, 30], [8, 30]]);
  done(mon, 'thoracic-extensions');
  done(mon, 'doorway-pec-stretch');

  const tue = buildSession(days[1], { date: '2026-11-03' });
  tue.id = 'tue';
  tue.status = 'completed';
  tue.durationMin = 110;
  done(tue, 'limit-bouldering').minutes = 55;
  done(tue, 'goblet-squats', [[10, 20], [10, 20], [9, 20]]);

  const wed: Session = { ...buildSession(days[2], { date: '2026-11-04' }), id: 'wed', status: 'skipped', items: [] };

  const thu = buildSession(days[3], { date: '2026-11-05' });
  thu.id = 'thu';
  thu.items.find((i) => i.exerciseId === 'board-climbing')!.minutes = 40;

  const walk: Session = { ...wed, id: 'walk', date: '2026-11-08', kind: 'walk', status: 'completed', durationMin: 30, title: 'Gentle walk' };

  const climbs = [
    climb('2026-11-03', 'tue', 'limit', 4, 2, true),
    climb('2026-11-03', 'tue', 'limit', 5, 5, false),
    climb('2026-11-03', 'tue', 'limit', 5, 4, true),
    climb('2026-11-05', 'thu', 'board', 3, 1, true, 'Kilter Board', 40),
    climb('2026-11-05', 'thu', 'board', 4, 3, false, 'Kilter Board', 40),
    climb('2026-10-30', null, 'project', 7, 9, true), // previous week: must be ignored
  ];
  const hangs: HangSession[] = [{ id: 'h1', date: '2026-11-06', blocks: [{ ...defaultHangTemplate().blocks[0] }], createdAt: 0, updatedAt: 0 }];
  const mobility: MobilityLog[] = [{ id: 'm1', date: '2026-11-08', exerciseId: 'pancake-stretch', name: 'Pancake stretch', sets: 2, durationSec: 45, createdAt: 0 }];
  const ck = (date: string, sleepHours: number, energy: number, finger: number): CheckIn => ({ date, sleepHours, sleepQuality: 3, energy, fatigue: 2, finger, elbow: 0, shoulder: 1, updatedAt: 0 });
  const checkins = [ck('2026-11-02', 7, 4, 1), ck('2026-11-03', 6, 3, 2), ck('2026-11-04', 8, 5, 0), ck('2026-10-31', 4, 1, 9)];
  return { programmes, sessions: [mon, tue, wed, thu, walk], climbs, hangs, mobility, rom: [], checkins, checklists: [], projects: [] };
}

describe('weekly summary', () => {
  const s = weeklySummary({ ...fixture(), weekStart: '2026-11-02', today: '2026-11-08' });

  it('counts consistency from planned and logged sessions', () => {
    expect(s.consistency).toMatchObject({
      planned: 6,
      plannedToDate: 6,
      completed: 2,
      inProgress: 1,
      skipped: 1,
      trainingMinutes: 190,
      exercisesPlanned: 33,
      exercisesDone: 6,
      completionPct: 18,
      climbingSessions: 1,
      walks: 1,
    });
  });
  it('only counts planned days up to today for the current week', () => {
    const mid = weeklySummary({ ...fixture(), weekStart: '2026-11-02', today: '2026-11-04' });
    expect(mid.consistency.plannedToDate).toBe(3);
    expect(mid.isCurrentWeek).toBe(true);
  });
  it('summarises climbing from logged problems only', () => {
    expect(s.climbing).toMatchObject({ problems: 5, sends: 3, attempts: 15, topSent: 5, topAttempted: 5, minutes: 95 });
    expect(s.climbing.board).toEqual({ problems: 2, sends: 1, topSent: 3, angles: [40] });
    expect(s.climbing.byStyle.limit).toEqual({ problems: 3, sends: 2 });
  });
  it('reports best strength sets', () => {
    const pull = s.strength.find((l) => l.exerciseId === 'pull-ups')!;
    expect(pull).toMatchObject({ topWeight: 0, topReps: 6, sets: 3, totalReps: 17 });
    expect(s.strength.find((l) => l.exerciseId === 'chest-supported-rows')).toMatchObject({ topWeight: 30, topReps: 8 });
  });
  it('maps the finger-loading pattern across the week', () => {
    expect(s.fingers).toMatchObject({ hangSessions: 1, hangSets: 3, hangSeconds: 21, loadedDays: 3 });
    expect(s.fingers.days.map((d) => d.loaded)).toEqual([false, true, false, true, true, false, false]);
    expect(s.fingers.days[1].climbing.styles).toEqual(['limit']);
    expect(s.fingers.days[5].planned).toEqual(['project']); // Saturday planned, not done
  });
  it('counts mobility in sessions and standalone', () => {
    expect(s.mobility).toMatchObject({ days: 2, inSessions: 2, standalone: 1 });
  });
  it('averages recovery check-ins within the week', () => {
    expect(s.recovery).toMatchObject({ checkins: 3, sleepHours: 7, energy: 4, fatigue: 2 });
    expect(s.recovery.finger).toEqual({ avg: 1, max: 2 });
  });
  it('returns empty values rather than inventing numbers for a blank week', () => {
    const empty = weeklySummary({ ...fixture(), weekStart: '2026-12-07', today: '2026-12-13' });
    expect(empty.consistency.completed).toBe(0);
    expect(empty.consistency.completionPct).toBeNull();
    expect(empty.climbing.topSent).toBeNull();
    expect(empty.recovery.sleepHours).toBeNull();
  });
});

describe('finger load and sample data', () => {
  it('shows planned finger loading on Tue/Thu/Sat', () => {
    const w = fingerLoadWeek({ weekStart: '2026-11-09', programmes, sessions: [], climbs: [], hangs: [] });
    expect(w.map((d) => d.planned.length > 0)).toEqual([false, true, false, true, false, true, false]);
  });
  it('generates deterministic sample data that summarises cleanly', () => {
    const a = generateSampleData('2026-11-08');
    const b = generateSampleData('2026-11-08');
    expect(a.sessions.length).toBe(b.sessions.length);
    expect(a.sessions.length).toBeGreaterThan(30);
    expect(a.sessions.every((s) => s.date < '2026-11-08')).toBe(true);
    const series = weeklySeries({ ...a, today: '2026-11-08' }, weekStarts('2026-11-02', 9));
    for (const w of series) {
      expect(Number.isFinite(w.consistency.trainingMinutes)).toBe(true);
      expect(w.consistency.completed).toBeLessThanOrEqual(w.consistency.planned);
    }
    expect(series.some((w) => w.climbing.topSent != null)).toBe(true);
  });
});
