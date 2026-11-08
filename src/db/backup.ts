import { db, DATA_TABLES, type DataTable } from './db';
import { ensureInitialised, resetInitCache } from './repo';
import { GRIP_LABELS } from '../data/defaults';
import { CLIMB_STYLE_LABELS } from '../data/programme';
import { romMetric } from '../data/library';
import { gradeLabel } from '../lib/grades';
import type { Session } from './types';

export const BACKUP_APP = 'climbing-training-tracker';
export const BACKUP_VERSION = 1;

export interface Backup {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  data: Partial<Record<DataTable, unknown[]>>;
}

export async function exportAll(): Promise<Backup> {
  const data: Backup['data'] = {};
  for (const t of DATA_TABLES) data[t] = await db.table(t).toArray();
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
}

export function validateBackup(raw: unknown): Backup {
  if (!raw || typeof raw !== 'object') throw new Error('This file is not a backup from this app.');
  const b = raw as Partial<Backup>;
  if (b.app !== BACKUP_APP) throw new Error('This file is not a backup from this app.');
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    throw new Error('This backup was made by a newer version of the app.');
  }
  if (!b.data || typeof b.data !== 'object') throw new Error('The backup has no data.');
  for (const [k, v] of Object.entries(b.data)) {
    if (!(DATA_TABLES as readonly string[]).includes(k)) continue;
    if (!Array.isArray(v)) throw new Error(`The backup's "${k}" section is damaged.`);
  }
  return b as Backup;
}

export interface ImportResult {
  counts: Record<string, number>;
}

/**
 * Restores a backup. "replace" clears existing data first; "merge" keeps
 * existing records and overwrites any with the same id.
 */
export async function importBackup(raw: unknown, mode: 'replace' | 'merge'): Promise<ImportResult> {
  const backup = validateBackup(raw);
  const counts: Record<string, number> = {};
  await db.transaction('rw', DATA_TABLES.map((t) => db.table(t)), async () => {
    for (const t of DATA_TABLES) {
      const rows = (backup.data[t] ?? []) as unknown[];
      if (mode === 'replace') await db.table(t).clear();
      if (rows.length) await db.table(t).bulkPut(rows);
      counts[t] = rows.length;
    }
  });
  resetInitCache();
  await ensureInitialised();
  return { counts };
}

export async function eraseAll(): Promise<void> {
  await db.transaction('rw', DATA_TABLES.map((t) => db.table(t)), async () => {
    for (const t of DATA_TABLES) await db.table(t).clear();
  });
  resetInitCache();
  await ensureInitialised();
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

function cell(v: unknown): string {
  if (v == null) return '';
  const s = Array.isArray(v) ? v.join('; ') : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** One row per logged set (or per item for checks and climbing blocks). */
export function sessionsCsv(sessions: Session[]): string {
  const header = [
    'date', 'session', 'status', 'deload', 'block_week', 'section', 'exercise', 'substituted_for', 'added',
    'prescribed', 'target', 'item_status', 'set', 'value', 'unit', 'weight_kg', 'load_type', 'rir',
    'minutes', 'difficulty', 'item_notes', 'session_duration_min', 'session_rpe', 'session_notes',
  ];
  const rows: unknown[][] = [];
  const rxText = (rx: Session['items'][number]['prescribed']) =>
    rx ? [rx.sets + (rx.setsMax ? `-${rx.setsMax}` : ''), 'x', rx.min ?? '', rx.max ? `-${rx.max}` : '', rx.per ? ` ${rx.per}` : '', rx.note ? ` ${rx.note}` : ''].join('') : '';
  const sorted = [...sessions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.startedAt - b.startedAt));
  for (const s of sorted) {
    const base = [s.date, s.title, s.status, s.deload ? 'yes' : 'no', s.blockWeek ?? ''];
    const tail = [s.durationMin ?? '', s.rpe ?? '', s.notes ?? ''];
    if (!s.items.length) {
      rows.push([...base, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ...tail]);
      continue;
    }
    for (const i of s.items) {
      const common = [i.section, i.name, i.substitutedFor ?? '', i.isExtra ? 'yes' : 'no', rxText(i.prescribed), rxText(i.target), i.status];
      const unit = i.mode === 'time' ? 's' : i.mode === 'count' ? 'climbs' : i.mode === 'reps' ? 'reps' : '';
      const done = i.sets.filter((x) => x.done);
      if ((i.mode === 'reps' || i.mode === 'time' || i.mode === 'count') && done.length) {
        done.forEach((set, idx) =>
          rows.push([...base, ...common, idx + 1, set.value ?? '', unit, i.load === 'none' ? '' : set.weightKg ?? '', i.load, set.rir ?? '', '', i.difficulty ?? '', i.notes ?? '', ...tail]),
        );
      } else {
        rows.push([...base, ...common, '', '', unit, '', i.load, '', i.minutes ?? '', i.difficulty ?? '', i.notes ?? '', ...tail]);
      }
    }
  }
  return toCsv(header, rows);
}

export async function climbsCsv(): Promise<string> {
  const [climbs, projects] = await Promise.all([db.climbs.toArray(), db.projects.toArray()]);
  const pname = new Map(projects.map((p) => [p.id, p.name]));
  const header = ['date', 'style', 'wall', 'angle', 'grade', 'name', 'attempts', 'sent', 'difficulty', 'holds', 'project', 'high_point', 'moves', 'company', 'notes'];
  const rows = climbs
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt))
    .map((c) => [c.date, CLIMB_STYLE_LABELS[c.style], c.wall, c.angle ?? '', gradeLabel(c.grade), c.name ?? '', c.attempts, c.sent ? 'yes' : 'no', c.difficulty ?? '', c.holds ?? [], c.projectId ? pname.get(c.projectId) ?? '' : '', c.highPoint ?? '', c.moves ?? '', c.company ?? '', c.notes ?? '']);
  return toCsv(header, rows);
}

export async function hangsCsv(): Promise<string> {
  const hangs = await db.hangs.toArray();
  const header = ['date', 'grip', 'edge_mm', 'hold_type', 'load_mode', 'load_kg', 'feet_assisted', 'hang_sec', 'sets', 'rest_sec', 'effort', 'discomfort', 'notes'];
  const rows = hangs
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .flatMap((h) => h.blocks.map((b) => [h.date, GRIP_LABELS[b.grip], b.edgeMm ?? '', b.holdType ?? '', b.loadMode, b.loadKg, b.feetAssisted ? 'yes' : 'no', b.hangSec, b.sets, b.restSec, b.effort ?? '', b.discomfort ?? '', b.notes ?? h.notes ?? '']));
  return toCsv(header, rows);
}

export async function recoveryCsv(): Promise<string> {
  const cks = await db.checkins.orderBy('date').toArray();
  const header = ['date', 'sleep_hours', 'sleep_quality', 'energy', 'fatigue', 'finger', 'elbow', 'shoulder', 'notes'];
  return toCsv(header, cks.map((c) => [c.date, c.sleepHours, c.sleepQuality, c.energy, c.fatigue, c.finger, c.elbow, c.shoulder, c.notes ?? '']));
}

export async function measurementsCsv(): Promise<string> {
  const [body, rom, assessments, mobility] = await Promise.all([db.body.toArray(), db.rom.toArray(), db.assessments.toArray(), db.mobility.toArray()]);
  const header = ['date', 'type', 'measure', 'side', 'value', 'unit', 'details', 'notes'];
  const rows: unknown[][] = [];
  body.forEach((b) => {
    if (b.weightKg != null) rows.push([b.date, 'body', 'Body weight', '', b.weightKg, 'kg', '', b.notes ?? '']);
    if (b.bodyFatPct != null) rows.push([b.date, 'body', 'Body fat', '', b.bodyFatPct, '%', '', b.notes ?? '']);
    if (b.leanMassKg != null) rows.push([b.date, 'body', 'Lean mass', '', b.leanMassKg, 'kg', '', b.notes ?? '']);
    if (b.waistCm != null) rows.push([b.date, 'body', 'Waist', '', b.waistCm, 'cm', '', b.notes ?? '']);
  });
  rom.forEach((r) => rows.push([r.date, 'range of motion', romMetric(r.metric)?.label ?? r.metric, r.side ?? '', r.value, romMetric(r.metric)?.unit ?? '', '', r.notes ?? '']));
  assessments.forEach((a) =>
    rows.push([a.date, 'assessment', a.type, '', a.type === 'grade' ? gradeLabel(a.grade) : a.reps ?? a.hangSec ?? a.value ?? '', '', [a.exercise, a.weightKg != null ? `${a.weightKg} kg` : '', a.grip ? GRIP_LABELS[a.grip] : '', a.edgeMm ? `${a.edgeMm} mm` : ''].filter(Boolean).join(' '), a.notes ?? '']),
  );
  mobility.forEach((m) => rows.push([m.date, 'mobility', m.name, '', m.reps ?? m.durationSec ?? '', m.reps != null ? 'reps' : m.durationSec != null ? 's' : '', m.sets ? `${m.sets} sets` : '', m.notes ?? '']));
  rows.sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : 1));
  return toCsv(header, rows);
}
