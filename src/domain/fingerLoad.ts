import { FINGER_LOADING_STYLES } from '../data/programme';
import { weekDates, weekdayIndex, type ISODate } from '../lib/dates';
import type { ClimbEntry, ClimbStyle, Grip, HangSession, ProgrammeVersion, Session } from '../db/types';
import { programmeForDate } from './session';

export interface FingerDay {
  date: ISODate;
  /** Finger-loading climbing styles the programme schedules on this day */
  planned: ClimbStyle[];
  climbing: {
    styles: ClimbStyle[];
    minutes: number;
    problems: number;
    attempts: number;
    topGrade: number | null;
  };
  hang: {
    sessions: number;
    sets: number;
    seconds: number;
    grips: Grip[];
  };
  loaded: boolean;
}

export function isFingerStyle(style: ClimbStyle | null | undefined): boolean {
  return !!style && FINGER_LOADING_STYLES.includes(style);
}

/** Finger-loading styles in a programme day (used on Today and the schedule). */
export function plannedFingerStyles(versions: ProgrammeVersion[], date: ISODate): ClimbStyle[] {
  const v = programmeForDate(versions, date);
  const day = v?.days.find((d) => d.weekday === weekdayIndex(date));
  if (!day) return [];
  return Array.from(new Set(day.items.map((i) => i.climbStyle).filter((s): s is ClimbStyle => isFingerStyle(s))));
}

export function fingerLoadWeek(input: {
  weekStart: ISODate;
  programmes: ProgrammeVersion[];
  sessions: Session[];
  climbs: ClimbEntry[];
  hangs: HangSession[];
}): FingerDay[] {
  return weekDates(input.weekStart).map((date) => {
    const planned = plannedFingerStyles(input.programmes, date);
    const daySessions = input.sessions.filter((s) => s.date === date && s.status !== 'skipped');
    const blocks = daySessions.flatMap((s) => s.items.filter((i) => i.mode === 'climb' && isFingerStyle(i.climbStyle)));
    const entries = input.climbs.filter((c) => c.date === date && isFingerStyle(c.style));
    const styles = new Set<ClimbStyle>();
    blocks.filter((b) => (b.minutes ?? 0) > 0 || b.status === 'done').forEach((b) => styles.add(b.climbStyle!));
    entries.forEach((e) => styles.add(e.style));
    const sentOrTried = entries.map((e) => e.grade).filter((g): g is number => g != null);
    const dayHangs = input.hangs.filter((h) => h.date === date);
    const grips = new Set<Grip>();
    let sets = 0;
    let seconds = 0;
    dayHangs.forEach((h) =>
      h.blocks.forEach((b) => {
        grips.add(b.grip);
        sets += b.sets;
        seconds += b.sets * b.hangSec;
      }),
    );
    const climbing = {
      styles: Array.from(styles),
      minutes: blocks.reduce((a, b) => a + (b.minutes ?? 0), 0),
      problems: entries.length,
      attempts: entries.reduce((a, e) => a + e.attempts, 0),
      topGrade: sentOrTried.length ? Math.max(...sentOrTried) : null,
    };
    return {
      date,
      planned,
      climbing,
      hang: { sessions: dayHangs.length, sets, seconds, grips: Array.from(grips) },
      loaded: climbing.styles.length > 0 || dayHangs.length > 0,
    };
  });
}

/** True if the fingers were (or are planned to be) loaded on the date, for adjacent-day hangboard notes. */
export function fingerLoadedOn(day: FingerDay | undefined): boolean {
  return !!day && (day.loaded || day.planned.length > 0);
}
