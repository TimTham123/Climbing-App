import { PHASES, type Phase } from '../data/defaults';
import { addDays, daysBetween, startOfWeek, type ISODate } from '../lib/dates';
import type { Settings } from '../db/types';

export interface BlockPosition {
  week: number; // 1-based
  inBlock: boolean;
  afterBlock: boolean;
  phase: Phase | null;
  deload: boolean;
  weekStart: ISODate;
}

/** Where a date falls in the training block. Null if no block start date is set or the date is before it. */
export function blockPosition(settings: Pick<Settings, 'blockStart' | 'blockWeeks' | 'deloadWeeks'>, date: ISODate): BlockPosition | null {
  if (!settings.blockStart) return null;
  const start = startOfWeek(settings.blockStart);
  const diff = daysBetween(start, date);
  if (diff < 0) return null;
  const week = Math.floor(diff / 7) + 1;
  const inBlock = week <= settings.blockWeeks;
  return {
    week,
    inBlock,
    afterBlock: !inBlock,
    phase: inBlock ? PHASES.find((p) => p.weeks.includes(week)) ?? null : null,
    deload: inBlock && settings.deloadWeeks.includes(week),
    weekStart: addDays(start, (week - 1) * 7),
  };
}

/** First day of the given block week. */
export function blockWeekStart(settings: Pick<Settings, 'blockStart'>, week: number): ISODate | null {
  if (!settings.blockStart) return null;
  return addDays(startOfWeek(settings.blockStart), (week - 1) * 7);
}

/** Hangboarding is introduced from week 5 (after the first four weeks). */
export const HANGBOARD_FROM_WEEK = 5;

export function hangboardUnlockDate(settings: Pick<Settings, 'blockStart'>): ISODate | null {
  return blockWeekStart(settings, HANGBOARD_FROM_WEEK);
}
