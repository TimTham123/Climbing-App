import { useState } from 'react';
import { useAllData } from '../../hooks/useAllData';
import { useToday } from '../../hooks/data';
import { navigate } from '../../hooks/route';
import { ClimbSheet } from '../../components/sheets/ClimbSheet';
import { WeekTab } from './WeekTab';
import { StrengthTab } from './StrengthTab';
import { ClimbingTab } from './ClimbingTab';
import { FingersTab } from './FingersTab';
import { MobilityTab } from './MobilityTab';
import { RecoveryTab } from './RecoveryTab';
import { BodyTab } from './BodyTab';
import type { ClimbEntry } from '../../db/types';

const TABS = [
  { id: 'week', label: 'Week' },
  { id: 'strength', label: 'Strength' },
  { id: 'climbing', label: 'Climbing' },
  { id: 'fingers', label: 'Fingers' },
  { id: 'mobility', label: 'Mobility' },
  { id: 'recovery', label: 'Recovery' },
  { id: 'body', label: 'Body' },
] as const;

export function ProgressScreen({ tab }: { tab?: string }) {
  const data = useAllData();
  const today = useToday();
  const [climb, setClimb] = useState<ClimbEntry | null>(null);
  const current = TABS.find((t) => t.id === tab)?.id ?? 'week';

  return (
    <div className="screen" data-testid="progress-screen">
      <div className="page-head">
        <div>
          <h1 className="page-title">Progress</h1>
          <div className="page-sub">Trends from your logged data only</div>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={current === t.id} className={current === t.id ? 'on' : ''} onClick={() => navigate(`progress/${t.id}`)} data-testid={`tab-${t.id}`}>
            {t.label}
          </button>
        ))}
      </div>
      {!data ? null : current === 'week' ? (
        <WeekTab data={data} today={today} />
      ) : current === 'strength' ? (
        <StrengthTab data={data} today={today} />
      ) : current === 'climbing' ? (
        <ClimbingTab data={data} today={today} onOpenClimb={setClimb} />
      ) : current === 'fingers' ? (
        <FingersTab data={data} today={today} />
      ) : current === 'mobility' ? (
        <MobilityTab data={data} today={today} />
      ) : current === 'recovery' ? (
        <RecoveryTab data={data} today={today} />
      ) : (
        <BodyTab data={data} today={today} />
      )}
      <ClimbSheet open={!!climb} initial={climb} onClose={() => setClimb(null)} />
    </div>
  );
}
