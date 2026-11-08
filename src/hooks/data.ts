import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '../db/db';
import { defaultSettings } from '../data/defaults';
import { todayISO, type ISODate } from '../lib/dates';
import type { Settings } from '../db/types';

export function useSettings(): Settings | undefined {
  return useLiveQuery(async () => (await db.settings.get('settings')) ?? defaultSettings(), []);
}
export const useProgrammes = () => useLiveQuery(() => db.programmes.toArray(), []);
export const useSessions = () => useLiveQuery(() => db.sessions.toArray(), []);
/** undefined while loading, null if the session does not exist */
export const useSession = (id: string | undefined) => useLiveQuery(async () => (id ? (await db.sessions.get(id)) ?? null : null), [id]);
export const useClimbs = () => useLiveQuery(() => db.climbs.toArray(), []);
export const useProjects = () => useLiveQuery(() => db.projects.toArray(), []);
export const useHangs = () => useLiveQuery(() => db.hangs.toArray(), []);
export const useMobility = () => useLiveQuery(() => db.mobility.toArray(), []);
export const useRom = () => useLiveQuery(() => db.rom.toArray(), []);
export const useCheckins = () => useLiveQuery(() => db.checkins.toArray(), []);
export const useBody = () => useLiveQuery(() => db.body.toArray(), []);
export const useAssessments = () => useLiveQuery(() => db.assessments.toArray(), []);
export const useChecklists = () => useLiveQuery(() => db.checklists.toArray(), []);

/** Today's date, refreshed when the app returns to the foreground or the day rolls over. */
export function useToday(): ISODate {
  const [today, setToday] = useState(todayISO());
  useEffect(() => {
    const refresh = () => setToday(todayISO());
    const id = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return today;
}
