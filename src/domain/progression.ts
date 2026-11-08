import { formatShort, type ISODate } from '../lib/dates';
import type { HangSession, Session, Settings } from '../db/types';
import { exerciseHistory } from './strength';
import { GRIP_LABELS } from '../data/defaults';

/**
 * Conservative progression rules. A suggestion only appears when the logged
 * data supports it, and nothing changes until the user confirms it.
 *
 * Strength: in each of the last REQUIRED_SESSIONS (non-deload) sessions, every
 * target set was completed, every set reached the top of the rep range, and
 * every set was logged with at least MIN_RIR reps in reserve.
 */
export const REQUIRED_SESSIONS = 2;
export const MIN_RIR = 2;

export interface Suggestion {
  key: string;
  exerciseId: string;
  name: string;
  kind: 'increase-load';
  currentKg: number;
  suggestedKg: number;
  reason: string;
  basedOn: ISODate[];
}

export function strengthSuggestion(
  sessions: Session[],
  exerciseId: string,
  settings: Pick<Settings, 'weightIncrementKg' | 'loadTargets' | 'dismissedSuggestions'>,
): Suggestion | null {
  const history = exerciseHistory(sessions, exerciseId).filter((p) => !p.deload && p.load !== 'none' && p.mode === 'reps');
  if (history.length < REQUIRED_SESSIONS) return null;
  const recent = history.slice(-REQUIRED_SESSIONS);
  const name = sessions.flatMap((s) => s.items).find((i) => i.exerciseId === exerciseId)?.name ?? exerciseId;

  for (const p of recent) {
    const top = p.target.max ?? p.target.min;
    if (top == null) return null;
    if (p.sets.length < Math.max(1, p.target.sets)) return null;
    if (!p.sets.every((s) => (s.value ?? 0) >= top)) return null;
    if (!p.sets.every((s) => s.rir != null && s.rir >= MIN_RIR)) return null;
  }

  const last = recent[recent.length - 1];
  const currentKg = last.topWeight ?? 0;
  // Every set must have used the same load for the evidence to be about that load.
  if (!recent.every((p) => p.sets.every((s) => (s.weightKg ?? 0) === currentKg))) return null;

  const key = `${exerciseId}:${last.sessionId}`;
  if (settings.dismissedSuggestions.includes(key)) return null;
  const accepted = settings.loadTargets.find((t) => t.exerciseId === exerciseId);
  if (accepted && accepted.weightKg > currentKg) return null; // already accepted, not yet performed

  const inc = settings.weightIncrementKg || 2.5;
  const top = last.target.max ?? last.target.min;
  const loadText = last.load === 'bodyweight' ? (currentKg ? `BW+${currentKg} kg` : 'bodyweight') : `${currentKg} kg`;
  return {
    key,
    exerciseId,
    name,
    kind: 'increase-load',
    currentKg,
    suggestedKg: Math.round((currentKg + inc) * 100) / 100,
    reason: `All sets reached ${top} reps at ${loadText} with ${MIN_RIR}+ reps in reserve on ${recent
      .map((p) => formatShort(p.date))
      .join(' and ')}.`,
    basedOn: recent.map((p) => p.date),
  };
}

export function allStrengthSuggestions(
  sessions: Session[],
  exerciseIds: string[],
  settings: Pick<Settings, 'weightIncrementKg' | 'loadTargets' | 'dismissedSuggestions'>,
): Suggestion[] {
  return exerciseIds.map((id) => strengthSuggestion(sessions, id, settings)).filter((s): s is Suggestion => !!s);
}

export interface HangSuggestion {
  key: string;
  text: string;
  reason: string;
}

/**
 * Hangboard: the last three sessions using the template's first grip were all
 * logged at effort ≤ 6/10 with no discomfort above 1/10.
 */
export function hangboardSuggestion(hangs: HangSession[], settings: Pick<Settings, 'hangTemplate' | 'dismissedSuggestions'>): HangSuggestion | null {
  const tpl = settings.hangTemplate.blocks[0];
  if (!tpl) return null;
  const relevant = [...hangs]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt))
    .map((h) => ({ h, b: h.blocks.find((b) => b.grip === tpl.grip && (b.edgeMm ?? null) === (tpl.edgeMm ?? null)) }))
    .filter((x) => !!x.b);
  if (relevant.length < 3) return null;
  const recent = relevant.slice(-3);
  const ok = recent.every(({ b }) => b!.effort != null && b!.effort <= 6 && (b!.discomfort ?? 0) <= 1);
  if (!ok) return null;
  const key = `hang:${recent[2].h.id}`;
  if (settings.dismissedSuggestions.includes(key)) return null;
  const option = tpl.feetAssisted
    ? 'reduce foot assistance'
    : tpl.loadMode === 'assisted'
      ? 'reduce the assistance by about 1–2 kg'
      : 'add about 1 kg or extend the hang by 1–2 s';
  return {
    key,
    text: `Consider a small progression on ${GRIP_LABELS[tpl.grip]}${tpl.edgeMm ? ` (${tpl.edgeMm} mm)` : ''}: ${option}.`,
    reason: `Your last three sessions on this grip were logged at effort 6/10 or lower with discomfort no higher than 1/10.`,
  };
}
