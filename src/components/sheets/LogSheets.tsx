import { useEffect, useMemo, useState } from 'react';
import { Field, NumberField, Sheet, Stepper, useFeedback } from '../ui';
import { Icon } from '../Icon';
import {
  deleteAssessment,
  deleteBody,
  deleteMobility,
  deleteRom,
  logWalk,
  saveAssessment,
  saveBody,
  saveMobility,
  saveRom,
} from '../../db/repo';
import { GROUP_LABELS, LIBRARY, MOBILITY_GROUPS, ROM_METRICS, romMetric, type LibraryExercise } from '../../data/library';
import { GRIP_LABELS, GRIPS } from '../../data/defaults';
import { GradePicker } from './ClimbSheet';
import { clone, uid } from '../../lib/id';
import { gradeLabel } from '../../lib/grades';
import { db } from '../../db/db';
import { formatShort, type ISODate } from '../../lib/dates';
import type { Assessment, AssessmentType, BodyMeasurement, Grip, MobilityLog, RomMeasurement } from '../../db/types';

/* ------------------------------------------------------------------ */
/* Mobility exercise picker + log                                      */
/* ------------------------------------------------------------------ */

export function MobilityPicker({ onPick, testId }: { onPick: (e: LibraryExercise) => void; testId?: string }) {
  const [q, setQ] = useState('');
  const lib = LIBRARY.filter((e) => e.mobility);
  const filtered = q ? lib.filter((e) => e.name.toLowerCase().includes(q.toLowerCase())) : lib;
  return (
    <div data-testid={testId}>
      <div className="search" style={{ marginBottom: 10 }}>
        <Icon name="search" />
        <input className="input" placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {MOBILITY_GROUPS.map((g) => {
        const items = filtered.filter((e) => e.group === g);
        if (!items.length) return null;
        return (
          <div key={g}>
            <div className="section-label" style={{ marginTop: 14 }}>
              {GROUP_LABELS[g]}
            </div>
            <div className="card flush">
              {items.map((e) => (
                <button key={e.id} className="list-item" onClick={() => onPick(e)}>
                  <span className="grow">{e.name}</span>
                  <span className="xsmall muted tabular">
                    {e.sets} × {e.amount}
                    {e.mode === 'time' ? ' s' : ''}
                    {e.per ? ` ${e.per}` : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MobilitySheet({ open, date, initial, onClose }: { open: boolean; date: ISODate; initial?: MobilityLog | null; onClose: () => void }) {
  const [log, setLog] = useState<MobilityLog | null>(null);
  const [exists, setExists] = useState(false);
  const { confirm, toast } = useFeedback();
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLog(initial ? clone(initial) : null);
    setExists(false);
    if (initial) db.mobility.get(initial.id).then((e) => alive && setExists(!!e));
    return () => {
      alive = false;
    };
  }, [open, initial]);

  const pick = (e: LibraryExercise) =>
    setLog({
      id: uid('mob_'),
      date,
      exerciseId: e.id,
      name: e.name,
      sets: e.sets ?? 2,
      reps: e.mode === 'reps' ? e.amount ?? 10 : null,
      durationSec: e.mode === 'time' ? e.amount ?? 30 : null,
      notes: null,
      createdAt: Date.now(),
    });
  const save = async () => {
    if (!log) return;
    await saveMobility(log);
    toast(`${log.name} logged`);
    if (initial) onClose();
    else setLog(null); // stay open to log another exercise quickly
  };
  const remove = async () => {
    if (log && (await confirm({ title: `Delete ${log.name}?`, confirmLabel: 'Delete', danger: true }))) {
      await deleteMobility(log.id);
      onClose();
    }
  };

  return (
    <Sheet
      open={open}
      title={log ? log.name : 'Log mobility'}
      onClose={onClose}
      testId="mobility-sheet"
      footer={
        log ? (
          <>
            {exists ? (
              <button className="btn btn-danger" style={{ flex: 'none' }} onClick={remove}>
                Delete
              </button>
            ) : initial ? null : (
              <button className="btn" style={{ flex: 'none' }} onClick={() => setLog(null)}>
                Back
              </button>
            )}
            <button className="btn btn-primary btn-lg" onClick={save} data-testid="mobility-save">
              Save
            </button>
          </>
        ) : undefined
      }
    >
      {!log ? (
        <MobilityPicker onPick={pick} testId="mobility-picker" />
      ) : (
        <>
          <div className="grid-2">
            <Stepper label="Sets" value={log.sets} onChange={(v) => setLog({ ...log, sets: v })} min={1} max={20} />
            {log.durationSec != null ? (
              <Stepper label="Seconds" value={log.durationSec} onChange={(v) => setLog({ ...log, durationSec: v })} step={5} min={0} max={600} />
            ) : (
              <Stepper label="Reps" value={log.reps} onChange={(v) => setLog({ ...log, reps: v })} min={0} max={200} />
            )}
          </div>
          <div style={{ height: 8 }} />
          <button className="link-btn" onClick={() => setLog(log.durationSec != null ? { ...log, durationSec: null, reps: 10 } : { ...log, reps: null, durationSec: 30 })}>
            Record {log.durationSec != null ? 'reps' : 'duration'} instead
          </button>
          <div style={{ height: 14 }} />
          <Field label="Date">
            <input className="input" type="date" value={log.date} onChange={(e) => e.target.value && setLog({ ...log, date: e.target.value })} />
          </Field>
          <Field label="Notes">
            <input className="input" value={log.notes ?? ''} onChange={(e) => setLog({ ...log, notes: e.target.value || null })} placeholder="e.g. felt tight on the left" />
          </Field>
        </>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Range-of-motion measurements                                        */
/* ------------------------------------------------------------------ */

export function RomSheet({ open, date, initial, metric: initialMetric, onClose }: { open: boolean; date: ISODate; initial?: RomMeasurement | null; metric?: string; onClose: () => void }) {
  const [metric, setMetric] = useState(initial?.metric ?? initialMetric ?? ROM_METRICS[0].id);
  const [d, setD] = useState(initial?.date ?? date);
  const [vals, setVals] = useState<{ C: number | null; L: number | null; R: number | null }>({ C: null, L: null, R: null });
  const [notes, setNotes] = useState('');
  const { confirm, toast } = useFeedback();
  useEffect(() => {
    if (!open) return;
    setMetric(initial?.metric ?? initialMetric ?? ROM_METRICS[0].id);
    setD(initial?.date ?? date);
    setNotes(initial?.notes ?? '');
    setVals(initial ? { C: initial.side ? null : initial.value, L: initial.side === 'L' ? initial.value : null, R: initial.side === 'R' ? initial.value : null } : { C: null, L: null, R: null });
  }, [open, initial, initialMetric, date]);
  const def = romMetric(metric)!;
  const editingSide = initial?.side ?? null;

  const save = async () => {
    const rows: RomMeasurement[] = [];
    const base = { date: d, metric, notes: notes || null, createdAt: Date.now() };
    if (def.perSide) {
      (['L', 'R'] as const).forEach((side) => {
        const v = vals[side];
        if (v == null) return;
        if (initial && editingSide !== side) return;
        rows.push({ ...base, id: initial?.id ?? uid('rom_'), side, value: v });
      });
    } else if (vals.C != null) rows.push({ ...base, id: initial?.id ?? uid('rom_'), side: null, value: vals.C });
    if (!rows.length) return;
    for (const r of rows) await saveRom(r);
    toast('Measurement saved');
    onClose();
  };
  const remove = async () => {
    if (initial && (await confirm({ title: 'Delete this measurement?', confirmLabel: 'Delete', danger: true }))) {
      await deleteRom(initial.id);
      onClose();
    }
  };

  return (
    <Sheet
      open={open}
      title={initial ? 'Edit measurement' : 'Record range of motion'}
      onClose={onClose}
      testId="rom-sheet"
      footer={
        <>
          {initial && (
            <button className="btn btn-danger" style={{ flex: 'none' }} onClick={remove}>
              Delete
            </button>
          )}
          <button className="btn btn-primary btn-lg" onClick={save} data-testid="rom-save">
            Save
          </button>
        </>
      }
    >
      <Field label="Measurement">
        <select className="select" value={metric} onChange={(e) => setMetric(e.target.value)} disabled={!!initial} data-testid="rom-metric">
          {ROM_METRICS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} ({m.unit})
            </option>
          ))}
        </select>
      </Field>
      <p className="small muted" style={{ marginBottom: 14 }}>
        {def.how} {def.better === 'lower' ? 'Lower numbers mean more range.' : 'Higher numbers mean more range.'}
      </p>
      {def.perSide ? (
        <div className="grid-2">
          {(!initial || editingSide === 'L') && <Stepper label={`Left (${def.unit})`} value={vals.L} onChange={(v) => setVals({ ...vals, L: v })} step={0.5} decimals={1} min={-50} max={200} />}
          {(!initial || editingSide === 'R') && <Stepper label={`Right (${def.unit})`} value={vals.R} onChange={(v) => setVals({ ...vals, R: v })} step={0.5} decimals={1} min={-50} max={200} />}
        </div>
      ) : (
        <Stepper label={`Value (${def.unit})`} value={vals.C} onChange={(v) => setVals({ ...vals, C: v })} step={0.5} decimals={1} min={-50} max={300} testId="rom-value" />
      )}
      <div style={{ height: 14 }} />
      <Field label="Date">
        <input className="input" type="date" value={d} onChange={(e) => e.target.value && setD(e.target.value)} />
      </Field>
      <Field label="Notes">
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </Field>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Body composition                                                    */
/* ------------------------------------------------------------------ */

export function BodySheet({ open, date, initial, onClose }: { open: boolean; date: ISODate; initial?: BodyMeasurement | null; onClose: () => void }) {
  const blank = (): BodyMeasurement => ({ id: uid('bdy_'), date, weightKg: null, bodyFatPct: null, leanMassKg: null, waistCm: null, notes: null, createdAt: Date.now() });
  const [b, setB] = useState<BodyMeasurement>(initial ?? blank());
  const { confirm, toast } = useFeedback();
  useEffect(() => {
    if (open) setB(initial ? clone(initial) : blank());
  }, [open, initial]);
  const save = async () => {
    if (b.weightKg == null && b.bodyFatPct == null && b.leanMassKg == null && b.waistCm == null) return;
    await saveBody(b);
    toast('Measurement saved');
    onClose();
  };
  const remove = async () => {
    if (initial && (await confirm({ title: 'Delete this measurement?', confirmLabel: 'Delete', danger: true }))) {
      await deleteBody(initial.id);
      onClose();
    }
  };
  return (
    <Sheet
      open={open}
      title={initial ? 'Edit body measurement' : 'Body measurement'}
      onClose={onClose}
      testId="body-sheet"
      footer={
        <>
          {initial && (
            <button className="btn btn-danger" style={{ flex: 'none' }} onClick={remove}>
              Delete
            </button>
          )}
          <button className="btn btn-primary btn-lg" onClick={save} data-testid="body-save">
            Save
          </button>
        </>
      }
    >
      <div className="grid-2">
        <NumberField label="Body weight" suffix="kg" value={b.weightKg} onChange={(v) => setB({ ...b, weightKg: v })} testId="body-weight" />
        <NumberField label="Body fat" suffix="%, optional" value={b.bodyFatPct} onChange={(v) => setB({ ...b, bodyFatPct: v })} />
        <NumberField label="Lean mass" suffix="kg, optional" value={b.leanMassKg} onChange={(v) => setB({ ...b, leanMassKg: v })} />
        <NumberField label="Waist" suffix="cm, optional" value={b.waistCm} onChange={(v) => setB({ ...b, waistCm: v })} />
      </div>
      <Field label="Date">
        <input className="input" type="date" value={b.date} onChange={(e) => e.target.value && setB({ ...b, date: e.target.value })} />
      </Field>
      <Field label="Notes">
        <input className="input" value={b.notes ?? ''} onChange={(e) => setB({ ...b, notes: e.target.value || null })} placeholder="e.g. morning, before breakfast" />
      </Field>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Baseline assessments                                                */
/* ------------------------------------------------------------------ */

export const ASSESSMENT_LABELS: Record<AssessmentType, string> = {
  pullups: 'Pull-ups',
  squat: 'Squat',
  bench: 'Bench press',
  finger: 'Finger strength',
  grade: 'Climbing grade',
  flexibility: 'Flexibility',
};

export function AssessmentSheet({ open, date, initial, onClose, onFlexibility }: { open: boolean; date: ISODate; initial?: Assessment | null; onClose: () => void; onFlexibility?: () => void }) {
  const blank = (type: AssessmentType = 'pullups'): Assessment => ({ id: uid('asm_'), date, type, exercise: null, reps: null, weightKg: null, grip: null, edgeMm: null, hangSec: null, grade: null, value: null, notes: null, createdAt: Date.now() });
  const [a, setA] = useState<Assessment>(initial ?? blank());
  const { confirm, toast } = useFeedback();
  useEffect(() => {
    if (open) setA(initial ? clone(initial) : blank());
  }, [open, initial]);
  const set = <K extends keyof Assessment>(k: K, v: Assessment[K]) => setA((p) => ({ ...p, [k]: v }));
  const save = async () => {
    await saveAssessment(a);
    toast('Assessment saved');
    onClose();
  };
  const remove = async () => {
    if (initial && (await confirm({ title: 'Delete this assessment?', confirmLabel: 'Delete', danger: true }))) {
      await deleteAssessment(initial.id);
      onClose();
    }
  };
  const types = Object.keys(ASSESSMENT_LABELS) as AssessmentType[];
  return (
    <Sheet
      open={open}
      title={initial ? 'Edit assessment' : 'Baseline assessment'}
      onClose={onClose}
      testId="assessment-sheet"
      footer={
        <>
          {initial && (
            <button className="btn btn-danger" style={{ flex: 'none' }} onClick={remove}>
              Delete
            </button>
          )}
          <button className="btn btn-primary btn-lg" onClick={save} data-testid="assessment-save">
            Save
          </button>
        </>
      }
    >
      {!initial && (
        <Field label="What are you assessing?">
          <div className="chips">
            {types.map((t) => (
              <button type="button" key={t} className={`chip${a.type === t ? ' selected' : ''}`} onClick={() => setA({ ...blank(t), date: a.date })}>
                {ASSESSMENT_LABELS[t]}
              </button>
            ))}
          </div>
        </Field>
      )}
      {a.type === 'pullups' && (
        <div className="grid-2">
          <Stepper label="Max strict reps" value={a.reps} onChange={(v) => set('reps', v)} min={0} max={60} />
          <Stepper label="Added weight (kg)" value={a.weightKg} onChange={(v) => set('weightKg', v)} step={1.25} decimals={2} min={0} max={100} />
        </div>
      )}
      {(a.type === 'squat' || a.type === 'bench') && (
        <>
          <Field label="Exercise">
            <input className="input" value={a.exercise ?? ''} onChange={(e) => set('exercise', e.target.value || null)} placeholder={a.type === 'squat' ? 'e.g. Front squat' : 'e.g. Incline DB bench'} />
          </Field>
          <div className="grid-2">
            <Stepper label="Weight (kg)" value={a.weightKg} onChange={(v) => set('weightKg', v)} step={2.5} decimals={2} min={0} max={400} />
            <Stepper label="Reps" value={a.reps} onChange={(v) => set('reps', v)} min={1} max={30} />
          </div>
          <p className="xsmall muted" style={{ marginTop: 8 }}>
            A submaximal set (e.g. a 5-rep set with 1–2 in reserve) is enough. No one-rep max required.
          </p>
        </>
      )}
      {a.type === 'finger' && (
        <>
          <Field label="Grip">
            <div className="chips">
              {GRIPS.map((g) => (
                <button type="button" key={g} className={`chip${a.grip === g ? ' selected' : ''}`} onClick={() => set('grip', g as Grip)}>
                  {GRIP_LABELS[g]}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid-3">
            <Stepper label="Edge (mm)" value={a.edgeMm} onChange={(v) => set('edgeMm', v)} min={0} max={60} size="sm" />
            <Stepper label="Hang (s)" value={a.hangSec} onChange={(v) => set('hangSec', v)} min={0} max={120} size="sm" />
            <Stepper label="± kg" value={a.weightKg} onChange={(v) => set('weightKg', v)} step={0.5} decimals={1} min={-60} max={80} size="sm" />
          </div>
          <p className="xsmall muted" style={{ marginTop: 8 }}>
            Use negative kg for assistance. Only assess when fingers are recovered and pain-free.
          </p>
        </>
      )}
      {a.type === 'grade' && (
        <Field label="Highest grade completed in the assessment session">
          <GradePicker value={a.grade ?? null} onChange={(g) => set('grade', g)} />
        </Field>
      )}
      {a.type === 'flexibility' && (
        <div className="alert info">
          <div>
            Flexibility is recorded as range-of-motion measurements so each one can be charted over time.
            {onFlexibility && (
              <div style={{ marginTop: 10 }}>
                <button className="btn btn-sm" onClick={onFlexibility}>
                  Record measurements
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <div style={{ height: 14 }} />
      <Field label="Date">
        <input className="input" type="date" value={a.date} onChange={(e) => e.target.value && set('date', e.target.value)} />
      </Field>
      <Field label="Notes">
        <textarea className="textarea" value={a.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} />
      </Field>
    </Sheet>
  );
}

export function assessmentSummary(a: Assessment): string {
  switch (a.type) {
    case 'pullups':
      return `${a.reps ?? '—'} reps${a.weightKg ? ` @ +${a.weightKg} kg` : ' bodyweight'}`;
    case 'squat':
    case 'bench':
      return `${a.exercise ? `${a.exercise}: ` : ''}${a.weightKg ?? '—'} kg × ${a.reps ?? '—'}`;
    case 'finger':
      return `${a.grip ? GRIP_LABELS[a.grip] : 'Grip'} ${a.edgeMm ?? '—'} mm · ${a.hangSec ?? '—'} s${a.weightKg ? ` @ ${a.weightKg > 0 ? '+' : ''}${a.weightKg} kg` : ''}`;
    case 'grade':
      return gradeLabel(a.grade);
    default:
      return a.notes ?? 'Recorded';
  }
}

/* ------------------------------------------------------------------ */
/* Walk                                                                */
/* ------------------------------------------------------------------ */

export function WalkSheet({ open, date, onClose }: { open: boolean; date: ISODate; onClose: () => void }) {
  const [minutes, setMinutes] = useState<number | null>(30);
  const [notes, setNotes] = useState('');
  const { toast } = useFeedback();
  const title = useMemo(() => `Gentle walk · ${formatShort(date)}`, [date]);
  return (
    <Sheet
      open={open}
      title={title}
      onClose={onClose}
      testId="walk-sheet"
      footer={
        <button
          className="btn btn-primary btn-lg"
          onClick={async () => {
            await logWalk(date, minutes ?? 0, notes || null);
            toast('Walk logged');
            onClose();
          }}
        >
          Save walk
        </button>
      }
    >
      <Stepper label="Minutes" value={minutes} onChange={setMinutes} step={5} min={0} max={600} />
      <div style={{ height: 14 }} />
      <Field label="Notes">
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </Field>
    </Sheet>
  );
}

