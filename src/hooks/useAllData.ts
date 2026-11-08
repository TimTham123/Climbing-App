import { useAssessments, useBody, useCheckins, useChecklists, useClimbs, useHangs, useMobility, useProgrammes, useProjects, useRom, useSessions, useSettings } from './data';
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
} from '../db/types';

export interface AllData {
  settings: Settings;
  programmes: ProgrammeVersion[];
  sessions: Session[];
  climbs: ClimbEntry[];
  projects: Project[];
  hangs: HangSession[];
  mobility: MobilityLog[];
  rom: RomMeasurement[];
  checkins: CheckIn[];
  body: BodyMeasurement[];
  assessments: Assessment[];
  checklists: ChecklistLog[];
}

/** Everything, or undefined until every table has loaded. */
export function useAllData(): AllData | undefined {
  const settings = useSettings();
  const programmes = useProgrammes();
  const sessions = useSessions();
  const climbs = useClimbs();
  const projects = useProjects();
  const hangs = useHangs();
  const mobility = useMobility();
  const rom = useRom();
  const checkins = useCheckins();
  const body = useBody();
  const assessments = useAssessments();
  const checklists = useChecklists();
  if (!settings || !programmes || !sessions || !climbs || !projects || !hangs || !mobility || !rom || !checkins || !body || !assessments || !checklists) return undefined;
  return { settings, programmes, sessions, climbs, projects, hangs, mobility, rom, checkins, body, assessments, checklists };
}
