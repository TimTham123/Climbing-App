import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/db';
import {
  completeSession,
  deleteSession,
  ensureInitialised,
  getSettings,
  newClimb,
  resetInitCache,
  saveClimb,
  saveProgramme,
  startProgrammeSession,
  updateItem,
  updateSettings,
  newProject,
  saveProject,
  deleteProject,
  toggleChecklist,
} from '../../src/db/repo';
import { eraseAll, exportAll, importBackup, sessionsCsv, toCsv, validateBackup } from '../../src/db/backup';
import { programmeForDate } from '../../src/domain/session';

beforeEach(async () => {
  await db.delete();
  await db.open();
  resetInitCache();
  await ensureInitialised();
});

describe('initialisation', () => {
  it('creates settings and the original programme once', async () => {
    await ensureInitialised();
    expect(await db.programmes.count()).toBe(1);
    const s = await getSettings();
    expect(s.deloadPct).toBe(35);
    expect(s.hangboardUnlocked).toBe(false);
    expect(s.warmup).toHaveLength(6);
  });
});

describe('session lifecycle', () => {
  it('adds, completes, edits and deletes a workout', async () => {
    const s = await startProgrammeSession('2026-11-09'); // Monday
    expect(s.title).toBe('Pull strength');
    expect(s.status).toBe('in_progress');
    const pull = s.items.find((i) => i.exerciseId === 'pull-ups')!;

    for (const [idx, reps] of [6, 6, 5].entries()) {
      await updateItem(s.id, pull.id, (i) => Object.assign(i.sets[idx], { value: reps, weightKg: 0, rir: 2, done: true }));
    }
    let saved = (await db.sessions.get(s.id))!;
    expect(saved.items.find((i) => i.id === pull.id)!.status).toBe('done'); // auto-completed at target

    // Editing a set keeps it done; deleting one reopens the item
    await updateItem(s.id, pull.id, (i) => void (i.sets[2].value = 7));
    await updateItem(s.id, pull.id, (i) => void i.sets.splice(2, 1));
    saved = (await db.sessions.get(s.id))!;
    expect(saved.items.find((i) => i.id === pull.id)!.status).toBe('pending');

    // Session-only target change never touches the programme
    await updateItem(s.id, pull.id, (i) => {
      i.target = { ...i.target, sets: 2 };
    });
    const version = programmeForDate(await db.programmes.toArray(), '2026-11-09')!;
    expect(version.days[0].items.find((i) => i.exerciseId === 'pull-ups')!.rx.sets).toBe(3);

    await completeSession(s.id, { durationMin: 82, rpe: 7, notes: 'Good' });
    saved = (await db.sessions.get(s.id))!;
    expect(saved).toMatchObject({ status: 'completed', durationMin: 82, rpe: 7 });

    await saveClimb(newClimb({ date: '2026-11-09', style: 'limit', sessionId: s.id, grade: 4 }));
    await deleteSession(s.id);
    expect(await db.sessions.get(s.id)).toBeUndefined();
    expect(await db.climbs.where('sessionId').equals(s.id).count()).toBe(0);
  });

  it('applies the deload automatically in deload weeks', async () => {
    await updateSettings({ blockStart: '2026-11-02' });
    const s = await startProgrammeSession('2026-11-23'); // week 4 Monday
    expect(s.deload).toBe(true);
    expect(s.blockWeek).toBe(4);
    expect(s.items.find((i) => i.exerciseId === 'pull-ups')!.target.sets).toBe(2);
    await updateSettings({ applyDeload: false });
    const s2 = await startProgrammeSession('2026-11-23');
    expect(s2.deload).toBe(false);
  });
});

describe('programme versions', () => {
  it('keeps history on the old version when the programme changes', async () => {
    const before = programmeForDate(await db.programmes.toArray(), '2026-11-09')!;
    const days = JSON.parse(JSON.stringify(before.days));
    days[0].items[0].rx.sets = 4;
    await saveProgramme(days, 'Edited', '2026-11-16');
    const all = await db.programmes.toArray();
    expect(programmeForDate(all, '2026-11-09')!.days[0].items[0].rx.sets).toBe(3);
    expect(programmeForDate(all, '2026-11-16')!.days[0].items[0].rx.sets).toBe(4);
    const s = await startProgrammeSession('2026-11-16');
    expect(s.items[0].prescribed!.sets).toBe(4);
  });
});

describe('projects and climbs', () => {
  it('marks a project sent when a linked send is logged, and unlinks attempts on delete', async () => {
    const p = newProject({ name: 'Roof', grade: 5 });
    await saveProject(p);
    await saveClimb(newClimb({ date: '2026-11-07', style: 'project', projectId: p.id, attempts: 4, highPoint: 6 }));
    expect((await db.projects.get(p.id))!.status).toBe('active');
    await saveClimb(newClimb({ date: '2026-11-14', style: 'project', projectId: p.id, attempts: 2, sent: true }));
    expect((await db.projects.get(p.id))!).toMatchObject({ status: 'sent', sentDate: '2026-11-14' });
    await deleteProject(p.id);
    expect(await db.climbs.count()).toBe(2);
    expect((await db.climbs.toArray()).every((c) => c.projectId === null)).toBe(true);
  });
  it('toggles checklist items per day', async () => {
    await toggleChecklist('2026-11-09', 'warmup', 'wu-cat-cow');
    await toggleChecklist('2026-11-09', 'warmup', 'wu-9090');
    await toggleChecklist('2026-11-09', 'warmup', 'wu-cat-cow');
    expect((await db.checklists.get('2026-11-09:warmup'))!.done).toEqual(['wu-9090']);
  });
});

describe('backup', () => {
  it('round-trips through JSON export and import', async () => {
    const s = await startProgrammeSession('2026-11-10');
    await saveClimb(newClimb({ date: '2026-11-10', style: 'limit', grade: 6, sessionId: s.id }));
    const backup = JSON.parse(JSON.stringify(await exportAll()));
    await eraseAll();
    expect(await db.sessions.count()).toBe(0);
    expect(await db.programmes.count()).toBe(1); // defaults recreated
    await importBackup(backup, 'replace');
    expect(await db.sessions.count()).toBe(1);
    expect((await db.climbs.toArray())[0].grade).toBe(6);
    // merge does not duplicate
    await importBackup(backup, 'merge');
    expect(await db.sessions.count()).toBe(1);
  });
  it('rejects files that are not backups', () => {
    expect(() => validateBackup({ hello: 1 })).toThrow(/not a backup/);
    expect(() => validateBackup({ app: 'climbing-training-tracker', version: 99, data: {} })).toThrow(/newer version/);
  });
  it('writes valid CSV with escaping', async () => {
    expect(toCsv(['a', 'b'], [['x, y', 'say "hi"']])).toBe('a,b\r\n"x, y","say ""hi"""\r\n');
    const s = await startProgrammeSession('2026-11-09');
    const pull = s.items[0];
    await updateItem(s.id, pull.id, (i) => Object.assign(i.sets[0], { value: 6, weightKg: 0, rir: 3, done: true }));
    const csv = sessionsCsv(await db.sessions.toArray());
    const lines = csv.trim().split('\r\n');
    expect(lines[0].startsWith('date,session,status')).toBe(true);
    expect(lines.some((l) => l.includes('Pull-ups') && l.includes(',1,6,reps,0,bodyweight,3,'))).toBe(true);
  });
});
