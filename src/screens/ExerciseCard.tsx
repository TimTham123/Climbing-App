import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Scale, Stepper, Tick } from '../components/ui';
import { useRestTimer } from '../components/RestTimer';
import { emptySet, formatRx, loggedSummary, rxEqual, targetCount } from '../domain/session';
import { patchClimb, updateItem } from '../db/repo';
import { fmtKg } from '../lib/format';
import { formatShort, type ISODate } from '../lib/dates';
import { gradeLabel } from '../lib/grades';
import { CLIMB_STYLE_LABELS } from '../data/programme';
import type { ClimbEntry, SessionItem, SetLog, Settings } from '../db/types';
import type { Suggestion } from '../domain/progression';

export interface ExerciseCardProps {
  sessionId: string;
  item: SessionItem;
  open: boolean;
  onToggle: () => void;
  onLogged: (completedItem: boolean) => void;
  last: { date: ISODate; sets: SetLog[]; item: SessionItem } | null;
  suggestion: Suggestion | null;
  onAcceptSuggestion: (s: Suggestion) => void;
  onDismissSuggestion: (s: Suggestion) => void;
  settings: Settings;
  climbs: ClimbEntry[];
  onLogProblem: () => void;
  onEditProblem: (c: ClimbEntry) => void;
  onEditTarget: () => void;
  onSubstitute: () => void;
  onNotes: () => void;
  onRemove: () => void;
}

export function ExerciseCard(p: ExerciseCardProps) {
  const { item } = p;
  const rx = formatRx(item.target, item.mode);
  const modified = item.prescribed && !rxEqual(item.prescribed, item.target);
  const summary = loggedSummary(item);

  return (
    <div className={`ex${p.open ? ' open' : ''}${item.status === 'done' ? ' done' : ''}${item.status === 'skipped' ? ' skipped' : ''}`} data-testid={`item-${item.exerciseId}`}>
      <button className="ex-head" onClick={p.onToggle} aria-expanded={p.open}>
        <Tick state={item.status} />
        <div className="grow">
          <div className="ex-name">
            {item.name}
            {item.isExtra && <span className="chip" style={{ marginLeft: 8, height: 22, fontSize: 11.5 }}>Added</span>}
          </div>
          <div className="ex-rx">
            {item.substitutedFor ? `Instead of ${item.substitutedFor} · ` : ''}
            {rx}
            {modified ? ' (changed)' : ''}
            {item.status === 'skipped' ? ' · skipped' : ''}
          </div>
        </div>
        {summary && <div className="ex-logged">{summary}</div>}
      </button>
      {p.open && (
        <div className="ex-body">
          {(modified || item.notes) && (
            <div className="rx-box">
              {modified && (
                <span>
                  Programme <b>{formatRx(item.prescribed, item.mode)}</b> → today <b>{rx}</b>
                </span>
              )}
              {item.notes && <span>“{item.notes}”</span>}
            </div>
          )}
          {item.mode === 'reps' || item.mode === 'time' ? (
            <SetLogger {...p} />
          ) : item.mode === 'count' ? (
            <CountLogger {...p} />
          ) : item.mode === 'climb' ? (
            <ClimbBlock {...p} />
          ) : (
            <CheckLogger {...p} />
          )}
          <div className="ex-actions">
            {item.status !== 'skipped' ? (
              <button className="btn btn-sm" onClick={() => updateItem(p.sessionId, item.id, (i) => void (i.status = 'skipped')).then(() => p.onLogged(true))} data-testid="item-skip">
                <Icon name="skip" /> Skip
              </button>
            ) : (
              <button className="btn btn-sm" onClick={() => updateItem(p.sessionId, item.id, (i) => void (i.status = 'pending'))}>
                Unskip
              </button>
            )}
            {item.mode !== 'check' && (
              <button className="btn btn-sm" onClick={p.onEditTarget} data-testid="item-target">
                <Icon name="edit" /> Target
              </button>
            )}
            {(item.mode === 'reps' || item.mode === 'time') && (
              <button className="btn btn-sm" onClick={p.onSubstitute} data-testid="item-substitute">
                <Icon name="swap" /> Swap
              </button>
            )}
            <button className="btn btn-sm" onClick={p.onNotes} data-testid="item-notes">
              <Icon name="note" /> Notes{item.difficulty ? ` · RPE ${item.difficulty}` : ''}
            </button>
            {item.isExtra && (
              <button className="btn btn-sm btn-danger" onClick={p.onRemove}>
                <Icon name="trash" /> Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sets × reps / seconds                                               */
/* ------------------------------------------------------------------ */

function SetLogger(p: ExerciseCardProps) {
  const { item, settings } = p;
  const timer = useRestTimer();
  const nextIdx = item.sets.findIndex((s) => !s.done);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const activeIdx = editIdx ?? (nextIdx >= 0 ? nextIdx : null);
  const lastDone = [...item.sets].reverse().find((s) => s.done);
  const source = activeIdx != null ? item.sets[activeIdx] : null;

  const initialDraft = () => {
    if (source?.done) return { value: source.value, weight: source.weightKg, rir: source.rir };
    return {
      value: lastDone?.value ?? source?.value ?? item.target.min ?? null,
      weight: lastDone?.weightKg ?? source?.weightKg ?? (item.load === 'bodyweight' ? 0 : null),
      rir: null as number | null,
    };
  };
  const [draft, setDraft] = useState(initialDraft);
  // Reset the draft when moving to another set or when sets are added/removed.
  useEffect(() => setDraft(initialDraft()), [activeIdx, item.sets.length]);

  const isTime = item.mode === 'time';
  const target = targetCount(item);
  const done = item.sets.filter((s) => s.done).length;
  const editingDone = activeIdx != null && item.sets[activeIdx]?.done;

  const log = async () => {
    if (activeIdx == null) return;
    const wasLast = !editingDone && done + 1 >= target;
    await updateItem(p.sessionId, item.id, (i) => {
      const s = i.sets[activeIdx];
      if (!s) return;
      s.value = draft.value;
      s.weightKg = i.load === 'none' ? null : draft.weight;
      s.rir = draft.rir;
      s.done = true;
    });
    setEditIdx(null);
    const rest = item.restSec ?? settings.defaultRestSec;
    if (!editingDone && settings.restTimer === 'auto' && rest > 15) timer.start(rest, wasLast ? `Next exercise after ${item.name}` : `${item.name} · set ${activeIdx + 2}`);
    if (!editingDone) p.onLogged(wasLast);
  };
  const addSet = async () => {
    await updateItem(p.sessionId, item.id, (i) => {
      i.sets.push(emptySet(lastDone?.value ?? i.target.min ?? null, lastDone?.weightKg ?? null));
    });
    setEditIdx(item.sets.length);
  };
  const deleteSet = async (idx: number) => {
    await updateItem(p.sessionId, item.id, (i) => {
      i.sets.splice(idx, 1);
    });
    setEditIdx(null);
  };

  const step = settings.weightIncrementKg || 2.5;
  const weightLabel = item.load === 'bodyweight' ? 'Added kg' : 'Weight (kg)';

  return (
    <>
      {p.suggestion && (
        <div className="suggest" data-testid="suggestion">
          <div className="strong" style={{ marginBottom: 4 }}>
            Consider {item.load === 'bodyweight' ? `adding ${p.suggestion.suggestedKg} kg` : `${p.suggestion.suggestedKg} kg`}
          </div>
          <div style={{ marginBottom: 10 }}>{p.suggestion.reason}</div>
          <div className="btn-row">
            <button className="btn btn-sm" onClick={() => p.onDismissSuggestion(p.suggestion!)}>
              Not now
            </button>
            <button className="btn btn-sm btn-primary" onClick={() => p.onAcceptSuggestion(p.suggestion!)} data-testid="suggestion-accept">
              Use {p.suggestion.suggestedKg} kg
            </button>
          </div>
        </div>
      )}
      {p.last && (
        <div className="hint">
          Last time ({formatShort(p.last.date)}):{' '}
          <span className="text-2 tabular">
            {p.last.sets.map((s) => s.value ?? '—').join(' · ')}
            {isTime ? ' s' : ''}
            {p.last.item.load !== 'none' && ` @ ${fmtKg(p.last.sets[0]?.weightKg ?? 0, p.last.item.load)}`}
            {p.last.sets.some((s) => s.rir != null) && ` · RIR ${p.last.sets.map((s) => s.rir ?? '–').join('/')}`}
          </span>
        </div>
      )}
      {item.sets.some((s) => s.done) && (
        <ul className="set-list">
          {item.sets.map((s, idx) =>
            s.done ? (
              <li key={s.id}>
                <button className={`set-row${editIdx === idx ? ' editing' : ''}`} onClick={() => setEditIdx(editIdx === idx ? null : idx)} aria-label={`Edit set ${idx + 1}`}>
                  <span className="set-n">{idx + 1}</span>
                  <span className="grow">
                    {s.value ?? '—'} {isTime ? 's' : 'reps'}
                    {item.load !== 'none' && <span className="text-2"> · {fmtKg(s.weightKg, item.load)}</span>}
                    {s.rir != null && <span className="muted"> · RIR {s.rir}</span>}
                  </span>
                  <Icon name="edit" size={16} />
                </button>
              </li>
            ) : null,
          )}
        </ul>
      )}
      {activeIdx != null && item.status !== 'skipped' ? (
        <div className="set-editor" data-testid="set-editor">
          <div className="set-editor-title">
            <span>{editingDone ? `Edit set ${activeIdx + 1}` : `Set ${activeIdx + 1} of ${Math.max(target, item.sets.length)}`}</span>
            <span className="muted">{rxText(item)}</span>
          </div>
          <div className={item.load === 'none' ? '' : 'grid-2'}>
            <Stepper label={isTime ? 'Seconds' : item.target.per ? `Reps (${item.target.per})` : 'Reps'} value={draft.value} onChange={(v) => setDraft({ ...draft, value: v })} step={isTime ? 5 : 1} min={0} max={isTime ? 900 : 200} ariaLabel={isTime ? 'seconds' : 'reps'} testId="set-value" />
            {item.load !== 'none' && <Stepper label={weightLabel} value={draft.weight} onChange={(v) => setDraft({ ...draft, weight: v })} step={step} decimals={2} min={item.load === 'bodyweight' ? -80 : 0} max={500} ariaLabel="weight" testId="set-weight" />}
          </div>
          {item.load !== 'none' && (
            <div style={{ marginTop: 10 }}>
              <div className="stepper-label">
                <span>Reps in reserve (optional)</span>
              </div>
              <Scale value={draft.rir} onChange={(v) => setDraft({ ...draft, rir: v })} from={0} to={5} labels={{ 5: '5+' }} testId="set-rir" />
            </div>
          )}
          <div className="btn-row" style={{ marginTop: 12 }}>
            {editingDone && (
              <button className="btn btn-danger" style={{ flex: 'none' }} onClick={() => deleteSet(activeIdx)} aria-label="Delete set">
                <Icon name="trash" />
              </button>
            )}
            {editingDone && (
              <button className="btn" onClick={() => setEditIdx(null)}>
                Cancel
              </button>
            )}
            {settings.restTimer === 'manual' && !editingDone && done > 0 && (
              <button className="btn btn-lg" style={{ flex: 'none' }} onClick={() => timer.start(item.restSec ?? settings.defaultRestSec, `${item.name} · rest`)} aria-label="Start rest timer">
                <Icon name="timer" />
              </button>
            )}
            <button className="btn btn-good btn-lg" onClick={log} data-testid="log-set">
              <Icon name="check" /> {editingDone ? 'Update set' : `Log set ${activeIdx + 1}`}
            </button>
          </div>
        </div>
      ) : item.status !== 'skipped' ? (
        <button className="btn btn-block" onClick={addSet} data-testid="add-set">
          <Icon name="plus" /> Add a set
        </button>
      ) : null}
      {activeIdx != null && !editingDone && done >= target && (
        <button className="link-btn" style={{ marginTop: 8 }} onClick={() => deleteSet(activeIdx)}>
          Remove this extra set
        </button>
      )}
    </>
  );
}

const rxText = (item: SessionItem) => formatRx(item.target, item.mode);

/* ------------------------------------------------------------------ */
/* Drill tallies                                                       */
/* ------------------------------------------------------------------ */

function CountLogger(p: ExerciseCardProps) {
  const { item } = p;
  const n = item.sets.filter((s) => s.done).reduce((a, s) => a + (s.value ?? 0), 0);
  const target = targetCount(item);
  const add = async () => {
    await updateItem(p.sessionId, item.id, (i) => {
      i.sets.push({ ...emptySet(1, null), done: true });
    });
    if (n + 1 === target) p.onLogged(true);
  };
  const remove = () =>
    updateItem(p.sessionId, item.id, (i) => {
      const idx = i.sets.map((s) => s.done).lastIndexOf(true);
      if (idx >= 0) i.sets.splice(idx, 1);
    });
  return (
    <div className="row">
      <button className="btn" onClick={remove} disabled={n === 0} aria-label="Remove a climb">
        <Icon name="minus" />
      </button>
      <div className="grow" style={{ textAlign: 'center' }}>
        <div className="big-number tabular" data-testid="count-value">
          {n}
          <span className="muted" style={{ fontSize: 18 }}> / {target}</span>
        </div>
        <div className="xsmall muted">climbs</div>
      </div>
      <button className="btn btn-good btn-lg" onClick={add} data-testid="count-add">
        <Icon name="plus" /> Climb
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tick items                                                          */
/* ------------------------------------------------------------------ */

function CheckLogger(p: ExerciseCardProps) {
  const { item } = p;
  const done = item.status === 'done';
  return (
    <button
      className={`btn btn-block btn-lg ${done ? '' : 'btn-good'}`}
      onClick={async () => {
        await updateItem(p.sessionId, item.id, (i) => void (i.status = done ? 'pending' : 'done'));
        if (!done) p.onLogged(true);
      }}
      data-testid="check-toggle"
    >
      <Icon name={done ? 'refresh' : 'check'} /> {done ? 'Mark as not done' : 'Mark done'}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Climbing blocks                                                     */
/* ------------------------------------------------------------------ */

function ClimbBlock(p: ExerciseCardProps) {
  const { item } = p;
  const [minutes, setMinutes] = useState<number | null>(item.minutes ?? null);
  useEffect(() => setMinutes(item.minutes ?? null), [item.minutes]);
  const problems = useMemo(() => [...p.climbs].sort((a, b) => a.createdAt - b.createdAt), [p.climbs]);
  const sends = problems.filter((c) => c.sent).length;
  const saveMinutes = (v: number | null) => {
    setMinutes(v);
    void updateItem(p.sessionId, item.id, (i) => void (i.minutes = v));
  };
  const done = item.status === 'done';
  return (
    <>
      <div className="hint">
        {CLIMB_STYLE_LABELS[item.climbStyle ?? 'volume']}
        {item.target.min ? ` · plan ${formatRx(item.target, 'climb')}` : ''}
        {problems.length > 0 && ` · ${problems.length} problems, ${sends} sent`}
      </div>
      <Stepper label="Time spent (minutes)" value={minutes} onChange={saveMinutes} step={5} min={0} max={300} testId="climb-minutes" />
      <div style={{ marginTop: 12 }}>
        {problems.map((c) => (
          <div className="problem-row" key={c.id}>
            <button className={`grade-pill${c.sent ? ' sent' : ''}`} onClick={() => p.onEditProblem(c)} style={{ border: 0 }} aria-label={`Edit ${gradeLabel(c.grade)} problem`}>
              {gradeLabel(c.grade)}
            </button>
            <button className="grow" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0 }} onClick={() => p.onEditProblem(c)}>
              <div className="small ellipsis">{c.name || c.wall}{c.angle != null ? ` · ${c.angle}°` : ''}</div>
              <div className="xsmall muted tabular">
                {c.attempts} {c.attempts === 1 ? 'attempt' : 'attempts'}
                {c.sent ? ' · sent' : ''}
                {c.highPoint != null ? ` · move ${c.highPoint}` : ''}
              </div>
            </button>
            <button className="btn btn-sm" onClick={() => patchClimb(c.id, { attempts: c.attempts + 1 })} aria-label="Add an attempt" data-testid="problem-attempt">
              +1
            </button>
            <button className={`btn btn-sm ${c.sent ? 'btn-good' : ''}`} onClick={() => patchClimb(c.id, { sent: !c.sent })} aria-label={c.sent ? 'Mark not sent' : 'Mark sent'} data-testid="problem-sent">
              <Icon name="check" />
            </button>
          </div>
        ))}
      </div>
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn btn-lg" onClick={p.onLogProblem} data-testid="log-problem">
          <Icon name="plus" /> Log problem
        </button>
        <button
          className={`btn btn-lg ${done ? '' : 'btn-good'}`}
          onClick={async () => {
            await updateItem(p.sessionId, item.id, (i) => void (i.status = done ? 'pending' : 'done'));
            if (!done) p.onLogged(true);
          }}
          data-testid="climb-done"
        >
          {done ? 'Reopen' : 'Block done'}
        </button>
      </div>
    </>
  );
}
