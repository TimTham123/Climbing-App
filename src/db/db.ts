import Dexie, { type Table } from 'dexie';
import type {
  Assessment,
  BodyMeasurement,
  CheckIn,
  ChecklistLog,
  ClimbEntry,
  HangSession,
  MobilityLog,
  ProgrammeVersion,
  Project,
  RomMeasurement,
  Session,
  Settings,
} from './types';

export const REAL_DB_NAME = 'climbing-training-tracker';
export const DEMO_DB_NAME = 'climbing-training-tracker-sample';
const MODE_KEY = 'ctt-db-mode';

export class AppDB extends Dexie {
  settings!: Table<Settings, string>;
  programmes!: Table<ProgrammeVersion, string>;
  sessions!: Table<Session, string>;
  climbs!: Table<ClimbEntry, string>;
  projects!: Table<Project, string>;
  hangs!: Table<HangSession, string>;
  mobility!: Table<MobilityLog, string>;
  rom!: Table<RomMeasurement, string>;
  checkins!: Table<CheckIn, string>;
  body!: Table<BodyMeasurement, string>;
  assessments!: Table<Assessment, string>;
  checklists!: Table<ChecklistLog, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      settings: 'id',
      programmes: 'id, effectiveFrom',
      sessions: 'id, date, status, plannedDate',
      climbs: 'id, date, sessionId, projectId, style',
      projects: 'id, status',
      hangs: 'id, date',
      mobility: 'id, date, exerciseId',
      rom: 'id, date, metric',
      checkins: 'date',
      body: 'id, date',
      assessments: 'id, date, type',
      checklists: 'id, date',
    });
  }
}

/** Table names included in backups, in restore order. */
export const DATA_TABLES = [
  'settings',
  'programmes',
  'sessions',
  'climbs',
  'projects',
  'hangs',
  'mobility',
  'rom',
  'checkins',
  'body',
  'assessments',
  'checklists',
] as const;
export type DataTable = (typeof DATA_TABLES)[number];

export type DbMode = 'real' | 'sample';

export function readDbMode(): DbMode {
  try {
    return globalThis.localStorage?.getItem(MODE_KEY) === 'sample' ? 'sample' : 'real';
  } catch {
    return 'real';
  }
}

export function writeDbMode(mode: DbMode): void {
  try {
    if (mode === 'sample') globalThis.localStorage?.setItem(MODE_KEY, 'sample');
    else globalThis.localStorage?.removeItem(MODE_KEY);
  } catch {
    /* storage unavailable: stays on real data, which is the safe default */
  }
}

export const dbMode: DbMode = readDbMode();
export const db = new AppDB(dbMode === 'sample' ? DEMO_DB_NAME : REAL_DB_NAME);
