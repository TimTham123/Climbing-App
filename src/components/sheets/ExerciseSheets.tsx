import { useEffect, useState } from 'react';
import { Field, Scale, Segmented, Sheet, Stepper } from '../ui';
import { Icon } from '../Icon';
import { GROUP_LABELS, LIBRARY, type LibraryExercise } from '../../data/library';
import { formatRx, rxEqual } from '../../domain/session';
import { clone } from '../../lib/id';
import type { ItemMode, LoadType, Prescription, SessionItem } from '../../db/types';

export interface ExerciseChoice {
  exerciseId: string;
  name: string;
  mode: ItemMode;
  load: LoadType;
  rx: Prescription;
}

function slug(name: string) {
  return (
    'custom-' +
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  );
}

function defaultsFor(e: LibraryExercise): Prescription {
  if (e.mode === 'check') return { sets: 1, note: null };
  if (e.mode === 'count') return { sets: 1, min: 2 };
  if (e.mode === 'climb') return { sets: 1, min: 30, max: null };
  return { sets: e.sets ?? 3, min: e.amount ?? (e.mode === 'time' ? 30 : 10), max: null, per: e.per ?? null };
}

/** Pick an exercise from the library or type a custom one, then set its dose. */
export function ExercisePickerSheet({
  open,
  title,
  onClose,
  onChoose,
  keepTarget,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onChoose: (c: ExerciseChoice) => void;
  /** For substitutions the existing target is kept, so only the exercise is chosen. */
  keepTarget?: boolean;
}) {
  const [q, setQ] = useState('');
  const [choice, setChoice] = useState<ExerciseChoice | null>(null);
  useEffect(() => {
    if (open) {
      setQ('');
      setChoice(null);
    }
  }, [open]);

  const results = q ? LIBRARY.filter((e) => e.name.toLowerCase().includes(q.toLowerCase())) : LIBRARY;
  const groups = Array.from(new Set(results.map((e) => e.group)));
  const pick = (e: LibraryExercise) => {
    const c = { exerciseId: e.id, name: e.name, mode: e.mode, load: e.load, rx: defaultsFor(e) };
    if (keepTarget) onChoose(c);
    else setChoice(c);
  };
  const custom = () => {
    const name = q.trim();
    if (!name) return;
    const c: ExerciseChoice = { exerciseId: slug(name), name, mode: 'reps', load: 'external', rx: { sets: 3, min: 10, max: null } };
    if (keepTarget) onChoose(c);
    else setChoice(c);
  };

  return (
    <Sheet
      open={open}
      title={choice ? choice.name : title}
      onClose={onClose}
      testId="exercise-picker"
      footer={
        choice ? (
          <>
            <button className="btn" style={{ flex: 'none' }} onClick={() => setChoice(null)}>
              Back
            </button>
            <button className="btn btn-primary btn-lg" onClick={() => onChoose(choice)} data-testid="picker-add">
              Add exercise
            </button>
          </>
        ) : undefined
      }
    >
      {!choice ? (
        <>
          <div className="search" style={{ marginBottom: 10 }}>
            <Icon name="search" />
            <input className="input" placeholder="Search or type a new exercise" value={q} onChange={(e) => setQ(e.target.value)} data-testid="picker-search" />
          </div>
          {q.trim() && !LIBRARY.some((e) => e.name.toLowerCase() === q.trim().toLowerCase()) && (
            <button className="btn btn-block" style={{ marginBottom: 12 }} onClick={custom} data-testid="picker-custom">
              <Icon name="plus" /> Use “{q.trim()}”
            </button>
          )}
          {groups.map((g) => (
            <div key={g}>
              <div className="section-label" style={{ marginTop: 12 }}>
                {GROUP_LABELS[g]}
              </div>
              <div className="card flush">
                {results
                  .filter((e) => e.group === g)
                  .map((e) => (
                    <button key={e.id} className="list-item" onClick={() => pick(e)}>
                      {e.name}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </>
      ) : (
        <ChoiceEditor choice={choice} onChange={setChoice} />
      )}
    </Sheet>
  );
}

function ChoiceEditor({ choice, onChange }: { choice: ExerciseChoice; onChange: (c: ExerciseChoice) => void }) {
  const rx = choice.rx;
  const setRx = (p: Partial<Prescription>) => onChange({ ...choice, rx: { ...rx, ...p } });
  return (
    <>
      <Field label="How to log it">
        <Segmented<ItemMode>
          value={choice.mode}
          onChange={(m) => onChange({ ...choice, mode: m, rx: m === 'time' ? { ...rx, min: 30 } : m === 'reps' ? { ...rx, min: 10 } : m === 'climb' ? { sets: 1, min: 30 } : m === 'count' ? { sets: 1, min: 2 } : { sets: 1 } })}
          options={[
            { value: 'reps', label: 'Reps' },
            { value: 'time', label: 'Time' },
            { value: 'check', label: 'Tick' },
            { value: 'climb', label: 'Climbing' },
          ]}
        />
      </Field>
      {(choice.mode === 'reps' || choice.mode === 'time') && (
        <>
          <Field label="Load">
            <Segmented<LoadType>
              value={choice.load}
              onChange={(l) => onChange({ ...choice, load: l })}
              options={[
                { value: 'external', label: 'Weight' },
                { value: 'bodyweight', label: 'Bodyweight' },
                { value: 'none', label: 'None' },
              ]}
            />
          </Field>
          <RxFields rx={rx} mode={choice.mode} onChange={setRx} />
        </>
      )}
      {choice.mode === 'climb' && <Stepper label="Planned minutes" value={rx.min} onChange={(v) => setRx({ min: v })} step={5} min={0} max={300} />}
    </>
  );
}

function RxFields({ rx, mode, onChange }: { rx: Prescription; mode: ItemMode; onChange: (p: Partial<Prescription>) => void }) {
  const unit = mode === 'time' ? 's' : mode === 'count' ? 'climbs' : 'reps';
  return (
    <>
      {(mode === 'reps' || mode === 'time') && (
        <div className="field">
          <Stepper label="Sets" value={rx.sets} onChange={(v) => onChange({ sets: Math.max(1, v ?? 1), setsMax: rx.setsMax && rx.setsMax < (v ?? 1) ? null : rx.setsMax })} min={1} max={12} testId="rx-sets" />
        </div>
      )}
      <div className="grid-2">
        <Stepper label={mode === 'count' ? 'Climbs' : mode === 'climb' ? 'Min (minutes)' : `Min ${unit}`} value={rx.min} onChange={(v) => onChange({ min: v })} step={mode === 'time' || mode === 'climb' ? 5 : 1} min={0} max={600} testId="rx-min" />
        {mode !== 'count' && <Stepper label={`Max ${mode === 'climb' ? 'minutes' : unit} (optional)`} value={rx.max} onChange={(v) => onChange({ max: v })} step={mode === 'time' || mode === 'climb' ? 5 : 1} min={0} max={600} testId="rx-max" />}
      </div>
      {(mode === 'reps' || mode === 'time') && (
        <Field label="Per">
          <select className="select" value={rx.per ?? ''} onChange={(e) => onChange({ per: e.target.value || null })}>
            <option value="">—</option>
            <option value="each side">each side</option>
            <option value="each leg">each leg</option>
            <option value="each">each</option>
          </select>
        </Field>
      )}
    </>
  );
}

/** Changes the target for this session only. The programme prescription is untouched. */
export function EditTargetSheet({ open, item, onClose, onSave }: { open: boolean; item: SessionItem | null; onClose: () => void; onSave: (rx: Prescription) => void }) {
  const [rx, setRx] = useState<Prescription | null>(item ? clone(item.target) : null);
  useEffect(() => {
    if (open && item) setRx(clone(item.target));
  }, [open, item]);
  if (!item || !rx) return null;
  return (
    <Sheet
      open={open}
      title={`Target · ${item.name}`}
      onClose={onClose}
      testId="target-sheet"
      footer={
        <>
          {item.prescribed && !rxEqual(item.prescribed, rx) && (
            <button className="btn" style={{ flex: 'none' }} onClick={() => setRx(clone(item.prescribed!))}>
              Reset
            </button>
          )}
          <button className="btn btn-primary btn-lg" onClick={() => onSave(rx)} data-testid="target-save">
            Use for this session
          </button>
        </>
      }
    >
      {item.prescribed && (
        <p className="small muted" style={{ marginBottom: 14 }}>
          Programme: <span className="text-2">{formatRx(item.prescribed, item.mode)}</span>. Changes here apply to this session only.
        </p>
      )}
      <RxFields rx={rx} mode={item.mode} onChange={(p) => setRx({ ...rx, ...p })} />
    </Sheet>
  );
}

export function ItemNotesSheet({ open, item, onClose, onSave }: { open: boolean; item: SessionItem | null; onClose: () => void; onSave: (notes: string | null, difficulty: number | null) => void }) {
  const [notes, setNotes] = useState('');
  const [diff, setDiff] = useState<number | null>(null);
  useEffect(() => {
    if (open && item) {
      setNotes(item.notes ?? '');
      setDiff(item.difficulty ?? null);
    }
  }, [open, item]);
  if (!item) return null;
  return (
    <Sheet
      open={open}
      title={item.name}
      onClose={onClose}
      testId="notes-sheet"
      footer={
        <button className="btn btn-primary btn-lg" onClick={() => onSave(notes.trim() || null, diff)} data-testid="notes-save">
          Save
        </button>
      }
    >
      <Field label="Perceived difficulty (RPE)">
        <Scale value={diff} onChange={setDiff} from={1} to={10} low="Very easy" high="Maximal" />
      </Field>
      <Field label="Comments">
        <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Form cues, how it felt, equipment used…" data-testid="notes-text" />
      </Field>
    </Sheet>
  );
}
