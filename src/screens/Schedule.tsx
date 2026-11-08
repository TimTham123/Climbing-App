import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Field, Sheet, Stepper, useFeedback } from '../components/ui';
import { ExercisePickerSheet, type ExerciseChoice } from '../components/sheets/ExerciseSheets';
import { useProgrammes, useSessions, useSettings, useToday } from '../hooks/data';
import { goBack, navigate } from '../hooks/route';
import { resetProgrammeToDefault, saveProgramme, startProgrammeSession } from '../db/repo';
import { formatRx, programmeForDate, sessionCompletion } from '../domain/session';
import { blockPosition } from '../domain/phase';
import { plannedFingerStyles } from '../domain/fingerLoad';
import { CLIMB_STYLE_LABELS } from '../data/programme';
import { addDays, formatDayMonth, formatShort, formatWeekRange, startOfWeek, weekDates, WEEKDAY_NAMES, WEEKDAY_SHORT } from '../lib/dates';
import { clone, uid } from '../lib/id';
import { categoryColor } from './SessionScreen';
import type { DayPlan, PlanItem, Session } from '../db/types';

type DayState = 'done' | 'partial' | 'skipped' | 'missed' | 'planned' | 'rest' | 'today';

export function ScheduleScreen() {
  const today = useToday();
  const programmes = useProgrammes();
  const sessions = useSessions();
  const settings = useSettings();
  const [weekStart, setWeekStart] = useState(startOfWeek(today));
  const [openDay, setOpenDay] = useState<number | null>(null);

  if (!programmes || !sessions || !settings) return <div className="screen" />;
  const dates = weekDates(weekStart);
  const pos = blockPosition(settings, today);

  const stateFor = (date: string, day: DayPlan | undefined, list: Session[]): DayState => {
    const training = list.filter((s) => s.kind !== 'walk');
    if (training.some((s) => s.status === 'completed')) return 'done';
    if (training.some((s) => s.status === 'in_progress')) return 'partial';
    if (training.some((s) => s.status === 'skipped')) return 'skipped';
    if (!day || day.isRest) return 'rest';
    if (date < today) return 'missed';
    if (date === today) return 'today';
    return 'planned';
  };

  return (
    <div className="screen" data-testid="schedule-screen">
      <div className="page-head">
        <div>
          <h1 className="page-title">Schedule</h1>
          <div className="page-sub">Weekly programme, Monday to Sunday</div>
        </div>
        <button className="btn btn-sm" onClick={() => navigate('schedule/edit')} data-testid="edit-programme">
          <Icon name="edit" /> Edit
        </button>
      </div>

      {settings.blockStart && pos && (
        <div className="card tight">
          <div className="row between small">
            <span className="strong">{pos.inBlock ? `Week ${pos.week} · ${pos.phase?.name}` : 'Training block complete'}</span>
            <button className="link-btn" onClick={() => navigate('profile')}>
              Block settings
            </button>
          </div>
          <div className="phase-track" aria-label={`Week ${pos.week} of ${settings.blockWeeks}`}>
            {Array.from({ length: settings.blockWeeks }, (_, i) => i + 1).map((w) => (
              <span key={w} className={`${w < pos.week ? 'past' : w === pos.week ? 'now' : ''}${settings.deloadWeeks.includes(w) ? ' deload' : ''}`} title={`Week ${w}`} />
            ))}
          </div>
          <div className="xsmall muted">{pos.phase?.focus ?? 'Start a new block in Profile when you are ready.'}</div>
        </div>
      )}

      <div className="row between" style={{ margin: '14px 0 10px' }}>
        <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
          <Icon name="back" />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div className="strong">{formatWeekRange(weekStart)}</div>
          {weekStart !== startOfWeek(today) && (
            <button className="link-btn xsmall" onClick={() => setWeekStart(startOfWeek(today))}>
              This week
            </button>
          )}
        </div>
        <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
          <Icon name="chevron" />
        </button>
      </div>

      {dates.map((date, wd) => {
        const version = programmeForDate(programmes, date);
        const day = version?.days.find((d) => d.weekday === wd);
        const list = sessions.filter((s) => s.date === date);
        const state = stateFor(date, day, list);
        const fingers = plannedFingerStyles(programmes, date);
        const open = openDay === wd;
        const mainSession = list.find((s) => s.kind !== 'walk' && s.status !== 'skipped');
        const blockWeek = blockPosition(settings, date);
        return (
          <div key={date} className="card accent-card" style={{ ['--accent' as string]: categoryColor(day?.category ?? 'rest'), padding: 0, borderColor: date === today ? 'rgba(255,255,255,0.35)' : undefined }} data-testid={`day-${wd}`}>
            <button className="ex-head" style={{ paddingLeft: 18 }} onClick={() => setOpenDay(open ? null : wd)} aria-expanded={open}>
              <div style={{ width: 42, textAlign: 'center' }}>
                <div className="xsmall muted strong">{WEEKDAY_SHORT[wd].toUpperCase()}</div>
                <div className="strong tabular">{formatDayMonth(date).split(' ')[0]}</div>
              </div>
              <div className="grow">
                <div className="ex-name">{day?.title ?? 'No plan'}</div>
                <div className="ex-rx">
                  {day?.isRest ? 'Rest' : day?.durationMin ? (day.durationMax == null ? `${day.durationMin}+ min` : day.durationMax === day.durationMin ? `${day.durationMin} min` : `${day.durationMin}–${day.durationMax} min`) : ''}
                  {fingers.length ? ' · finger loading' : ''}
                  {blockWeek?.deload && !day?.isRest ? ' · deload' : ''}
                </div>
              </div>
              <StateMark state={state} session={mainSession} />
            </button>
            {open && day && (
              <div className="ex-body" style={{ paddingLeft: 18 }}>
                <p className="small text-2" style={{ marginBottom: 8 }}>
                  {day.objective}
                </p>
                {day.guidance.map((g) => (
                  <p key={g} className="xsmall muted" style={{ marginBottom: 6 }}>
                    {g}
                  </p>
                ))}
                {fingers.length > 0 && <span className="chip finger" style={{ marginBottom: 10 }}>Loads fingers: {fingers.map((f) => CLIMB_STYLE_LABELS[f].toLowerCase()).join(', ')}</span>}
                <PlanList day={day} />
                <div className="btn-row" style={{ marginTop: 12 }}>
                  {mainSession ? (
                    <button className="btn" onClick={() => navigate(`session/${mainSession.id}`)}>
                      Open session
                    </button>
                  ) : !day.isRest ? (
                    <button
                      className="btn"
                      onClick={async () => {
                        const s = await startProgrammeSession(today, wd);
                        navigate(`session/${s.id}`);
                      }}
                      data-testid="start-this-today"
                    >
                      <Icon name="play" /> {date === today ? 'Start session' : 'Do this today'}
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        );
      })}
      <p className="xsmall muted" style={{ margin: '8px 4px' }}>
        Hangboarding is never scheduled automatically. Log it from Today when you choose to do it.
      </p>
    </div>
  );
}

function StateMark({ state, session }: { state: DayState; session?: Session }) {
  const map: Record<DayState, { label: string; cls: string; icon?: string }> = {
    done: { label: 'Done', cls: 'chip good', icon: 'check' },
    partial: { label: session ? `${sessionCompletion(session).pct ?? 0}%` : 'Started', cls: 'chip warn' },
    skipped: { label: 'Skipped', cls: 'chip' },
    missed: { label: 'Not logged', cls: 'chip' },
    planned: { label: 'Planned', cls: 'chip' },
    today: { label: 'Today', cls: 'chip' },
    rest: { label: 'Rest', cls: 'chip' },
  };
  const m = map[state];
  return (
    <span className={m.cls} style={{ flex: 'none', opacity: state === 'missed' || state === 'rest' ? 0.7 : 1 }}>
      {m.icon && <Icon name={m.icon} size={13} />}
      {m.label}
    </span>
  );
}

function PlanList({ day }: { day: DayPlan }) {
  const sections: Array<{ name: string; items: PlanItem[] }> = [];
  day.items.forEach((i) => {
    const last = sections[sections.length - 1];
    if (last && last.name === i.section) last.items.push(i);
    else sections.push({ name: i.section, items: [i] });
  });
  if (!sections.length) return <p className="small muted">Optional gentle walking or mobility.</p>;
  return (
    <>
      {sections.map((sec, i) => (
        <div key={`${sec.name}-${i}`}>
          <div className="xsmall muted strong" style={{ margin: '10px 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {sec.name}
          </div>
          <ul className="preview-list" style={{ marginBottom: 0 }}>
            {sec.items.map((it) => (
              <li key={it.id}>
                <span>{it.name}</span>
                <span className="rx">{formatRx(it.rx, it.mode)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Programme editor                                                    */
/* ------------------------------------------------------------------ */

export function ProgrammeEditor() {
  const today = useToday();
  const programmes = useProgrammes();
  const { confirm, toast } = useFeedback();
  const current = useMemo(() => (programmes ? programmeForDate(programmes, today) : null), [programmes, today]);
  const [days, setDays] = useState<DayPlan[] | null>(null);
  const [wd, setWd] = useState(0);
  const [editing, setEditing] = useState<PlanItem | null>(null);
  const [picker, setPicker] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (current && !days) setDays(clone(current.days));
  }, [current, days]);
  if (!days || !current) return <div className="screen" />;
  const day = days[wd];
  const update = (fn: (d: DayPlan) => void) => {
    const next = clone(days);
    fn(next[wd]);
    setDays(next);
    setDirty(true);
  };
  const move = (idx: number, dir: -1 | 1) =>
    update((d) => {
      const j = idx + dir;
      if (j < 0 || j >= d.items.length) return;
      const [it] = d.items.splice(idx, 1);
      d.items.splice(j, 0, it);
    });

  const save = async () => {
    await saveProgramme(days, 'Edited programme', today);
    setDirty(false);
    toast('Programme saved · applies from today');
    navigate('schedule');
  };
  const restore = async () => {
    if (await confirm({ title: 'Restore the original programme?', message: 'It applies from today. Past sessions keep the programme they were logged with.', confirmLabel: 'Restore' })) {
      await resetProgrammeToDefault(today);
      setDays(null);
      setDirty(false);
      toast('Original programme restored');
    }
  };
  const addItem = (c: ExerciseChoice) => {
    update((d) => d.items.push({ id: uid('pi_'), exerciseId: c.exerciseId, name: c.name, section: d.items[d.items.length - 1]?.section ?? 'Main', mode: c.mode, load: c.load, rx: c.rx, restSec: null, climbStyle: c.mode === 'climb' ? 'volume' : null, notes: null }));
    setPicker(false);
  };

  return (
    <>
      <div className="topbar">
        <button
          className="icon-btn"
          onClick={async () => {
            if (!dirty || (await confirm({ title: 'Discard changes?', confirmLabel: 'Discard', danger: true }))) goBack('schedule');
          }}
          aria-label="Back"
        >
          <Icon name="back" />
        </button>
        <div className="topbar-title">
          Edit programme
          <span className="topbar-sub">Changes apply from {formatShort(today)}</span>
        </div>
        <button className="btn btn-sm btn-primary" onClick={save} disabled={!dirty} data-testid="save-programme">
          Save
        </button>
      </div>
      <div className="screen with-topbar" data-testid="programme-editor">
        <div className="alert info">
          <Icon name="info" />
          <div>Past sessions and their planned counts keep the programme they were logged with, so your history never changes.</div>
        </div>
        <div className="chips scroll" style={{ marginBottom: 14 }}>
          {days.map((_, i) => (
            <button key={i} className={`chip${wd === i ? ' selected' : ''}`} onClick={() => setWd(i)}>
              {WEEKDAY_SHORT[i]}
            </button>
          ))}
        </div>
        <div className="card">
          <Field label={`${WEEKDAY_NAMES[wd]} title`}>
            <input className="input" value={day.title} onChange={(e) => update((d) => void (d.title = e.target.value))} />
          </Field>
          <div className="grid-2">
            <Stepper label="Min duration" value={day.durationMin} onChange={(v) => update((d) => void (d.durationMin = v))} step={5} max={300} size="sm" />
            <Stepper label="Max duration" value={day.durationMax} onChange={(v) => update((d) => void (d.durationMax = v))} step={5} max={300} size="sm" />
          </div>
          <div style={{ height: 12 }} />
          <Field label="Objective">
            <textarea className="textarea" value={day.objective} onChange={(e) => update((d) => void (d.objective = e.target.value))} />
          </Field>
          <div className="setting-row">
            <span>Rest day</span>
            <input type="checkbox" checked={day.isRest} onChange={(e) => update((d) => void (d.isRest = e.target.checked))} style={{ width: 22, height: 22 }} aria-label="Rest day" />
          </div>
        </div>
        <div className="card flush">
          {day.items.map((it, idx) => (
            <div className="list-item" key={it.id}>
              <button className="grow" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0, color: 'inherit' }} onClick={() => setEditing(it)}>
                <div className="strong small">{it.name}</div>
                <div className="xsmall muted">
                  {it.section} · {formatRx(it.rx, it.mode)}
                </div>
              </button>
              <button className="icon-btn" style={{ width: 36 }} onClick={() => move(idx, -1)} aria-label="Move up" disabled={idx === 0}>
                <Icon name="up" size={18} />
              </button>
              <button className="icon-btn" style={{ width: 36 }} onClick={() => move(idx, 1)} aria-label="Move down" disabled={idx === day.items.length - 1}>
                <Icon name="down" size={18} />
              </button>
            </div>
          ))}
          {!day.items.length && <div className="empty">No exercises on this day.</div>}
        </div>
        <button className="btn btn-block" onClick={() => setPicker(true)} data-testid="programme-add">
          <Icon name="plus" /> Add exercise to {WEEKDAY_NAMES[wd]}
        </button>
        <div style={{ height: 20 }} />
        <button className="btn btn-block btn-ghost" onClick={restore}>
          Restore original programme
        </button>
      </div>
      <PlanItemSheet
        item={editing}
        onClose={() => setEditing(null)}
        onSave={(it) => {
          update((d) => (d.items = d.items.map((x) => (x.id === it.id ? it : x))));
          setEditing(null);
        }}
        onDelete={(it) => {
          update((d) => (d.items = d.items.filter((x) => x.id !== it.id)));
          setEditing(null);
        }}
      />
      <ExercisePickerSheet open={picker} title="Add to programme" onClose={() => setPicker(false)} onChoose={addItem} />
    </>
  );
}

function PlanItemSheet({ item, onClose, onSave, onDelete }: { item: PlanItem | null; onClose: () => void; onSave: (i: PlanItem) => void; onDelete: (i: PlanItem) => void }) {
  const [it, setIt] = useState<PlanItem | null>(null);
  useEffect(() => setIt(item ? clone(item) : null), [item]);
  if (!it) return null;
  const rx = it.rx;
  const setRx = (p: Partial<PlanItem['rx']>) => setIt({ ...it, rx: { ...rx, ...p } });
  const isSets = it.mode === 'reps' || it.mode === 'time';
  return (
    <Sheet
      open={!!item}
      title="Edit exercise"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-danger" style={{ flex: 'none' }} onClick={() => onDelete(it)}>
            Remove
          </button>
          <button className="btn btn-primary btn-lg" onClick={() => onSave(it)} data-testid="plan-item-save">
            Done
          </button>
        </>
      }
    >
      <Field label="Name">
        <input className="input" value={it.name} onChange={(e) => setIt({ ...it, name: e.target.value })} />
      </Field>
      <Field label="Section">
        <input className="input" value={it.section} onChange={(e) => setIt({ ...it, section: e.target.value })} />
      </Field>
      {isSets && (
        <div className="grid-2">
          <Stepper label="Sets" value={rx.sets} onChange={(v) => setRx({ sets: Math.max(1, v ?? 1) })} min={1} max={12} size="sm" />
          <Stepper label="Up to sets (optional)" value={rx.setsMax ?? null} onChange={(v) => setRx({ setsMax: v })} min={0} max={12} size="sm" />
        </div>
      )}
      {it.mode !== 'check' && (
        <div className="grid-2" style={{ marginTop: 12 }}>
          <Stepper label={it.mode === 'time' ? 'Min seconds' : it.mode === 'climb' ? 'Min minutes' : it.mode === 'count' ? 'Climbs' : 'Min reps'} value={rx.min ?? null} onChange={(v) => setRx({ min: v })} step={it.mode === 'time' || it.mode === 'climb' ? 5 : 1} max={600} size="sm" testId="plan-min" />
          {it.mode !== 'count' && <Stepper label="Max (optional)" value={rx.max ?? null} onChange={(v) => setRx({ max: v })} step={it.mode === 'time' || it.mode === 'climb' ? 5 : 1} max={600} size="sm" testId="plan-max" />}
        </div>
      )}
      {isSets && (
        <div style={{ marginTop: 12 }}>
          <Stepper label="Rest between sets (s)" value={it.restSec ?? null} onChange={(v) => setIt({ ...it, restSec: v })} step={15} max={600} size="sm" />
        </div>
      )}
      <div style={{ height: 12 }} />
      <Field label="Prescription note">
        <input className="input" value={rx.note ?? ''} onChange={(e) => setRx({ note: e.target.value || null })} placeholder="e.g. 5 minutes" />
      </Field>
      <Field label="Coaching notes">
        <input className="input" value={it.notes ?? ''} onChange={(e) => setIt({ ...it, notes: e.target.value || null })} />
      </Field>
    </Sheet>
  );
}

