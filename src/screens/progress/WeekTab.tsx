import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { BarChart, DEEMPH, LineChart, SERIES } from '../../components/charts/Charts';
import { FingerWeek } from '../../components/FingerWeek';
import { weeklySeries, weeklySummary, weekStarts } from '../../domain/summary';
import { CLIMB_STYLE_LABELS } from '../../data/programme';
import { GRIP_LABELS } from '../../data/defaults';
import { addDays, formatDuration, formatWeekRange, isValidISODate, startOfWeek, type ISODate } from '../../lib/dates';
import { gradeLabel } from '../../lib/grades';
import { fmtKg, fmtNum } from '../../lib/format';
import type { AllData } from '../../hooks/useAllData';
import { ChartCard, Stat, weekLabel, weekTitle } from './common';

export function WeekTab({ data, today, initialWeek }: { data: AllData; today: ISODate; initialWeek?: string }) {
  const [weekStart, setWeekStart] = useState(initialWeek && isValidISODate(initialWeek) ? startOfWeek(initialWeek) : startOfWeek(today));
  const input = { ...data, today };
  const s = useMemo(() => weeklySummary({ ...input, weekStart }), [data, today, weekStart]);
  const trend = useMemo(() => weeklySeries(input, weekStarts(startOfWeek(today), 8)), [data, today]);
  const c = s.consistency;
  const isFuture = weekStart > startOfWeek(today);

  return (
    <div data-testid="week-tab">
      <div className="row between" style={{ marginBottom: 12 }}>
        <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
          <Icon name="back" />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div className="strong" data-testid="week-range">
            {formatWeekRange(weekStart)}
          </div>
          <div className="xsmall muted">{s.isCurrentWeek ? 'This week · in progress' : isFuture ? 'Upcoming' : 'Weekly summary'}</div>
        </div>
        <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week" disabled={isFuture}>
          <Icon name="chevron" />
        </button>
      </div>

      <div className="card">
        <div className="card-title">Training consistency</div>
        <div className="stats">
          <Stat label="Sessions" value={<>{c.completed}<small> / {c.planned}</small></>} note={s.isCurrentWeek ? `${c.plannedToDate} planned so far` : 'completed / planned'} testId="stat-sessions" />
          <Stat label="Training time" value={c.trainingMinutes ? formatDuration(c.trainingMinutes) : '—'} testId="stat-hours" />
          <Stat label="Exercise completion" value={c.completionPct == null ? '—' : `${c.completionPct}%`} note={c.exercisesPlanned ? `${c.exercisesDone} of ${c.exercisesPlanned}` : undefined} testId="stat-completion" />
          <Stat label="Climbing sessions" value={c.climbingSessions} testId="stat-climbing-sessions" />
          {(c.skipped > 0 || c.inProgress > 0) && <Stat label="Skipped / unfinished" value={`${c.skipped} / ${c.inProgress}`} />}
          {c.walks > 0 && <Stat label="Walks" value={c.walks} />}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Strength</div>
        {s.strength.length ? (
          s.strength.map((l) => (
            <div className="kv" key={l.exerciseId}>
              <span>{l.name}</span>
              <span className="small">
                Best {l.topReps} reps{l.load !== 'none' ? ` @ ${fmtKg(l.topWeight, l.load)}` : ''} · {l.sets} sets
              </span>
            </div>
          ))
        ) : (
          <div className="small muted">No strength sets logged this week.</div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Climbing</div>
        <div className="stats">
          <Stat label="Highest sent" value={gradeLabel(s.climbing.topSent)} note={s.climbing.topAttempted != null ? `highest tried ${gradeLabel(s.climbing.topAttempted)}` : undefined} testId="stat-top-grade" />
          <Stat label="Problems" value={<>{s.climbing.sends}<small> / {s.climbing.problems}</small></>} note="sent / attempted" testId="stat-problems" />
          <Stat label="Attempts" value={s.climbing.attempts} />
          <Stat label="Climbing time" value={s.climbing.minutes ? formatDuration(s.climbing.minutes) : '—'} testId="stat-climb-time" />
        </div>
        {Object.keys(s.climbing.byStyle).length > 0 && (
          <div style={{ marginTop: 10 }}>
            {Object.entries(s.climbing.byStyle).map(([style, v]) => (
              <div className="kv" key={style}>
                <span>{CLIMB_STYLE_LABELS[style as keyof typeof CLIMB_STYLE_LABELS]}</span>
                <span className="small">
                  {v!.sends} sent of {v!.problems}
                </span>
              </div>
            ))}
          </div>
        )}
        {s.climbing.board.problems > 0 && (
          <div className="kv">
            <span>Board</span>
            <span className="small">
              {s.climbing.board.sends}/{s.climbing.board.problems} sent · top {gradeLabel(s.climbing.board.topSent)}
              {s.climbing.board.angles.length ? ` · ${s.climbing.board.angles.join('/')}°` : ''}
            </span>
          </div>
        )}
        {s.climbing.projects.map((p) => (
          <div className="kv" key={p.projectId}>
            <span>
              Project: {p.name} ({gradeLabel(p.grade)})
            </span>
            <span className="small">
              {p.sent ? 'Sent' : `${p.attempts} attempts`}
              {p.bestHighPoint != null && !p.sent ? ` · move ${p.bestHighPoint}${p.totalMoves ? `/${p.totalMoves}` : ''}` : ''}
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">Finger loading</div>
        <FingerWeek days={s.fingers.days} today={today} detailed />
        <div className="divider" />
        <div className="kv">
          <span>Hangboard sessions</span>
          <span>{s.fingers.hangSessions}</span>
        </div>
        {s.fingers.hangSessions > 0 && (
          <>
            <div className="kv">
              <span>Grips</span>
              <span className="small">{s.fingers.grips.map((g) => GRIP_LABELS[g]).join(', ')}</span>
            </div>
            <div className="kv">
              <span>Total hang time</span>
              <span>
                {s.fingers.hangSeconds} s · {s.fingers.hangSets} sets
              </span>
            </div>
            {s.fingers.blocks.map((b, i) => (
              <div className="kv" key={i}>
                <span className="small">{GRIP_LABELS[b.grip]}</span>
                <span className="small">
                  {b.edgeMm ? `${b.edgeMm} mm · ` : ''}
                  {b.sets} × {b.hangSec} s · {b.loadMode === 'bodyweight' ? 'BW' : b.loadMode === 'added' ? `+${b.loadKg} kg` : `−${b.loadKg} kg`}
                  {b.feetAssisted ? ' · feet' : ''}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title">Mobility & flexibility</div>
        <div className="kv">
          <span>Days with mobility work</span>
          <span data-testid="stat-mobility-days">{s.mobility.days}</span>
        </div>
        <div className="kv">
          <span>Exercises completed</span>
          <span>
            {s.mobility.inSessions + s.mobility.standalone}
            <span className="muted small"> ({s.mobility.inSessions} in sessions, {s.mobility.standalone} standalone)</span>
          </span>
        </div>
        <div className="kv">
          <span>Warm-up checklists used</span>
          <span>{s.mobility.warmupsCompleted}</span>
        </div>
        {s.mobility.rom.map((r) => (
          <div className="kv" key={`${r.metric}${r.side}`}>
            <span className="small">
              {r.label}
              {r.side ? ` (${r.side})` : ''}
            </span>
            <span className="small">
              {r.value} {r.unit}
              {r.previous != null && <span className="muted"> (prev {r.previous})</span>}
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">Recovery</div>
        {s.recovery.checkins ? (
          <>
            <div className="stats">
              <Stat label="Avg sleep" value={s.recovery.sleepHours != null ? `${s.recovery.sleepHours} h` : '—'} note={s.recovery.sleepQuality != null ? `quality ${s.recovery.sleepQuality}/5` : undefined} />
              <Stat label="Avg energy" value={s.recovery.energy != null ? `${s.recovery.energy}/5` : '—'} />
              <Stat label="Avg fatigue" value={s.recovery.fatigue != null ? `${s.recovery.fatigue}/5` : '—'} />
            </div>
            <div style={{ marginTop: 10 }}>
              {(['finger', 'elbow', 'shoulder'] as const).map((k) => (
                <div className="kv" key={k}>
                  <span>{k === 'finger' ? 'Finger' : k === 'elbow' ? 'Elbow' : 'Shoulder'} discomfort</span>
                  <span>
                    {s.recovery[k].avg != null ? `avg ${fmtNum(s.recovery[k].avg)} · max ${s.recovery[k].max}` : '—'}
                  </span>
                </div>
              ))}
            </div>
            <div className="xsmall muted" style={{ marginTop: 6 }}>
              From {s.recovery.checkins} check-in{s.recovery.checkins === 1 ? '' : 's'}.
            </div>
          </>
        ) : (
          <div className="small muted">No check-ins this week.</div>
        )}
      </div>

      <div className="section-label">Last 8 weeks</div>
      <ChartCard title="Sessions completed vs planned">
        <BarChart
          title="Sessions per week"
          legend={[
            { label: 'Completed', color: SERIES[0] },
            { label: 'Planned, not completed', color: DEEMPH },
          ]}
          data={trend.map((w) => ({
            key: w.weekStart,
            label: weekLabel(w.weekStart),
            title: weekTitle(w.weekStart),
            segments: [
              { id: 'done', label: 'Completed', value: w.consistency.completed, color: SERIES[0] },
              { id: 'missed', label: 'Not completed', value: Math.max(0, (w.isCurrentWeek ? w.consistency.plannedToDate : w.consistency.planned) - w.consistency.completed), color: DEEMPH },
            ],
          }))}
          empty="Sessions will appear here as you log them."
        />
      </ChartCard>
      <ChartCard title="Training hours per week">
        <LineChart
          series={[{ id: 'h', label: 'Hours', color: SERIES[0], points: trend.map((w, i) => ({ x: i, y: w.consistency.trainingMinutes ? Math.round((w.consistency.trainingMinutes / 60) * 10) / 10 : null, tip: formatDuration(w.consistency.trainingMinutes) })) }]}
          xFormat={(i) => weekLabel(trend[i]?.weekStart ?? trend[0].weekStart)}
          yFormat={(v) => `${v} h`}
          yMin={0}
          empty="Complete sessions to see weekly hours."
        />
      </ChartCard>
      <ChartCard title="Exercise completion per week">
        <LineChart
          series={[{ id: 'c', label: 'Completion', color: SERIES[2], points: trend.map((w, i) => ({ x: i, y: w.consistency.completionPct })) }]}
          xFormat={(i) => weekLabel(trend[i]?.weekStart ?? trend[0].weekStart)}
          yFormat={(v) => `${v}%`}
          yMin={0}
          yMax={100}
          empty="Log sessions to see completion."
        />
      </ChartCard>
    </div>
  );
}
