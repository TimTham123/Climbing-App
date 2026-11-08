import { db } from './db';
import { defaultSettings } from '../data/defaults';
import { buildDefaultProgramme } from '../data/programme';
import { clone, uid } from '../lib/id';
import { todayISO, weekdayIndex, type ISODate } from '../lib/dates';
import { blockPosition } from '../domain/phase';
import { buildSession, meetsTarget, programmeForDate } from '../domain/session';
import { lastSetsFor } from '../domain/strength';
import type {
  Assessment,
  BodyMeasurement,
  CheckIn,
  ChecklistLog,
  ClimbEntry,
  DayPlan,
  HangSession,
  MobilityLog,
  ProgrammeVersion,
  Project,
  RomMeasurement,
  Session,
  SessionItem,
  Settings,
} from './types';

/* ------------------------------------------------------------------ */
/* Initialisation                                                      */
/* ------------------------------------------------------------------ */

let initPromise: Promise<void> | null = null;

/** Creates default settings and the original programme on first run. Safe to call repeatedly. */
export function ensureInitialised(): Promise<void> {
  if (!initPromise) {
    initPromise = db.transaction('rw', db.settings, db.programmes, async () => {
      const existing = await db.settings.get('settings');
      if (!existing) await db.settings.put(defaultSettings());
      else await db.settings.put({ ...defaultSettings(), ...existing });
      if ((await db.programmes.count()) === 0) {
        await db.programmes.put({
          id: uid('prg_'),
          effectiveFrom: '2000-01-01',
          createdAt: Date.now(),
          label: 'Original programme',
          days: buildDefaultProgramme(),
        });
      }
    });
    initPromise.catch(() => (initPromise = null));
  }
  return initPromise;
}

/** For tests and after imports: forget the cached init so it runs again. */
export function resetInitCache(): void {
  initPromise = null;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('settings')) ?? defaultSettings();
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = (await db.settings.get('settings')) ?? defaultSettings();
    await db.settings.put({ ...current, ...patch, id: 'settings' });
  });
}

/* ------------------------------------------------------------------ */
/* Programme                                                           */
/* ------------------------------------------------------------------ */

export async function allProgrammes(): Promise<ProgrammeVersion[]> {
  return db.programmes.toArray();
}

/**
 * Saves programme edits as a new version effective from `from` (default today).
 * Earlier dates keep the older version, so history and past planned counts never change.
 */
export async function saveProgramme(days: DayPlan[], label: string, from: ISODate = todayISO()): Promise<ProgrammeVersion> {
  return db.transaction('rw', db.programmes, async () => {
    const versions = await db.programmes.toArray();
    const sameDay = versions.find((v) => v.effectiveFrom === from);
    const version: ProgrammeVersion = {
      id: sameDay?.id ?? uid('prg_'),
      effectiveFrom: from,
      createdAt: Date.now(),
      label,
      days: clone(days),
    };
    await db.programmes.put(version);
    return version;
  });
}

export async function resetProgrammeToDefault(from: ISODate = todayISO()): Promise<void> {
  await saveProgramme(buildDefaultProgramme(), 'Original programme (restored)', from);
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

export async function getSession(id: string): Promise<Session | undefined> {
  return db.sessions.get(id);
}

/** Starts a programme session on `date` using the plan for `weekday` (defaults to the date's weekday). */
export async function startProgrammeSession(date: ISODate, weekday: number = weekdayIndex(date)): Promise<Session> {
  const [settings, versions, sessions] = await Promise.all([getSettings(), db.programmes.toArray(), db.sessions.toArray()]);
  const version = programmeForDate(versions, date);
  if (!version) throw new Error('No programme found');
  const day = version.days.find((d) => d.weekday === weekday);
  if (!day) throw new Error('No plan for that day');
  const pos = blockPosition(settings, date);
  const session = buildSession(day, {
    date,
    plannedDate: weekday === weekdayIndex(date) ? date : null,
    versionId: version.id,
    deload: !!pos?.deload && settings.applyDeload,
    deloadPct: settings.deloadPct,
    blockWeek: pos?.week ?? null,
    prefill: {
      lastSets: (exerciseId) => lastSetsFor(sessions, exerciseId)?.sets ?? null,
      loadTarget: (exerciseId) => settings.loadTargets.find((t) => t.exerciseId === exerciseId)?.weightKg ?? null,
    },
  });
  await db.sessions.put(session);
  return session;
}

export async function startCustomSession(input: {
  date: ISODate;
  title: string;
  category?: Session['category'];
  items?: SessionItem[];
  kind?: Session['kind'];
}): Promise<Session> {
  const now = Date.now();
  const settings = await getSettings();
  const pos = blockPosition(settings, input.date);
  const session: Session = {
    id: uid('ses_'),
    date: input.date,
    plannedDate: null,
    weekday: null,
    programmeVersionId: null,
    kind: input.kind ?? 'custom',
    title: input.title,
    category: input.category ?? 'custom',
    status: 'in_progress',
    startedAt: now,
    completedAt: null,
    durationMin: null,
    rpe: null,
    notes: null,
    deload: false,
    blockWeek: pos?.week ?? null,
    company: null,
    items: input.items ?? [],
    updatedAt: now,
  };
  await db.sessions.put(session);
  return session;
}

/** Records a walk or other light activity as a completed, non-training session. */
export async function logWalk(date: ISODate, minutes: number, notes: string | null): Promise<Session> {
  const now = Date.now();
  const s: Session = {
    id: uid('ses_'),
    date,
    plannedDate: null,
    weekday: null,
    programmeVersionId: null,
    kind: 'walk',
    title: 'Gentle walk',
    category: 'recovery',
    status: 'completed',
    startedAt: now,
    completedAt: now,
    durationMin: minutes,
    rpe: null,
    notes,
    deload: false,
    blockWeek: null,
    company: null,
    items: [],
    updatedAt: now,
  };
  await db.sessions.put(s);
  return s;
}

/** Marks a planned day as skipped, so it shows as planned-but-not-done rather than silently missing. */
export async function skipPlannedDay(date: ISODate): Promise<Session> {
  const versions = await db.programmes.toArray();
  const version = programmeForDate(versions, date);
  const day = version?.days.find((d) => d.weekday === weekdayIndex(date));
  const now = Date.now();
  const s: Session = {
    id: uid('ses_'),
    date,
    plannedDate: date,
    weekday: weekdayIndex(date),
    programmeVersionId: version?.id ?? null,
    kind: 'programme',
    title: day?.title ?? 'Session',
    category: day?.category ?? 'custom',
    status: 'skipped',
    startedAt: now,
    completedAt: null,
    durationMin: null,
    rpe: null,
    notes: null,
    deload: false,
    blockWeek: null,
    company: null,
    items: [],
    updatedAt: now,
  };
  await db.sessions.put(s);
  return s;
}

/** Applies a change to a session atomically. Items that meet their target are marked done. */
export async function updateSession(id: string, mutate: (s: Session) => void): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(id);
    if (!s) return;
    mutate(s);
    s.updatedAt = Date.now();
    await db.sessions.put(s);
  });
}

export async function updateItem(sessionId: string, itemId: string, mutate: (i: SessionItem, s: Session) => void): Promise<void> {
  await updateSession(sessionId, (s) => {
    const item = s.items.find((i) => i.id === itemId);
    if (!item) return;
    const wasMet = meetsTarget(item);
    mutate(item, s);
    // Auto-complete when the logged work reaches the target; never auto-skip.
    if (item.status === 'pending' && meetsTarget(item) && !wasMet) item.status = 'done';
    if (item.status === 'done' && wasMet && !meetsTarget(item) && (item.mode === 'reps' || item.mode === 'time' || item.mode === 'count')) {
      item.status = 'pending';
    }
  });
}

export async function completeSession(id: string, patch: Pick<Session, 'durationMin' | 'rpe' | 'notes'> & Partial<Session>): Promise<void> {
  await updateSession(id, (s) => {
    Object.assign(s, patch);
    s.status = 'completed';
    s.completedAt = s.completedAt ?? Date.now();
  });
}

export async function reopenSession(id: string): Promise<void> {
  await updateSession(id, (s) => {
    s.status = 'in_progress';
  });
}

/** Deletes a session and the climbing problems logged inside it. */
export async function deleteSession(id: string): Promise<void> {
  await db.transaction('rw', db.sessions, db.climbs, async () => {
    await db.climbs.where('sessionId').equals(id).delete();
    await db.sessions.delete(id);
  });
}

/* ------------------------------------------------------------------ */
/* Climbing                                                            */
/* ------------------------------------------------------------------ */

export function newClimb(partial: Partial<ClimbEntry> & Pick<ClimbEntry, 'date' | 'style'>): ClimbEntry {
  const now = Date.now();
  return {
    id: uid('clb_'),
    sessionId: null,
    sessionItemId: null,
    wall: 'Gym boulder wall',
    angle: null,
    grade: null,
    name: null,
    attempts: 1,
    sent: false,
    difficulty: null,
    holds: [],
    projectId: null,
    highPoint: null,
    moves: null,
    notes: null,
    company: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export async function saveClimb(entry: ClimbEntry): Promise<void> {
  await db.climbs.put({ ...entry, updatedAt: Date.now() });
  if (entry.projectId && entry.sent) {
    await db.transaction('rw', db.projects, async () => {
      const p = await db.projects.get(entry.projectId!);
      if (p && p.status === 'active') await db.projects.put({ ...p, status: 'sent', sentDate: entry.date });
    });
  }
}

export async function patchClimb(id: string, patch: Partial<ClimbEntry>): Promise<void> {
  const c = await db.climbs.get(id);
  if (c) await saveClimb({ ...c, ...patch });
}

export async function deleteClimb(id: string): Promise<void> {
  await db.climbs.delete(id);
}

export async function saveProject(p: Project): Promise<void> {
  await db.projects.put(p);
}

/** Deletes a project; its logged attempts are kept and simply unlinked. */
export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', db.projects, db.climbs, async () => {
    await db.climbs.where('projectId').equals(id).modify({ projectId: null });
    await db.projects.delete(id);
  });
}

export function newProject(partial: Partial<Project> = {}): Project {
  return {
    id: uid('prj_'),
    name: '',
    grade: null,
    wall: 'Gym boulder wall',
    angle: null,
    location: null,
    totalMoves: null,
    status: 'active',
    createdAt: Date.now(),
    sentDate: null,
    notes: null,
    moves: [],
    ...partial,
  };
}

/* ------------------------------------------------------------------ */
/* Other logs                                                          */
/* ------------------------------------------------------------------ */

export async function saveHang(h: HangSession): Promise<void> {
  await db.hangs.put({ ...h, updatedAt: Date.now() });
}
export async function deleteHang(id: string): Promise<void> {
  await db.hangs.delete(id);
}

export async function saveMobility(m: MobilityLog): Promise<void> {
  await db.mobility.put(m);
}
export async function deleteMobility(id: string): Promise<void> {
  await db.mobility.delete(id);
}

export async function saveRom(r: RomMeasurement): Promise<void> {
  await db.rom.put(r);
}
export async function deleteRom(id: string): Promise<void> {
  await db.rom.delete(id);
}

export async function saveCheckIn(c: CheckIn): Promise<void> {
  await db.checkins.put({ ...c, updatedAt: Date.now() });
}
export async function deleteCheckIn(date: ISODate): Promise<void> {
  await db.checkins.delete(date);
}

export async function saveBody(b: BodyMeasurement): Promise<void> {
  await db.body.put(b);
}
export async function deleteBody(id: string): Promise<void> {
  await db.body.delete(id);
}

export async function saveAssessment(a: Assessment): Promise<void> {
  await db.assessments.put(a);
}
export async function deleteAssessment(id: string): Promise<void> {
  await db.assessments.delete(id);
}

export async function toggleChecklist(date: ISODate, kind: ChecklistLog['kind'], itemId: string): Promise<void> {
  const id = `${date}:${kind}`;
  await db.transaction('rw', db.checklists, async () => {
    const existing = (await db.checklists.get(id)) ?? { id, date, kind, done: [], updatedAt: Date.now() };
    const done = existing.done.includes(itemId) ? existing.done.filter((x) => x !== itemId) : [...existing.done, itemId];
    await db.checklists.put({ ...existing, done, updatedAt: Date.now() });
  });
}
