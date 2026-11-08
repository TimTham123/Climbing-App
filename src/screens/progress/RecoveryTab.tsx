import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { LineChart, SERIES } from '../../components/charts/Charts';
import { CheckInSheet } from '../../components/sheets/CheckInSheet';
import { discomfortFlags, isPoorRecovery, NOT_A_DIAGNOSIS, recoveryVsPerformance } from '../../domain/recovery';
import { sessionCompletion } from '../../domain/session';
import { firstDataDate } from '../../domain/summary';
import { formatShort, type ISODate } from '../../lib/dates';
import type { AllData } from '../../hooks/useAllData';
import { ChartCard, RangePicker, dayLabel, dayNum, rangeStart, type Range } from './common';

export function RecoveryTab({ data, today }: { data: AllData; today: ISODate }) {
  const [range, setRange] = useState<Range>('4');
  const [edit, setEdit] = useState<ISODate | null>(null);
  const from = useMemo(() => rangeStart(range, today, firstDataDate(data)), [range, today, data]);
  const cks = data.checkins.filter((c) => c.date >= from && c.date <= today).sort((a, b) => (a.date < b.date ? -1 : 1));
  const sessions = data.sessions.filter((s) => s.date >= from && s.date <= today);
  const flags = discomfortFlags(data.checkins, today, data.hangs);
  const cmp = recoveryVsPerformance(cks, sessions);
  const line = (key: 'sleepHours' | 'energy' | 'fatigue' | 'finger' | 'elbow' | 'shoulder' | 'sleepQuality') =>
    cks.filter((c) => c[key] != null).map((c) => ({ x: dayNum(c.date), y: c[key] as number }));
  const byDate = new Map(sessions.filter((s) => s.kind === 'programme' && s.status !== 'skipped').map((s) => [s.date, s]));

  return (
    <div data-testid="recovery-tab">
      <button className="btn btn-block" style={{ marginBottom: 14 }} onClick={() => setEdit(today)}>
        <Icon name="heart" /> Today’s check-in
      </button>
      {flags.map((f) => (
        <div key={f.region} className={`alert ${f.level === 'high' ? 'critical' : 'warn'}`}>
          <Icon name="alert" />
          <div>
            <div>{f.message}</div>
            <div className="xsmall" style={{ marginTop: 6, opacity: 0.85 }}>
              {NOT_A_DIAGNOSIS}
            </div>
          </div>
        </div>
      ))}
      <RangePicker value={range} onChange={setRange} />

      <ChartCard title="Sleep (hours)">
        <LineChart series={[{ id: 's', label: 'Sleep', color: SERIES[0], points: line('sleepHours') }]} xFormat={dayLabel} yFormat={(v) => `${v} h`} empty="Add check-ins to see sleep." />
      </ChartCard>
      <ChartCard title="Energy and fatigue" sub="1–5 scale">
        <LineChart
          series={[
            { id: 'e', label: 'Energy', color: SERIES[2], points: line('energy') },
            { id: 'f', label: 'Fatigue', color: SERIES[1], points: line('fatigue') },
          ]}
          xFormat={dayLabel}
          yMin={1}
          yMax={5}
          endLabel={false}
          empty="Add check-ins to see energy and fatigue."
        />
      </ChartCard>
      <ChartCard title="Discomfort" sub="0–10 scale">
        <LineChart
          series={[
            { id: 'fi', label: 'Fingers', color: SERIES[3], points: line('finger') },
            { id: 'el', label: 'Elbows', color: SERIES[4], points: line('elbow') },
            { id: 'sh', label: 'Shoulders', color: SERIES[5], points: line('shoulder') },
          ]}
          xFormat={dayLabel}
          yMin={0}
          yMax={10}
          endLabel={false}
          empty="Add check-ins to see discomfort."
        />
      </ChartCard>

      <div className="card" data-testid="recovery-vs-performance">
        <div className="card-title">Recovery vs performance</div>
        <p className="xsmall muted" style={{ marginBottom: 10 }}>
          Programme sessions on days with a check-in. “Poor recovery” = under 6 h sleep, energy 1–2/5 or fatigue 4–5/5.
        </p>
        {cmp.poor.sessions >= 2 && cmp.other.sessions >= 2 ? (
          <table className="data">
            <thead>
              <tr>
                <th></th>
                <th>Sessions</th>
                <th>Completion</th>
                <th>Avg RPE</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Poor recovery</td>
                <td>{cmp.poor.sessions}</td>
                <td>{cmp.poor.completionPct ?? '—'}%</td>
                <td>{cmp.poor.avgRpe ?? '—'}</td>
              </tr>
              <tr>
                <td>Other days</td>
                <td>{cmp.other.sessions}</td>
                <td>{cmp.other.completionPct ?? '—'}%</td>
                <td>{cmp.other.avgRpe ?? '—'}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <div className="small muted">
            Not enough paired data yet ({cmp.poor.sessions} poor-recovery and {cmp.other.sessions} other sessions with check-ins). At least two of each are needed.
          </div>
        )}
        {cmp.poor.sessions >= 2 && cmp.other.sessions >= 2 && <p className="xsmall muted" style={{ marginTop: 8 }}>Small samples — treat as a prompt to look closer, not a conclusion.</p>}
      </div>

      <div className="section-label">Check-ins</div>
      <div className="card flush">
        {[...cks].reverse().map((c) => {
          const s = byDate.get(c.date);
          const comp = s ? sessionCompletion(s).pct : null;
          return (
            <button key={c.date} className="list-item" onClick={() => setEdit(c.date)}>
              <span style={{ width: 70 }} className="small">
                {formatShort(c.date)}
              </span>
              <span className="grow xsmall text-2 tabular">
                {c.sleepHours != null ? `${c.sleepHours} h` : '—'} · E{c.energy ?? '–'} F{c.fatigue ?? '–'} · fingers {c.finger ?? '–'} elbows {c.elbow ?? '–'} shoulders {c.shoulder ?? '–'}
                {s && <span className="muted" style={{ display: 'block' }}>{s.title}{comp != null ? ` · ${comp}% done` : ''}{s.rpe ? ` · RPE ${s.rpe}` : ''}</span>}
              </span>
              {isPoorRecovery(c) && <span className="chip warn">Low</span>}
            </button>
          );
        })}
        {!cks.length && <div className="empty">No check-ins in this range.</div>}
      </div>
      <CheckInSheet open={!!edit} date={edit ?? today} onClose={() => setEdit(null)} />
    </div>
  );
}
