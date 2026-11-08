import type { ISODate } from '../lib/dates';

/* ------------------------------------------------------------------ */
/* Programme (the plan)                                                */
/* ------------------------------------------------------------------ */

export type Category = 'pull' | 'limit' | 'posture' | 'board' | 'legs' | 'project' | 'rest' | 'recovery' | 'custom';

/**
 * How an item is logged:
 * - reps:  sets × reps (optionally with load)
 * - time:  sets × seconds (holds and stretches)
 * - count: a tally of climbs (technical drills)
 * - climb: a timed climbing block with its own problem log
 * - check: a simple tick-off item (e.g. "Progressive easy climbing")
 */
export type ItemMode = 'reps' | 'time' | 'count' | 'climb' | 'check';

/** external = weight in kg, bodyweight = added kg on top of bodyweight, none = no load field */
export type LoadType = 'external' | 'bodyweight' | 'none';

export type ClimbStyle = 'limit' | 'technical' | 'board' | 'project' | 'volume' | 'social';

export interface Prescription {
  sets: number;
  /** Upper bound when the plan gives a range of sets, e.g. 2–3 */
  setsMax?: number | null;
  /** Reps, seconds, climbs or minutes depending on the item mode */
  min?: number | null;
  max?: number | null;
  /** "each side", "each leg", "each" */
  per?: string | null;
  /** Free text when the plan gives no numbers, e.g. "5 minutes" */
  note?: string | null;
}

export interface PlanItem {
  id: string;
  exerciseId: string;
  name: string;
  section: string;
  mode: ItemMode;
  load: LoadType;
  rx: Prescription;
  restSec?: number | null;
  climbStyle?: ClimbStyle | null;
  notes?: string | null;
}

export interface DayPlan {
  weekday: number; // 0 = Monday
  title: string;
  category: Category;
  durationMin: number | null;
  durationMax: number | null;
  objective: string;
  guidance: string[];
  isRest: boolean;
  items: PlanItem[];
}

export interface ProgrammeVersion {
  id: string;
  /** First date this version applies to. Older dates keep using older versions. */
  effectiveFrom: ISODate;
  createdAt: number;
  label: string;
  days: DayPlan[];
}

/* ------------------------------------------------------------------ */
/* Sessions (what actually happened)                                   */
/* ------------------------------------------------------------------ */

export interface SetLog {
  id: string;
  /** reps, seconds or climbs */
  value: number | null;
  weightKg: number | null;
  rir: number | null;
  done: boolean;
}

export type ItemStatus = 'pending' | 'done' | 'skipped';

export interface SessionItem {
  id: string;
  planItemId?: string | null;
  exerciseId: string;
  name: string;
  section: string;
  mode: ItemMode;
  load: LoadType;
  /** Snapshot of the programme prescription when the session was created. Never edited. */
  prescribed: Prescription | null;
  /** The target for this session only (deload or manual edits). */
  target: Prescription;
  targetModified: boolean;
  status: ItemStatus;
  sets: SetLog[];
  restSec?: number | null;
  climbStyle?: ClimbStyle | null;
  /** Actual minutes for climb blocks */
  minutes?: number | null;
  /** Original exercise name when this item was substituted */
  substitutedFor?: string | null;
  isExtra?: boolean;
  /** Perceived difficulty 1–10 */
  difficulty?: number | null;
  notes?: string | null;
}

export type SessionStatus = 'in_progress' | 'completed' | 'skipped';

export interface Session {
  id: string;
  /** The date the session was performed */
  date: ISODate;
  /** The programme date it fulfils (usually the same as date) */
  plannedDate?: ISODate | null;
  weekday?: number | null;
  programmeVersionId?: string | null;
  kind: 'programme' | 'custom' | 'walk';
  title: string;
  category: Category;
  status: SessionStatus;
  startedAt: number;
  completedAt?: number | null;
  durationMin?: number | null;
  rpe?: number | null;
  notes?: string | null;
  deload: boolean;
  blockWeek?: number | null;
  company?: 'alone' | 'friends' | null;
  items: SessionItem[];
  updatedAt: number;
}

/* ------------------------------------------------------------------ */
/* Climbing                                                            */
/* ------------------------------------------------------------------ */

export interface ClimbEntry {
  id: string;
  date: ISODate;
  sessionId?: string | null;
  sessionItemId?: string | null;
  style: ClimbStyle;
  wall: string;
  angle?: number | null;
  /** V-grade number: -1 = VB, 0 = V0, ... */
  grade: number | null;
  name?: string | null;
  attempts: number;
  sent: boolean;
  /** Perceived difficulty 1–10 */
  difficulty?: number | null;
  holds?: string[];
  projectId?: string | null;
  /** Furthest move reached, for projects */
  highPoint?: number | null;
  moves?: string | null;
  notes?: string | null;
  company?: 'alone' | 'friends' | null;
  createdAt: number;
  updatedAt: number;
}

export type MoveStatus = 'open' | 'done' | 'linked';

export interface ProjectMove {
  id: string;
  text: string;
  status: MoveStatus;
}

export interface Project {
  id: string;
  name: string;
  grade: number | null;
  wall: string;
  angle?: number | null;
  location?: string | null;
  totalMoves?: number | null;
  status: 'active' | 'sent' | 'archived';
  createdAt: number;
  sentDate?: ISODate | null;
  notes?: string | null;
  moves: ProjectMove[];
}

/* ------------------------------------------------------------------ */
/* Finger strength                                                     */
/* ------------------------------------------------------------------ */

export type Grip = 'half_crimp' | 'open_hand' | 'three_finger_drag' | 'pinch' | 'sloper';
export type HangLoadMode = 'bodyweight' | 'added' | 'assisted';

export interface HangBlock {
  id: string;
  grip: Grip;
  edgeMm?: number | null;
  holdType?: string | null;
  loadMode: HangLoadMode;
  loadKg: number;
  feetAssisted: boolean;
  hangSec: number;
  sets: number;
  restSec: number;
  effort?: number | null;
  discomfort?: number | null;
  notes?: string | null;
}

export interface HangSession {
  id: string;
  date: ISODate;
  fromTemplate?: boolean;
  blocks: HangBlock[];
  notes?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface HangTemplate {
  name: string;
  blocks: HangBlock[];
  notes: string;
}

/* ------------------------------------------------------------------ */
/* Mobility, measurements, recovery                                    */
/* ------------------------------------------------------------------ */

export interface MobilityLog {
  id: string;
  date: ISODate;
  exerciseId: string;
  name: string;
  sets?: number | null;
  reps?: number | null;
  durationSec?: number | null;
  notes?: string | null;
  createdAt: number;
}

export interface RomMeasurement {
  id: string;
  date: ISODate;
  metric: string;
  side?: 'L' | 'R' | null;
  value: number;
  notes?: string | null;
  createdAt: number;
}

export interface CheckIn {
  date: ISODate;
  sleepHours: number | null;
  sleepQuality: number | null;
  energy: number | null;
  fatigue: number | null;
  finger: number | null;
  elbow: number | null;
  shoulder: number | null;
  notes?: string | null;
  updatedAt: number;
}

export interface BodyMeasurement {
  id: string;
  date: ISODate;
  weightKg?: number | null;
  bodyFatPct?: number | null;
  leanMassKg?: number | null;
  waistCm?: number | null;
  notes?: string | null;
  createdAt: number;
}

export type AssessmentType = 'pullups' | 'squat' | 'bench' | 'finger' | 'grade' | 'flexibility';

export interface Assessment {
  id: string;
  date: ISODate;
  type: AssessmentType;
  exercise?: string | null;
  reps?: number | null;
  weightKg?: number | null;
  grip?: Grip | null;
  edgeMm?: number | null;
  hangSec?: number | null;
  grade?: number | null;
  value?: number | null;
  notes?: string | null;
  createdAt: number;
}

export interface ChecklistItem {
  id: string;
  text: string;
}

export interface ChecklistLog {
  /** `${date}:${kind}` */
  id: string;
  date: ISODate;
  kind: 'warmup' | 'cooldown';
  done: string[];
  updatedAt: number;
}

/** A confirmed load change accepted from a progression suggestion. */
export interface LoadTarget {
  exerciseId: string;
  weightKg: number;
  acceptedAt: number;
  note?: string | null;
}

export interface Settings {
  id: 'settings';
  blockStart: ISODate | null;
  blockWeeks: number;
  deloadWeeks: number[];
  deloadPct: number;
  applyDeload: boolean;
  weightIncrementKg: number;
  restTimer: 'auto' | 'manual' | 'off';
  defaultRestSec: number;
  assessmentIntervalWeeks: number;
  warmup: ChecklistItem[];
  cooldown: ChecklistItem[];
  hangTemplate: HangTemplate;
  hangboardUnlocked: boolean;
  historicalMaxGrade: string;
  loadTargets: LoadTarget[];
  dismissedSuggestions: string[];
  createdAt: number;
}
