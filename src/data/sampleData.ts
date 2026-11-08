/**
 * Sample data for previewing charts. It is only ever written to the separate
 * sample database (see db.ts), never to the real training history.
 */
import { buildDefaultProgramme } from './programme';
import { defaultSettings, defaultHangTemplate } from './defaults';
import { addDays, startOfWeek, weekdayIndex, type ISODate } from '../lib/dates';
import { buildSession } from '../domain/session';
import { clone } from '../lib/id';
import type {
  Assessment,
  BodyMeasurement,
  CheckIn,
  ClimbEntry,
  HangSession,
  MobilityLog,
  ProgrammeVersion,
  Project,
  RomMeasurement,
  Session,
  Settings,
} from '../db/types';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface SampleData {
  settings: Settings[];
  programmes: ProgrammeVersion[];
  sessions: Session[];
  climbs: ClimbEntry[];
  projects: Project[];
  hangs: HangSession[];
  mobility: MobilityLog[];
  rom: RomMeasurement[];
  checkins: CheckIn[];
  body: BodyMeasurement[];
  assessments: Assessment[];
  checklists: never[];
}

/** Progression curves: value at block week w (1-based). */
const lin = (from: number, to: number, weeks: number) => (w: number) => from + ((to - from) * Math.min(w - 1, weeks - 1)) / (weeks - 1);

export function generateSampleData(today: ISODate, seed = 7): SampleData {
  const r = rng(seed);
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)];
  const between = (a: number, b: number) => Math.round(a + r() * (b - a));
  const blockStart = addDays(startOfWeek(today), -7 * 8); // today falls in week 9
  const settings: Settings = { ...defaultSettings(), blockStart, hangboardUnlocked: true, createdAt: Date.now() };
  const days = buildDefaultProgramme();
  const programme: ProgrammeVersion = { id: 'sample-prg', effectiveFrom: '2000-01-01', createdAt: 0, label: 'Original programme', days };

  const sessions: Session[] = [];
  const climbs: ClimbEntry[] = [];
  const hangs: HangSession[] = [];
  const mobility: MobilityLog[] = [];
  const checkins: CheckIn[] = [];
  const rom: RomMeasurement[] = [];
  const body: BodyMeasurement[] = [];

  const projects: Project[] = [
    {
      id: 'sample-prj-1', name: 'Cave roof traverse', grade: 5, wall: 'Gym boulder wall', angle: null, location: 'Main cave', totalMoves: 9,
      status: 'sent', createdAt: 0, sentDate: null, notes: 'Heel hook at move 5 is key.',
      moves: [
        { id: 'm1', text: 'Start to undercling', status: 'linked' },
        { id: 'm2', text: 'Heel hook and cross', status: 'linked' },
        { id: 'm3', text: 'Pinch to sloper top-out', status: 'linked' },
      ],
    },
    {
      id: 'sample-prj-2', name: 'Kilter 40° crimp line', grade: 6, wall: 'Kilter Board', angle: 40, location: null, totalMoves: 7,
      status: 'active', createdAt: 0, sentDate: null, notes: 'Last move to the jug is the crux.',
      moves: [
        { id: 'm4', text: 'Start match and left crimp', status: 'linked' },
        { id: 'm5', text: 'Right toe hook, reach to pinch', status: 'done' },
        { id: 'm6', text: 'Dyno to jug', status: 'open' },
      ],
    },
  ];

  const lift: Record<string, (w: number) => number> = {
    'pull-ups': (w) => (w >= 7 ? 2.5 : 0),
    'chest-supported-rows': lin(30, 40, 9),
    'neutral-lat-pulldown': lin(45, 55, 9),
    'hammer-curls': lin(12, 16, 9),
    'prone-y-raises': lin(2, 3, 9),
    'goblet-squats': lin(20, 28, 9),
    'step-ups': lin(10, 16, 9),
    'incline-db-bench': lin(16, 22, 9),
    'landmine-press': lin(15, 22.5, 9),
    'cable-external-rotations': lin(5, 7.5, 9),
    'front-squats': lin(50, 65, 9),
    'romanian-deadlifts': lin(60, 80, 9),
    'bulgarian-split-squats': lin(12, 18, 9),
    'standing-calf-raises': lin(40, 55, 9),
    'tibialis-raises': lin(5, 8, 9),
    'wrist-extensions': lin(5, 7, 9),
    'pronation-supination': lin(4, 6, 9),
    'push-ups': () => 0,
  };
  const round = (n: number, step = 2.5) => Math.round(n / step) * step;
  const grade = lin(3, 5, 9);

  let projectSent = false;
  for (let d = blockStart; d < today; d = addDays(d, 1)) {
    const week = Math.floor((Date.parse(d) - Date.parse(blockStart)) / (7 * 86400000)) + 1;
    const wd = weekdayIndex(d);
    const day = days[wd];
    const deload = week === 4 || week === 8;
    const t0 = Date.parse(`${d}T17:30:00`);

    // Daily check-in (most days)
    if (r() < 0.88) {
      const spike = week === 6 ? [0, 1, 2, 3, 4, 3, 2][wd] : 0;
      checkins.push({
        date: d,
        sleepHours: Math.round((6 + r() * 2.5) * 4) / 4,
        sleepQuality: between(2, 5),
        energy: between(2, 5),
        fatigue: between(1, 4),
        finger: Math.min(10, between(0, 2) + spike),
        elbow: between(0, 2),
        shoulder: between(0, 1),
        notes: spike >= 3 ? 'Left ring finger a bit sore after board session.' : null,
        updatedAt: t0,
      });
    }

    if (day.isRest) {
      if (r() < 0.5) {
        sessions.push({
          id: `sample-walk-${d}`, date: d, plannedDate: null, weekday: null, programmeVersionId: null, kind: 'walk', title: 'Gentle walk', category: 'recovery',
          status: 'completed', startedAt: t0, completedAt: t0, durationMin: between(30, 70), rpe: null, notes: null, deload: false, blockWeek: week, company: null, items: [], updatedAt: t0,
        });
      }
      if (r() < 0.6) {
        mobility.push({ id: `sample-mob-${d}`, date: d, exerciseId: 'pancake-stretch', name: 'Pancake stretch', sets: 3, reps: null, durationSec: 45, notes: null, createdAt: t0 });
        mobility.push({ id: `sample-mob2-${d}`, date: d, exerciseId: '90-90-hip-switches', name: '90/90 hip switches', sets: 2, reps: 10, durationSec: null, notes: null, createdAt: t0 });
      }
      continue;
    }

    if (r() < 0.1) {
      sessions.push({
        id: `sample-skip-${d}`, date: d, plannedDate: d, weekday: wd, programmeVersionId: programme.id, kind: 'programme', title: day.title, category: day.category,
        status: 'skipped', startedAt: t0, completedAt: null, durationMin: null, rpe: null, notes: 'Work ran late.', deload: false, blockWeek: week, company: null, items: [], updatedAt: t0,
      });
      continue;
    }

    const s = buildSession(day, { date: d, versionId: programme.id, deload, deloadPct: 35, blockWeek: week, now: t0 });
    s.id = `sample-ses-${d}`;
    const poorDay = checkins.find((c) => c.date === d && ((c.energy ?? 5) <= 2 || (c.sleepHours ?? 8) < 6));
    for (const item of s.items) {
      const skip = r() < (poorDay ? 0.25 : 0.06) && item.section !== 'Climbing' && item.mode !== 'climb';
      if (skip) {
        item.status = 'skipped';
        continue;
      }
      if (item.mode === 'reps' || item.mode === 'time') {
        const top = item.target.max ?? item.target.min ?? 10;
        const bottom = item.target.min ?? top;
        item.sets.forEach((set, idx) => {
          let v = item.exerciseId === 'pull-ups' ? Math.min(8, Math.max(5, Math.round(lin(5, 8, 6)(week)) - idx + (week >= 7 ? -2 : 0))) : between(bottom, top);
          if (poorDay) v = Math.max(1, v - 1);
          set.value = v;
          const w = lift[item.exerciseId];
          set.weightKg = item.load === 'none' ? null : w ? round(w(week), item.exerciseId.includes('raises') || item.exerciseId.includes('rotations') ? 0.5 : 2.5) : 0;
          set.rir = item.load === 'none' ? null : between(1, 3);
          set.done = true;
        });
        item.status = 'done';
      } else if (item.mode === 'count') {
        const n = item.target.min ?? 2;
        item.sets = Array.from({ length: n }, (_, k) => ({ id: `${item.id}-c${k}`, value: 1, weightKg: null, rir: null, done: true }));
        item.status = 'done';
      } else if (item.mode === 'check') {
        item.status = r() < 0.9 ? 'done' : 'pending';
      } else if (item.mode === 'climb') {
        const lo = item.target.min ?? 30;
        const hi = item.target.max ?? lo + 30;
        item.minutes = between(lo, hi);
        item.status = 'done';
        const style = item.climbStyle!;
        const n = style === 'social' ? between(3, 6) : style === 'volume' ? between(3, 5) : style === 'project' ? 2 : between(4, 6);
        for (let k = 0; k < n; k++) {
          const base = Math.round(grade(week));
          let g = style === 'limit' ? base + between(0, 2) : style === 'board' ? base - 1 + between(-1, 1) : style === 'volume' ? between(0, 2) : base - between(0, 2);
          let projectId: string | null = null;
          let highPoint: number | null = null;
          let sent = r() < (style === 'limit' ? 0.35 : style === 'board' ? 0.55 : 0.75);
          let attempts = style === 'limit' ? between(2, 6) : style === 'volume' ? 1 : between(1, 4);
          let name: string | null = null;
          let wall = style === 'board' ? 'Kilter Board' : 'Gym boulder wall';
          let angle: number | null = style === 'board' ? pick([30, 35, 40]) : null;
          if (style === 'project') {
            const p = k === 0 ? projects[0] : projects[1];
            projectId = p.id;
            name = p.name;
            g = p.grade!;
            wall = p.wall;
            angle = p.angle ?? null;
            attempts = between(3, 7);
            highPoint = Math.min(p.totalMoves!, Math.max(2, Math.round((p.totalMoves! * week) / (k === 0 ? 7 : 11))));
            sent = k === 0 && week === 7 && !projectSent;
            if (k === 0 && projectSent) continue;
            if (sent) {
              projectSent = true;
              p.sentDate = d;
              highPoint = p.totalMoves!;
            }
          }
          climbs.push({
            id: `sample-clb-${d}-${item.id}-${k}`, date: d, sessionId: s.id, sessionItemId: item.id, style, wall, angle,
            grade: Math.min(7, Math.max(0, g)), name, attempts, sent, difficulty: between(5, 9),
            holds: style === 'board' ? [pick(['Pinch', 'Sloper', 'Edge', 'Crimp']), pick(['Dynamic', 'Body tension'])] : [],
            projectId, highPoint, moves: style === 'project' ? 'Working the crux sequence.' : null, notes: null, company: style === 'social' || style === 'project' ? 'friends' : 'alone',
            createdAt: t0 + k * 60000, updatedAt: t0 + k * 60000,
          });
        }
      }
    }
    s.status = 'completed';
    s.completedAt = t0 + (day.durationMin ?? 60) * 60000;
    s.durationMin = between(day.durationMin ?? 60, day.durationMax ?? (day.durationMin ?? 60) + 30) - (deload ? 15 : 0);
    s.rpe = poorDay ? between(7, 9) : between(5, 8);
    if (day.category === 'project') s.company = 'friends';
    sessions.push(s);

    // Hangboard twice a week from week 5 (Monday and Friday)
    if (week >= 5 && (wd === 0 || wd === 4)) {
      const tpl = clone(defaultHangTemplate().blocks[0]);
      tpl.id = `sample-hb-${d}`;
      tpl.feetAssisted = week < 7;
      tpl.effort = week >= 7 ? between(5, 6) : 7;
      tpl.discomfort = week === 6 ? between(1, 3) : between(0, 1);
      hangs.push({ id: `sample-hang-${d}`, date: d, fromTemplate: true, blocks: [tpl], notes: null, createdAt: t0, updatedAt: t0 });
    }
  }

  // Range-of-motion measurements every two weeks
  const romCurves: Array<[string, 'L' | 'R' | null, number, number]> = [
    ['pancake-chest-floor', null, 38, 31],
    ['knee-to-wall', 'L', 8.5, 11],
    ['knee-to-wall', 'R', 9.5, 11.5],
    ['hip-internal-rotation', 'L', 28, 34],
    ['hip-internal-rotation', 'R', 31, 35],
    ['shoulder-flexion-gap', null, 7, 4],
  ];
  for (let w = 1; w <= 9; w += 2) {
    const d = addDays(blockStart, (w - 1) * 7 + 6);
    if (d >= today) break;
    romCurves.forEach(([metric, side, from, to], idx) =>
      rom.push({ id: `sample-rom-${w}-${idx}`, date: d, metric, side, value: Math.round(lin(from, to, 9)(w) * 2) / 2, notes: null, createdAt: 0 }),
    );
    body.push({ id: `sample-body-${w}`, date: d, weightKg: Math.round(lin(72.6, 71.4, 9)(w) * 10) / 10, bodyFatPct: Math.round(lin(15.4, 14.1, 9)(w) * 10) / 10, leanMassKg: null, waistCm: w === 1 ? 81 : null, notes: null, createdAt: 0 });
  }

  const assessments: Assessment[] = [
    { id: 'sample-as-1', date: addDays(blockStart, 5), type: 'pullups', reps: 9, weightKg: 0, notes: 'Strict, full lockout.', createdAt: 0 },
    { id: 'sample-as-2', date: addDays(blockStart, 4), type: 'squat', exercise: 'Front squat', reps: 5, weightKg: 60, createdAt: 0 },
    { id: 'sample-as-3', date: addDays(blockStart, 2), type: 'bench', exercise: 'Incline DB bench (per hand)', reps: 8, weightKg: 20, createdAt: 0 },
    { id: 'sample-as-4', date: addDays(blockStart, 5), type: 'grade', grade: 5, notes: 'Highest send in first session back.', createdAt: 0 },
  ];

  return { settings: [settings], programmes: [programme], sessions, climbs, projects, hangs, mobility, rom, checkins, body, assessments, checklists: [] };
}
