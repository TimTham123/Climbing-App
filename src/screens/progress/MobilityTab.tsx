import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { BarChart, LineChart, SERIES } from '../../components/charts/Charts';
import { MobilitySheet, RomSheet } from '../../components/sheets/LogSheets';
import { firstDataDate, weeklySeries } from '../../domain/summary';
import { GROUP_LABELS, LIBRARY, MOBILITY_GROUPS, ROM_METRICS } from '../../data/library';
import { formatShort, type ISODate } from '../../lib/dates';
import { uid } from '../../lib/id';
import type { AllData } from '../../hooks/useAllData';
import type { MobilityLog, RomMeasurement } from '../../db/types';
import { ChartCard, RangePicker, changeText, dayLabel, dayNum, rangeWeeks, weekLabel, weekTitle, type Range } from './common';

export function MobilityTab({ data, today }: { data: AllData; today: ISODate }) {
  const [range, setRange] = useState<Range>('12');
  const [rom, setRom] = useState<{ initial: RomMeasurement | null; metric?: string } | null>(null);
  const [mob, setMob] = useState<{ initial: MobilityLog | null } | null>(null);
  const weeks = useMemo(() => rangeWeeks(range, today, firstDataDate(data)), [range, today, data]);
  const series = useMemo(() => weeklySeries({ ...data, today }, weeks), [data, today, weeks]);

  const metricsWithData = ROM_METRICS.filter((m) => data.rom.some((r) => r.metric === m.id));
  const missingFocus = ROM_METRICS.filter((m) => ['pancake', 'hip', 'ankle', 'shoulder'].includes(m.focus) && !metricsWithData.includes(m));
  const usage = new Map<string, { count: number; last: ISODate }>();
  data.mobility.forEach((m) => {
    const u = usage.get(m.exerciseId) ?? { count: 0, last: m.date };
    u.count += 1;
    if (m.date > u.last) u.last = m.date;
    usage.set(m.exerciseId, u);
  });
  data.sessions.forEach((s) =>
    s.items.forEach((i) => {
      if (i.status !== 'done' || !LIBRARY.find((e) => e.id === i.exerciseId)?.mobility) return;
      const u = usage.get(i.exerciseId) ?? { count: 0, last: s.date };
      u.count += 1;
      if (s.date > u.last) u.last = s.date;
      usage.set(i.exerciseId, u);
    }),
  );

  return (
    <div data-testid="mobility-tab">
      <div className="btn-row" style={{ marginBottom: 14 }}>
        <button className="btn" onClick={() => setMob({ initial: null })} data-testid="mob-log">
          <Icon name="stretch" /> Log exercise
        </button>
        <button className="btn" onClick={() => setRom({ initial: null })} data-testid="rom-add">
          <Icon name="ruler" /> Measure range
        </button>
      </div>

      <div className="section-label">Range of motion</div>
      {metricsWithData.map((m) => {
        const rows = data.rom.filter((r) => r.metric === m.id).sort((a, b) => (a.date < b.date ? -1 : 1));
        const sides: Array<'L' | 'R' | null> = m.perSide ? ['L', 'R'] : [null];
        const lines = sides
          .map((side, i) => ({
            id: side ?? 'v',
            label: side === 'L' ? 'Left' : side === 'R' ? 'Right' : m.label,
            color: SERIES[i === 0 ? 0 : 1],
            points: rows.filter((r) => (r.side ?? null) === side).map((r) => ({ x: dayNum(r.date), y: r.value, tip: `${r.value} ${m.unit}` })),
          }))
          .filter((l) => l.points.length);
        const changes = sides
          .map((side) => {
            const rs = rows.filter((r) => (r.side ?? null) === side);
            if (rs.length < 2) return null;
            return `${side ? `${side}: ` : ''}${changeText(rs[0].value, rs[rs.length - 1].value, m.unit, m.better)} since ${formatShort(rs[0].date)}`;
          })
          .filter(Boolean);
        return (
          <ChartCard
            key={m.id}
            title={`${m.label} (${m.unit})`}
            sub={changes.length ? changes.join(' · ') : `${m.better === 'lower' ? 'Lower' : 'Higher'} = more range. Record again to see a trend.`}
            action={
              <button className="link-btn" onClick={() => setRom({ initial: null, metric: m.id })}>
                Add
              </button>
            }
          >
            <LineChart series={lines} xFormat={dayLabel} yFormat={(v) => `${v}`} minPoints={1} height={150} />
            <details className="disclosure" style={{ marginTop: 8 }}>
              <summary>Entries</summary>
              {[...rows].reverse().map((r) => (
                <button key={r.id} className="list-item" style={{ padding: '8px 0' }} onClick={() => setRom({ initial: r })}>
                  <span className="grow small">
                    {formatShort(r.date)}
                    {r.side ? ` · ${r.side}` : ''}
                  </span>
                  <span className="small tabular">
                    {r.value} {m.unit}
                  </span>
                </button>
              ))}
            </details>
          </ChartCard>
        );
      })}
      {missingFocus.length > 0 && (
        <div className="card">
          <div className="small text-2" style={{ marginBottom: 10 }}>
            Baselines not yet recorded:
          </div>
          <div className="chips">
            {missingFocus.map((m) => (
              <button key={m.id} className="chip" onClick={() => setRom({ initial: null, metric: m.id })}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <RangePicker value={range} onChange={setRange} />
      <ChartCard title="Days with mobility work per week">
        <BarChart
          data={series.map((w) => ({ key: w.weekStart, label: weekLabel(w.weekStart), title: weekTitle(w.weekStart), segments: [{ id: 'd', label: 'Days', value: w.mobility.days, color: SERIES[2] }] }))}
          empty="Mobility in sessions and standalone logs appears here."
        />
      </ChartCard>
      <ChartCard title="Mobility & flexibility exercises completed per week">
        <BarChart
          legend={[
            { label: 'In sessions', color: SERIES[0] },
            { label: 'Standalone', color: SERIES[1] },
          ]}
          data={series.map((w) => ({
            key: w.weekStart,
            label: weekLabel(w.weekStart),
            title: weekTitle(w.weekStart),
            segments: [
              { id: 's', label: 'In sessions', value: w.mobility.inSessions, color: SERIES[0] },
              { id: 'a', label: 'Standalone', value: w.mobility.standalone, color: SERIES[1] },
            ],
          }))}
        />
      </ChartCard>

      <div className="section-label">Exercise library</div>
      {MOBILITY_GROUPS.map((g) => (
        <div key={g}>
          <div className="xsmall muted strong" style={{ margin: '12px 4px 6px' }}>
            {GROUP_LABELS[g]}
          </div>
          <div className="card flush">
            {LIBRARY.filter((e) => e.group === g && e.mobility).map((e) => {
              const u = usage.get(e.id);
              return (
                <button
                  key={e.id}
                  className="list-item"
                  data-testid={`lib-${e.id}`}
                  onClick={() =>
                    setMob({
                      initial: {
                        id: uid('mob_'),
                        date: today,
                        exerciseId: e.id,
                        name: e.name,
                        sets: e.sets ?? 2,
                        reps: e.mode === 'reps' ? e.amount ?? 10 : null,
                        durationSec: e.mode === 'time' ? e.amount ?? 30 : null,
                        notes: null,
                        createdAt: Date.now(),
                      },
                    })
                  }
                >
                  <span className="grow">
                    <span className="small">{e.name}</span>
                    <span className="xsmall muted" style={{ display: 'block' }}>
                      {e.sets} × {e.amount}
                      {e.mode === 'time' ? ' s' : ''}
                      {e.per ? ` ${e.per}` : ''}
                      {u ? ` · done ${u.count}× · last ${formatShort(u.last)}` : ''}
                    </span>
                  </span>
                  <Icon name="plus" size={18} />
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="section-label">Recent standalone logs</div>
      <div className="card flush">
        {[...data.mobility]
          .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1))
          .slice(0, 15)
          .map((m) => (
            <button key={m.id} className="list-item" onClick={() => setMob({ initial: m })}>
              <span className="grow small">{m.name}</span>
              <span className="xsmall muted tabular">
                {formatShort(m.date)} · {m.sets ?? 1} × {m.reps != null ? `${m.reps}` : `${m.durationSec ?? 0} s`}
              </span>
            </button>
          ))}
        {!data.mobility.length && <div className="empty">Nothing logged yet.</div>}
      </div>

      <RomSheet open={!!rom} date={today} initial={rom?.initial ?? null} metric={rom?.metric} onClose={() => setRom(null)} />
      <MobilitySheet open={!!mob} date={today} initial={mob?.initial ?? null} onClose={() => setMob(null)} />
    </div>
  );
}
