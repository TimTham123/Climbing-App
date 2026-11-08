import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, startOfWeek, weekdayIndex, isValidISODate, formatShort } from '../../src/lib/dates';
import { buildDefaultProgramme } from '../../src/data/programme';
import {
  buildSession,
  deloadRx,
  formatRx,
  isDeloadable,
  meetsTarget,
  programmeForDate,
  rxVolume,
  sessionCompletion,
} from '../../src/domain/session';
import { blockPosition, hangboardUnlockDate } from '../../src/domain/phase';
import { discomfortFlags, recoveryVsPerformance } from '../../src/domain/recovery';
import { strengthSuggestion, hangboardSuggestion } from '../../src/domain/progression';
import { defaultSettings, defaultHangTemplate } from '../../src/data/defaults';
import type { CheckIn, HangSession, ProgrammeVersion, Session } from '../../src/db/types';

describe('dates', () => {
  it('treats Monday as the first day of the week', () => {
    expect(weekdayIndex('2026-11-09')).toBe(0); // Monday
    expect(weekdayIndex('2026-11-08')).toBe(6); // Sunday
    expect(startOfWeek('2026-11-08')).toBe('2026-11-02');
    expect(startOfWeek('2026-11-09')).toBe('2026-11-09');
  });
  it('adds days across month ends and DST changes', () => {
    expect(addDays('2026-10-24', 7)).toBe('2026-10-31');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31);
  });
  it('validates ISO dates', () => {
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2028-02-29')).toBe(true);
    expect(formatShort('2026-11-09')).toBe('Mon 9 Nov');
  });
});

describe('default programme', () => {
  const days = buildDefaultProgramme();
  const find = (wd: number, id: string) => days[wd].items.find((i) => i.exerciseId === id)!;

  it('has seven days with Sunday as rest', () => {
    expect(days).toHaveLength(7);
    expect(days[6].isRest).toBe(true);
    expect(days.filter((d) => d.isRest)).toHaveLength(1);
  });
  it('matches the written prescriptions', () => {
    expect(formatRx(find(0, 'pull-ups').rx, 'reps')).toBe('3 × 5–8');
    expect(find(0, 'pull-ups').load).toBe('bodyweight');
    expect(formatRx(find(0, 'neutral-lat-pulldown').rx, 'reps')).toBe('2 × 10–12');
    expect(formatRx(find(1, 'step-ups').rx, 'reps')).toBe('2 × 8 each leg');
    expect(formatRx(find(1, 'side-planks').rx, 'time')).toBe('2 × 30–45 s each side');
    expect(formatRx(find(1, 'limit-bouldering').rx, 'climb')).toBe('50–60 min');
    expect(formatRx(find(2, 'landmine-press').rx, 'reps')).toBe('2 × 8 each side');
    expect(formatRx(find(3, 'silent-feet').rx, 'count')).toBe('3 climbs');
    expect(formatRx(find(3, 'board-climbing').rx, 'climb')).toBe('35–50 min');
    expect(formatRx(find(4, 'front-squats').rx, 'reps')).toBe('3 × 6–8');
    expect(formatRx(find(4, 'push-ups').rx, 'reps')).toBe('2–3 × 10–15');
    expect(formatRx(find(4, 'couch-stretch').rx, 'time')).toBe('2 × 45 s each side');
    expect(formatRx(find(5, 'project-climbing').rx, 'climb')).toBe('60–90 min');
  });
  it('never schedules hangboarding, and keeps Wednesday free of climbing', () => {
    for (const d of days) expect(d.items.some((i) => /hang/i.test(i.name))).toBe(false);
    expect(days[2].items.some((i) => i.mode === 'climb')).toBe(false);
    expect(days[3].items.filter((i) => i.mode === 'climb').map((i) => i.climbStyle)).toEqual(['board']);
  });
  it('uses the planned durations', () => {
    expect([days[0].durationMin, days[0].durationMax]).toEqual([75, 90]);
    expect([days[1].durationMin, days[1].durationMax]).toEqual([105, 120]);
    expect([days[5].durationMin, days[5].durationMax]).toEqual([120, null]);
  });
});

describe('deload', () => {
  const days = buildDefaultProgramme();
  it('reduces each training day by roughly 30–45% of deloadable volume', () => {
    for (const d of days.filter((x) => !x.isRest)) {
      const items = d.items.filter(isDeloadable);
      const before = items.reduce((a, i) => a + rxVolume(i.rx, i.mode), 0);
      const after = items.reduce((a, i) => a + rxVolume(deloadRx(i.rx, i.mode, 35), i.mode), 0);
      const cut = 1 - after / before;
      expect(cut).toBeGreaterThan(0.25);
      expect(cut).toBeLessThan(0.5);
    }
  });
  it('leaves mobility and drills unchanged and keeps the prescription intact', () => {
    const s = buildSession(days[0], { date: '2026-11-30', deload: true, deloadPct: 35 });
    const pull = s.items.find((i) => i.exerciseId === 'pull-ups')!;
    expect(pull.prescribed).toEqual({ sets: 3, setsMax: null, min: 5, max: 8, per: null });
    expect(pull.target.sets).toBe(2);
    expect(pull.sets).toHaveLength(2);
    const stretch = s.items.find((i) => i.exerciseId === 'doorway-pec-stretch')!;
    expect(stretch.target).toEqual(stretch.prescribed);
    expect(days[0].items[0].rx.sets).toBe(3); // programme untouched
  });
});

describe('sessions', () => {
  const days = buildDefaultProgramme();
  it('snapshots the programme so later edits to the session do not touch the plan', () => {
    const s = buildSession(days[0], { date: '2026-11-09' });
    s.items[0].target.sets = 5;
    s.items[0].prescribed!.sets = 99; // even a stray mutation of the snapshot
    expect(days[0].items[0].rx.sets).toBe(3);
  });
  it('prefills from the last logged load or a confirmed load target', () => {
    const s = buildSession(days[0], {
      date: '2026-11-09',
      prefill: { lastSets: () => [{ id: 'x', value: 6, weightKg: 30, rir: 2, done: true }], loadTarget: (id) => (id === 'pull-ups' ? 2.5 : null) },
    });
    expect(s.items.find((i) => i.exerciseId === 'pull-ups')!.sets[0].weightKg).toBe(2.5);
    expect(s.items.find((i) => i.exerciseId === 'chest-supported-rows')!.sets[0].weightKg).toBe(30);
    expect(s.items.find((i) => i.exerciseId === 'thoracic-extensions')!.sets[0].weightKg).toBeNull();
  });
  it('computes completion against planned items only', () => {
    const s = buildSession(days[0], { date: '2026-11-09' });
    s.items[0].status = 'done';
    s.items[1].status = 'done';
    s.items[2].status = 'skipped';
    s.items.push({ ...s.items[3], id: 'extra', isExtra: true, status: 'done' });
    const c = sessionCompletion(s);
    expect(c).toMatchObject({ planned: 9, done: 2, skipped: 1, pending: 6, extra: 1, pct: 22 });
  });
  it('knows when an item meets its target', () => {
    const s = buildSession(days[3], { date: '2026-11-12' });
    const drill = s.items.find((i) => i.exerciseId === 'silent-feet')!;
    expect(meetsTarget(drill)).toBe(false);
    drill.sets = [1, 2, 3].map((n) => ({ id: `c${n}`, value: 1, weightKg: null, rir: null, done: true }));
    expect(meetsTarget(drill)).toBe(true);
  });
  it('uses the programme version in force on each date', () => {
    const v1: ProgrammeVersion = { id: 'v1', effectiveFrom: '2000-01-01', createdAt: 1, label: 'a', days };
    const v2: ProgrammeVersion = { id: 'v2', effectiveFrom: '2026-11-10', createdAt: 2, label: 'b', days };
    expect(programmeForDate([v2, v1], '2026-11-09')!.id).toBe('v1');
    expect(programmeForDate([v2, v1], '2026-11-10')!.id).toBe('v2');
  });
});

describe('training block', () => {
  const s = { ...defaultSettings(), blockStart: '2026-11-04' }; // a Wednesday → normalised to Monday 2 Nov
  it('computes week, phase and deload', () => {
    expect(blockPosition(s, '2026-11-01')).toBeNull();
    expect(blockPosition(s, '2026-11-02')!.week).toBe(1);
    expect(blockPosition(s, '2026-11-23')!.week).toBe(4);
    expect(blockPosition(s, '2026-11-23')!.deload).toBe(true);
    expect(blockPosition(s, '2026-11-30')!.phase!.name).toBe('Introduce fingers');
    expect(blockPosition(s, '2027-01-11')!.afterBlock).toBe(true);
  });
  it('unlocks the hangboard template after four weeks', () => {
    expect(hangboardUnlockDate(s)).toBe('2026-11-30');
  });
});

const ci = (date: string, finger: number | null, extra: Partial<CheckIn> = {}): CheckIn => ({
  date, sleepHours: 7.5, sleepQuality: 4, energy: 4, fatigue: 2, finger, elbow: 0, shoulder: 0, notes: null, updatedAt: 0, ...extra,
});

describe('discomfort flags', () => {
  it('flags three rising readings', () => {
    const f = discomfortFlags([ci('2026-11-06', 1), ci('2026-11-07', 2), ci('2026-11-08', 3)], '2026-11-08');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ region: 'finger', level: 'rising' });
    expect(f[0].message).toMatch(/reducing or modifying/);
  });
  it('flags high discomfort and never suggests training through it', () => {
    const f = discomfortFlags([ci('2026-11-08', 6)], '2026-11-08');
    expect(f[0].level).toBe('high');
    expect(f[0].message).not.toMatch(/train through/i);
  });
  it('ignores stable or old readings', () => {
    expect(discomfortFlags([ci('2026-11-06', 2), ci('2026-11-07', 2), ci('2026-11-08', 2)], '2026-11-08')).toHaveLength(0);
    expect(discomfortFlags([ci('2026-11-01', 1), ci('2026-11-02', 3), ci('2026-11-03', 5)], '2026-11-08')).toHaveLength(0);
  });
  it('flags a jump above the recent average', () => {
    const f = discomfortFlags([ci('2026-11-01', 0), ci('2026-11-03', 1), ci('2026-11-05', 0), ci('2026-11-08', 3)], '2026-11-08');
    expect(f[0]?.level).toBe('rising');
  });
  it('flags discomfort logged during hangboarding', () => {
    const hang: HangSession = { id: 'h', date: '2026-11-08', blocks: [{ ...defaultHangTemplate().blocks[0], discomfort: 4 }], createdAt: 0, updatedAt: 0 };
    expect(discomfortFlags([], '2026-11-08', [hang])[0].region).toBe('finger');
  });
});

/* Helpers for progression tests */
function pullSession(date: string, reps: number[], rir: Array<number | null>, weight = 0, deload = false): Session {
  const s = buildSession(buildDefaultProgramme()[0], { date, deload, now: Date.parse(`${date}T18:00:00`) });
  const p = s.items.find((i) => i.exerciseId === 'pull-ups')!;
  p.sets = reps.map((r, i) => ({ id: `${date}-${i}`, value: r, weightKg: weight, rir: rir[i], done: true }));
  p.status = 'done';
  s.status = 'completed';
  return s;
}

describe('progression suggestions', () => {
  const settings = defaultSettings();
  it('suggests more load after two sessions at the top of the range with 2+ RIR', () => {
    const sessions = [pullSession('2026-11-02', [8, 8, 8], [3, 3, 2]), pullSession('2026-11-09', [8, 8, 8], [3, 2, 2])];
    const s = strengthSuggestion(sessions, 'pull-ups', settings)!;
    expect(s).not.toBeNull();
    expect(s.currentKg).toBe(0);
    expect(s.suggestedKg).toBe(2.5);
    expect(s.basedOn).toEqual(['2026-11-02', '2026-11-09']);
  });
  it('stays quiet when reps fall short, RIR is low or missing, or only one session qualifies', () => {
    expect(strengthSuggestion([pullSession('2026-11-02', [8, 8, 8], [3, 3, 3]), pullSession('2026-11-09', [8, 8, 7], [3, 3, 3])], 'pull-ups', settings)).toBeNull();
    expect(strengthSuggestion([pullSession('2026-11-02', [8, 8, 8], [3, 3, 3]), pullSession('2026-11-09', [8, 8, 8], [3, 1, 3])], 'pull-ups', settings)).toBeNull();
    expect(strengthSuggestion([pullSession('2026-11-02', [8, 8, 8], [3, 3, 3]), pullSession('2026-11-09', [8, 8, 8], [null, null, null])], 'pull-ups', settings)).toBeNull();
    expect(strengthSuggestion([pullSession('2026-11-09', [8, 8, 8], [3, 3, 3])], 'pull-ups', settings)).toBeNull();
  });
  it('ignores deload sessions and respects dismissals and accepted targets', () => {
    const a = pullSession('2026-11-02', [8, 8, 8], [3, 3, 3]);
    const b = pullSession('2026-11-09', [8, 8, 8], [3, 3, 3]);
    const deload = pullSession('2026-11-16', [5, 5], [5, 5], 0, true);
    expect(strengthSuggestion([a, b, deload], 'pull-ups', settings)).not.toBeNull();
    const s = strengthSuggestion([a, b], 'pull-ups', settings)!;
    expect(strengthSuggestion([a, b], 'pull-ups', { ...settings, dismissedSuggestions: [s.key] })).toBeNull();
    expect(strengthSuggestion([a, b], 'pull-ups', { ...settings, loadTargets: [{ exerciseId: 'pull-ups', weightKg: 2.5, acceptedAt: 1 }] })).toBeNull();
  });
  it('suggests hangboard progression only after three easy, pain-free sessions', () => {
    const tpl = defaultHangTemplate();
    const hang = (date: string, effort: number, discomfort: number): HangSession => ({ id: date, date, blocks: [{ ...tpl.blocks[0], effort, discomfort }], createdAt: 0, updatedAt: 0 });
    const s = { hangTemplate: tpl, dismissedSuggestions: [] as string[] };
    expect(hangboardSuggestion([hang('2026-12-01', 6, 0), hang('2026-12-04', 6, 1)], s)).toBeNull();
    expect(hangboardSuggestion([hang('2026-12-01', 6, 0), hang('2026-12-04', 5, 1), hang('2026-12-07', 6, 0)], s)!.text).toMatch(/foot assistance/);
    expect(hangboardSuggestion([hang('2026-12-01', 6, 0), hang('2026-12-04', 5, 2), hang('2026-12-07', 6, 0)], s)).toBeNull();
  });
});

describe('recovery vs performance', () => {
  it('groups sessions by same-day recovery', () => {
    const mk = (date: string, done: number, rpe: number): Session => {
      const s = buildSession(buildDefaultProgramme()[0], { date });
      s.items.slice(0, done).forEach((i) => (i.status = 'done'));
      s.rpe = rpe;
      s.status = 'completed';
      return s;
    };
    const r = recoveryVsPerformance(
      [ci('2026-11-02', 0, { sleepHours: 5 }), ci('2026-11-03', 0, { energy: 2 }), ci('2026-11-04', 0), ci('2026-11-05', 0)],
      [mk('2026-11-02', 3, 8), mk('2026-11-03', 6, 9), mk('2026-11-04', 9, 6), mk('2026-11-05', 9, 7), mk('2026-11-06', 9, 7)],
    );
    expect(r.poor).toEqual({ sessions: 2, completionPct: 50, avgRpe: 8.5 });
    expect(r.other).toEqual({ sessions: 2, completionPct: 100, avgRpe: 6.5 });
    expect(r.paired).toBe(4);
  });
});
