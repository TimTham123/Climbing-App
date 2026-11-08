import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { BarChart, HBars, LineChart, SERIES } from '../../components/charts/Charts';
import { FingerWeek } from '../../components/FingerWeek';
import { Field, Sheet, useFeedback } from '../../components/ui';
import { HangBlockEditor, HangSheet, blankHangBlock } from '../../components/sheets/HangSheet';
import { updateSettings } from '../../db/repo';
import { blockPosition, hangboardUnlockDate, HANGBOARD_FROM_WEEK } from '../../domain/phase';
import { fingerLoadWeek } from '../../domain/fingerLoad';
import { hangboardSuggestion } from '../../domain/progression';
import { discomfortFlags, regionSeries } from '../../domain/recovery';
import { firstDataDate } from '../../domain/summary';
import { GRIP_LABELS, GRIPS } from '../../data/defaults';
import { addDays, formatShort, startOfWeek, type ISODate } from '../../lib/dates';
import { clone, uid } from '../../lib/id';
import { mean } from '../../lib/format';
import type { AllData } from '../../hooks/useAllData';
import type { Grip, HangBlock, HangSession, HangTemplate } from '../../db/types';
import { ChartCard, RangePicker, dayLabel, dayNum, rangeWeeks, weekLabel, weekTitle, type Range } from './common';

export function loadLabel(b: Pick<HangBlock, 'loadMode' | 'loadKg' | 'feetAssisted'>): string {
  const l = b.loadMode === 'bodyweight' ? 'Bodyweight' : b.loadMode === 'added' ? `+${b.loadKg} kg` : `−${b.loadKg} kg assist`;
  return b.feetAssisted ? `${l}, feet assisted` : l;
}

export function FingersTab({ data, today }: { data: AllData; today: ISODate }) {
  const { confirm, toast } = useFeedback();
  const [range, setRange] = useState<Range>('12');
  const [hang, setHang] = useState<HangSession | null>(null);
  const [editTpl, setEditTpl] = useState(false);
  const [weekStart, setWeekStart] = useState(startOfWeek(today));
  const [grip, setGrip] = useState<Grip | null>(null);
  const s = data.settings;
  const pos = blockPosition(s, today);
  const unlockDate = hangboardUnlockDate(s);
  const reachedWeek = !!pos && pos.week >= HANGBOARD_FROM_WEEK;
  const unlocked = s.hangboardUnlocked;
  const fingerSeries = regionSeries(data.checkins, 'finger', today, 14);
  const fingerMax = fingerSeries.length ? Math.max(...fingerSeries.map((p) => p.value)) : null;
  const fingerAvg = mean(fingerSeries.map((p) => p.value));
  const flags = discomfortFlags(data.checkins, today, data.hangs).filter((f) => f.region === 'finger');
  const suggestion = unlocked && !flags.length ? hangboardSuggestion(data.hangs, s) : null;

  const weeks = useMemo(() => rangeWeeks(range, today, firstDataDate(data)), [range, today, data]);
  const perWeek = useMemo(
    () => weeks.map((w) => ({ w, days: fingerLoadWeek({ weekStart: w, programmes: data.programmes, sessions: data.sessions, climbs: data.climbs, hangs: data.hangs }) })),
    [weeks, data],
  );
  const days = useMemo(() => fingerLoadWeek({ weekStart, programmes: data.programmes, sessions: data.sessions, climbs: data.climbs, hangs: data.hangs }), [weekStart, data]);
  const hangsInRange = data.hangs.filter((h) => h.date >= weeks[0] && h.date <= today);
  const blocks = hangsInRange.flatMap((h) => h.blocks.map((b) => ({ ...b, date: h.date })));
  const grips = GRIPS.filter((g) => blocks.some((b) => b.grip === g)) as Grip[];
  const currentGrip = grip ?? grips[0] ?? null;
  const gripBlocks = blocks.filter((b) => b.grip === currentGrip).sort((a, b) => (a.date < b.date ? -1 : 1));

  const startFromTemplate = () =>
    setHang({ id: uid('hng_'), date: today, fromTemplate: true, blocks: clone(s.hangTemplate.blocks).map((b) => ({ ...b, id: uid('hb_'), effort: null, discomfort: null })), notes: null, createdAt: Date.now(), updatedAt: Date.now() });
  const startManual = () => setHang({ id: uid('hng_'), date: today, fromTemplate: false, blocks: [blankHangBlock()], notes: null, createdAt: Date.now(), updatedAt: Date.now() });

  const applySuggestion = async () => {
    if (!suggestion) return;
    const tpl = clone(s.hangTemplate);
    const b = tpl.blocks[0];
    let change = '';
    if (b.feetAssisted) {
      b.feetAssisted = false;
      change = 'remove foot assistance';
    } else if (b.loadMode === 'assisted') {
      b.loadKg = Math.max(0, b.loadKg - 1);
      if (b.loadKg === 0) b.loadMode = 'bodyweight';
      change = 'reduce assistance by 1 kg';
    } else {
      b.loadMode = 'added';
      b.loadKg = Math.round((b.loadKg + 1) * 10) / 10;
      change = `set added weight to ${b.loadKg} kg`;
    }
    if (await confirm({ title: 'Update the hangboard template?', message: `This will ${change} for future sessions. Logged sessions are not changed.`, confirmLabel: 'Update template' })) {
      await updateSettings({ hangTemplate: tpl, dismissedSuggestions: [...s.dismissedSuggestions, suggestion.key] });
      toast('Template updated');
    }
  };

  return (
    <div data-testid="fingers-tab">
      <div className="card">
        <div className="card-title">Hangboard availability</div>
        {unlocked ? (
          <p className="small text-2">
            <span className="chip good" style={{ marginRight: 8 }}>
              Available
            </span>
            Introductory protocol enabled. It is never scheduled automatically — use it when recovery allows.
          </p>
        ) : reachedWeek ? (
          <>
            <p className="small text-2" style={{ marginBottom: 10 }}>
              You are in week {pos!.week}. The introductory protocol can be introduced now if recovery and finger tolerance have been good.
            </p>
            <div className="kv">
              <span>Finger discomfort, last 14 days</span>
              <span>{fingerSeries.length ? `max ${fingerMax}/10 · avg ${Math.round((fingerAvg ?? 0) * 10) / 10}` : 'no check-ins'}</span>
            </div>
            <div className="kv">
              <span>Check-ins recorded</span>
              <span>{fingerSeries.length} of 14 days</span>
            </div>
            {flags.length > 0 && <div className="alert warn" style={{ marginTop: 10 }}>{flags[0].message}</div>}
            <button
              className="btn btn-block"
              style={{ marginTop: 12 }}
              data-testid="unlock-hangboard"
              onClick={async () => {
                if (
                  await confirm({
                    title: 'Enable introductory hangboarding?',
                    message: 'Confirm that recovery has been good and your fingers feel healthy. You can disable it again at any time.',
                    confirmLabel: 'Enable',
                  })
                )
                  await updateSettings({ hangboardUnlocked: true });
              }}
            >
              Recovery has been good — enable protocol
            </button>
          </>
        ) : (
          <p className="small text-2">
            <span className="chip" style={{ marginRight: 8 }}>
              Locked
            </span>
            {unlockDate ? `The introductory protocol becomes available from week ${HANGBOARD_FROM_WEEK} (${formatShort(unlockDate)}), if recovery has been good.` : 'Set your training block start date in Profile. The protocol becomes available after the first four weeks.'}
          </p>
        )}
        <div className="btn-row" style={{ marginTop: 12 }}>
          {unlocked && (
            <button className="btn btn-primary" onClick={startFromTemplate} data-testid="start-template">
              <Icon name="play" /> Start from template
            </button>
          )}
          <button className="btn" onClick={startManual} data-testid="log-hang-manual">
            <Icon name="plus" /> Log hangs
          </button>
        </div>
      </div>

      {suggestion && (
        <div className="suggest">
          <div className="strong">{suggestion.text}</div>
          <div className="small" style={{ margin: '4px 0 10px' }}>
            {suggestion.reason}
          </div>
          <div className="btn-row">
            <button className="btn btn-sm" onClick={() => updateSettings({ dismissedSuggestions: [...s.dismissedSuggestions, suggestion.key] })}>
              Not now
            </button>
            <button className="btn btn-sm btn-primary" onClick={applySuggestion}>
              Review change
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">
          <span>Template · {s.hangTemplate.name}</span>
          <button className="link-btn" onClick={() => setEditTpl(true)} data-testid="edit-template">
            Edit
          </button>
        </div>
        {s.hangTemplate.blocks.map((b) => (
          <div className="kv" key={b.id}>
            <span>
              {GRIP_LABELS[b.grip]}
              {b.edgeMm ? ` · ${b.edgeMm} mm` : b.holdType ? ` · ${b.holdType}` : ''}
            </span>
            <span className="small">
              {b.sets} × {b.hangSec} s · rest {Math.round(b.restSec / 60 * 10) / 10} min
            </span>
          </div>
        ))}
        <p className="xsmall muted" style={{ marginTop: 8 }}>
          {s.hangTemplate.blocks.map((b) => loadLabel(b)).join(' · ')}. {s.hangTemplate.notes}
        </p>
      </div>

      <div className="card">
        <div className="card-title">
          <span>Weekly finger-loading pattern</span>
          <span className="row" style={{ gap: 2 }}>
            <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
              <Icon name="back" size={18} />
            </button>
            <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
              <Icon name="chevron" size={18} />
            </button>
          </span>
        </div>
        <div className="xsmall muted" style={{ marginBottom: 8 }}>
          Week of {formatShort(weekStart)}
        </div>
        <FingerWeek days={days} today={today} detailed />
      </div>

      <RangePicker value={range} onChange={setRange} />
      <ChartCard title="Finger-loading days per week" sub="Days with limit, board or project climbing, or hangboarding">
        <BarChart
          legend={[
            { label: 'Climbing only', color: SERIES[0] },
            { label: 'Hangboard only', color: SERIES[3] },
            { label: 'Both', color: SERIES[1] },
          ]}
          data={perWeek.map(({ w, days }) => {
            const climbOnly = days.filter((d) => d.climbing.styles.length && !d.hang.sessions).length;
            const hangOnly = days.filter((d) => !d.climbing.styles.length && d.hang.sessions).length;
            const both = days.filter((d) => d.climbing.styles.length && d.hang.sessions).length;
            return {
              key: w,
              label: weekLabel(w),
              title: weekTitle(w),
              segments: [
                { id: 'c', label: 'Climbing only', value: climbOnly, color: SERIES[0] },
                { id: 'h', label: 'Hangboard only', value: hangOnly, color: SERIES[3] },
                { id: 'b', label: 'Both', value: both, color: SERIES[1] },
              ],
            };
          })}
          empty="Finger loading will appear here as you log climbing and hangs."
        />
      </ChartCard>

      <ChartCard title="Hang sets by grip" sub="In the selected range">
        {grips.length ? (
          <HBars labelWidth={110} rows={grips.map((g) => ({ label: GRIP_LABELS[g], value: blocks.filter((b) => b.grip === g).reduce((a, b) => a + b.sets, 0), note: 'sets' }))} />
        ) : (
          <div className="small muted">No hangboard sessions in this range.</div>
        )}
      </ChartCard>

      {grips.length > 0 && currentGrip && (
        <>
          <div className="chips scroll" style={{ marginBottom: 12 }}>
            {grips.map((g) => (
              <button key={g} className={`chip${currentGrip === g ? ' selected' : ''}`} onClick={() => setGrip(g)}>
                {GRIP_LABELS[g]}
              </button>
            ))}
          </div>
          <ChartCard title={`${GRIP_LABELS[currentGrip]}: load`} sub="Added kg is positive, assistance negative. Feet-assisted hangs are marked in the tooltip.">
            <LineChart
              series={[{ id: 'l', label: 'Load', color: SERIES[0], points: gripBlocks.map((b) => ({ x: dayNum(b.date), y: b.loadMode === 'added' ? b.loadKg : b.loadMode === 'assisted' ? -b.loadKg : 0, tip: `${loadLabel(b)} · ${b.edgeMm ?? '—'} mm` })) }]}
              xFormat={dayLabel}
              yFormat={(v) => `${v} kg`}
              empty="Two or more sessions on this grip are needed."
            />
          </ChartCard>
          <ChartCard title={`${GRIP_LABELS[currentGrip]}: hang duration & edge`}>
            <LineChart
              series={[
                { id: 's', label: 'Hang (s)', color: SERIES[2], points: gripBlocks.map((b) => ({ x: dayNum(b.date), y: b.hangSec, tip: `${b.hangSec} s × ${b.sets}` })) },
                { id: 'e', label: 'Edge (mm)', color: SERIES[3], points: gripBlocks.map((b) => ({ x: dayNum(b.date), y: b.edgeMm ?? null, tip: `${b.edgeMm} mm` })) },
              ]}
              xFormat={dayLabel}
              yMin={0}
              empty="Two or more sessions on this grip are needed."
            />
          </ChartCard>
        </>
      )}

      <div className="section-label">Hangboard log</div>
      <div className="card flush">
        {[...data.hangs]
          .sort((a, b) => (a.date < b.date ? 1 : -1))
          .slice(0, 20)
          .map((h) => (
            <button key={h.id} className="list-item" onClick={() => setHang(h)}>
              <span className="grow">
                <span className="small strong">{formatShort(h.date)}</span>
                <span className="xsmall muted" style={{ display: 'block' }}>
                  {h.blocks.map((b) => `${GRIP_LABELS[b.grip]} ${b.edgeMm ? `${b.edgeMm} mm ` : ''}${b.sets}×${b.hangSec}s`).join(' · ')}
                </span>
              </span>
              <span className="xsmall muted tabular">
                {h.blocks[0]?.effort != null ? `effort ${h.blocks[0].effort}` : ''}
                {h.blocks.some((b) => (b.discomfort ?? 0) > 0) ? ` · pain ${Math.max(...h.blocks.map((b) => b.discomfort ?? 0))}` : ''}
              </span>
            </button>
          ))}
        {!data.hangs.length && <div className="empty">No hangboard sessions logged.</div>}
      </div>

      <HangSheet open={!!hang} initial={hang} onClose={() => setHang(null)} />
      <TemplateSheet open={editTpl} template={s.hangTemplate} onClose={() => setEditTpl(false)} />
    </div>
  );
}

function TemplateSheet({ open, template, onClose }: { open: boolean; template: HangTemplate; onClose: () => void }) {
  const [t, setT] = useState(clone(template));
  const { toast } = useFeedback();
  useEffect(() => {
    if (open) setT(clone(template));
  }, [open, template]);
  return (
    <Sheet
      open={open}
      title="Hangboard template"
      onClose={onClose}
      testId="template-sheet"
      footer={
        <button
          className="btn btn-primary btn-lg"
          onClick={async () => {
            await updateSettings({ hangTemplate: t });
            toast('Template saved');
            onClose();
          }}
        >
          Save template
        </button>
      }
    >
      <Field label="Name">
        <input className="input" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
      </Field>
      {t.blocks.map((b, i) => (
        <HangBlockEditor key={b.id} block={b} showOutcome={false} onChange={(nb) => setT({ ...t, blocks: t.blocks.map((x, j) => (j === i ? nb : x)) })} onRemove={t.blocks.length > 1 ? () => setT({ ...t, blocks: t.blocks.filter((_, j) => j !== i) }) : undefined} />
      ))}
      <button className="btn btn-block" onClick={() => setT({ ...t, blocks: [...t.blocks, blankHangBlock()] })}>
        Add grip
      </button>
      <div style={{ height: 14 }} />
      <Field label="Guidance">
        <textarea className="textarea" value={t.notes} onChange={(e) => setT({ ...t, notes: e.target.value })} />
      </Field>
    </Sheet>
  );
}
