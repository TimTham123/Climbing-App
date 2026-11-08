import { useMemo, useState } from 'react';
import { LineChart, SERIES } from '../../components/charts/Charts';
import { useFeedback } from '../../components/ui';
import { exerciseHistory, loggedExercises } from '../../domain/strength';
import { allStrengthSuggestions, MIN_RIR, REQUIRED_SESSIONS } from '../../domain/progression';
import { discomfortFlags } from '../../domain/recovery';
import { KEY_LIFTS, libraryExercise } from '../../data/library';
import { updateSettings } from '../../db/repo';
import { formatShort, type ISODate } from '../../lib/dates';
import { fmtKg } from '../../lib/format';
import type { AllData } from '../../hooks/useAllData';
import { ChartCard, dayLabel, dayNum } from './common';

export function StrengthTab({ data, today }: { data: AllData; today: ISODate }) {
  const { confirm, toast } = useFeedback();
  const logged = useMemo(() => loggedExercises(data.sessions), [data.sessions]);
  const ids = useMemo(() => {
    const keyWithData = KEY_LIFTS.filter((k) => logged.some((l) => l.exerciseId === k));
    const others = logged.filter((l) => !KEY_LIFTS.includes(l.exerciseId) && l.count >= 1).map((l) => l.exerciseId);
    return [...keyWithData, ...others];
  }, [logged]);
  const [selected, setSelected] = useState<string | null>(null);
  const current = selected ?? ids[0] ?? null;
  const history = useMemo(() => (current ? exerciseHistory(data.sessions, current) : []), [data.sessions, current]);
  const flags = discomfortFlags(data.checkins, today, data.hangs);
  const suggestions = flags.length ? [] : allStrengthSuggestions(data.sessions, ids, data.settings);
  const nameOf = (id: string) => logged.find((l) => l.exerciseId === id)?.name ?? libraryExercise(id)?.name ?? id;

  if (!ids.length) {
    return (
      <div className="empty" data-testid="strength-empty">
        <strong>No strength data yet</strong>
        Pull-ups, squats, bench and rows appear here once you log sets.
      </div>
    );
  }
  const p0 = history[0];
  const load = p0?.load ?? 'external';
  const isTime = p0?.mode === 'time';
  const unit = isTime ? 's' : 'reps';

  return (
    <div data-testid="strength-tab">
      <div className="chips scroll" style={{ marginBottom: 14 }}>
        {ids.map((id) => (
          <button key={id} className={`chip${current === id ? ' selected' : ''}`} onClick={() => setSelected(id)}>
            {nameOf(id)}
          </button>
        ))}
      </div>

      {suggestions.length > 0 && (
        <div className="card">
          <div className="card-title">Progression suggestions</div>
          {suggestions.map((s) => (
            <div className="suggest" key={s.key}>
              <div className="strong">
                {s.name}: consider {fmtKg(s.suggestedKg, libraryExercise(s.exerciseId)?.load === 'bodyweight' ? 'bodyweight' : 'external')}
              </div>
              <div className="small" style={{ margin: '4px 0 10px' }}>
                {s.reason}
              </div>
              <div className="btn-row">
                <button className="btn btn-sm" onClick={() => updateSettings({ dismissedSuggestions: [...data.settings.dismissedSuggestions, s.key] })}>
                  Not now
                </button>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={async () => {
                    if (await confirm({ title: `Use ${s.suggestedKg} kg for ${s.name}?`, message: 'It becomes the starting load next session. Nothing else changes.', confirmLabel: 'Confirm' })) {
                      await updateSettings({ loadTargets: [...data.settings.loadTargets.filter((t) => t.exerciseId !== s.exerciseId), { exerciseId: s.exerciseId, weightKg: s.suggestedKg, acceptedAt: Date.now() }] });
                      toast('Starting load updated');
                    }
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {flags.length > 0 && <div className="alert warn">Progression suggestions are paused while discomfort is flagged.</div>}

      {current && history.length > 0 && (
        <>
          {load !== 'none' && (
            <ChartCard title={load === 'bodyweight' ? 'Added weight on top set' : 'Top set weight'} sub={load === 'bodyweight' ? '0 = bodyweight' : 'Heaviest completed set each session'}>
              <LineChart
                series={[{ id: 'w', label: 'Weight', color: SERIES[0], points: history.map((p) => ({ x: dayNum(p.date), y: p.topWeight, tip: `${fmtKg(p.topWeight, load)} × ${p.topReps}${p.deload ? ' (deload)' : ''}` })) }]}
                xFormat={dayLabel}
                yFormat={(v) => `${v} kg`}
                minPoints={2}
                empty="Two or more sessions are needed for a trend."
              />
            </ChartCard>
          )}
          <ChartCard title={isTime ? 'Longest hold' : 'Reps on top set'}>
            <LineChart
              series={[{ id: 'r', label: unit, color: SERIES[2], points: history.map((p) => ({ x: dayNum(p.date), y: p.topReps, tip: `${p.topReps} ${unit}` })) }]}
              xFormat={dayLabel}
              yFormat={(v) => String(v)}
              yMin={0}
              empty="Two or more sessions are needed for a trend."
            />
          </ChartCard>
          {load === 'external' && (
            <ChartCard title="Session volume" sub="Σ reps × kg">
              <LineChart
                series={[{ id: 'v', label: 'Volume', color: SERIES[1], points: history.map((p) => ({ x: dayNum(p.date), y: p.volumeKg, tip: `${Math.round(p.volumeKg ?? 0)} kg` })) }]}
                xFormat={dayLabel}
                yFormat={(v) => `${v}`}
                yMin={0}
                empty="Two or more sessions are needed for a trend."
              />
            </ChartCard>
          )}
          <div className="card">
            <div className="card-title">Sessions</div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Sets</th>
                    {load !== 'none' && <th>Load</th>}
                    <th>RIR</th>
                  </tr>
                </thead>
                <tbody>
                  {[...history].reverse().map((p) => (
                    <tr key={p.sessionId}>
                      <td>
                        {formatShort(p.date)}
                        {p.deload ? <span className="muted"> · deload</span> : ''}
                      </td>
                      <td>{p.sets.map((s) => s.value).join(' · ')}</td>
                      {load !== 'none' && <td>{Array.from(new Set(p.sets.map((s) => fmtKg(s.weightKg, p.load)))).join(', ')}</td>}
                      <td className="muted">{p.sets.some((s) => s.rir != null) ? p.sets.map((s) => s.rir ?? '–').join('/') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <p className="xsmall muted" style={{ margin: '4px' }}>
        A load suggestion appears only when every set reached the top of the rep range with {MIN_RIR}+ reps in reserve in each of your last {REQUIRED_SESSIONS} non-deload sessions. Nothing changes until you confirm.
      </p>
    </div>
  );
}
