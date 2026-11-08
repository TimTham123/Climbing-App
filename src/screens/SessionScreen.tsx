import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Field, Scale, Segmented, Sheet, Stepper, useFeedback } from '../components/ui';
import { ClimbSheet } from '../components/sheets/ClimbSheet';
import { EditTargetSheet, ExercisePickerSheet, ItemNotesSheet, type ExerciseChoice } from '../components/sheets/ExerciseSheets';
import { ExerciseCard } from './ExerciseCard';
import { useCheckins, useClimbs, useHangs, useProgrammes, useSession, useSessions, useSettings } from '../hooks/data';
import { goBack, navigate } from '../hooks/route';
import {
  completeSession,
  deleteSession,
  newClimb,
  reopenSession,
  updateItem,
  updateSession,
  updateSettings,
} from '../db/repo';
import { emptySet, newExtraItem, plannedSetCount, sessionCompletion } from '../domain/session';
import { lastSetsFor } from '../domain/strength';
import { strengthSuggestion, type Suggestion } from '../domain/progression';
import { discomfortFlags } from '../domain/recovery';
import { plannedFingerStyles } from '../domain/fingerLoad';
import { CLIMB_STYLE_LABELS } from '../data/programme';
import { formatDuration, formatShort, formatTime, todayISO } from '../lib/dates';
import type { ClimbEntry, Prescription, Session, SessionItem } from '../db/types';

export function categoryColor(c: string): string {
  return `var(--c-${c}, var(--c-custom))`;
}

export function SessionScreen({ id }: { id: string }) {
  const session = useSession(id);
  const sessions = useSessions();
  const settings = useSettings();
  const climbs = useClimbs();
  const checkins = useCheckins();
  const hangs = useHangs();
  const programmes = useProgrammes();
  const { confirm, toast } = useFeedback();

  const [openId, setOpenId] = useState<string | null>(null);
  const [initialised, setInitialised] = useState(false);
  const [picker, setPicker] = useState<null | { mode: 'add' } | { mode: 'sub'; item: SessionItem }>(null);
  const [targetItem, setTargetItem] = useState<SessionItem | null>(null);
  const [notesItem, setNotesItem] = useState<SessionItem | null>(null);
  const [climb, setClimb] = useState<ClimbEntry | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 30_000);
    document.body.classList.add('has-session-foot');
    return () => {
      window.clearInterval(t);
      document.body.classList.remove('has-session-foot');
    };
  }, []);

  // Open the first unfinished item when the session loads (or is resumed).
  useEffect(() => {
    if (session && !initialised) {
      const first = session.items.find((i) => i.status === 'pending');
      setOpenId(first?.id ?? null);
      setInitialised(true);
    }
  }, [session, initialised]);

  const sessionClimbs = useMemo(() => (climbs ?? []).filter((c) => c.sessionId === id), [climbs, id]);
  const flags = useMemo(() => discomfortFlags(checkins ?? [], todayISO(), hangs ?? []), [checkins, hangs]);
  const others = useMemo(() => (sessions ?? []).filter((s) => s.id !== id), [sessions, id]);

  if (session === undefined || !settings) return <div className="screen" />;
  if (session === null) {
    return (
      <div className="screen">
        <div className="empty">
          <strong>Session not found</strong>
          It may have been deleted.
          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => navigate('today')}>
              Back to Today
            </button>
          </div>
        </div>
      </div>
    );
  }

  const comp = sessionCompletion(session);
  const sections: Array<{ name: string; items: SessionItem[] }> = [];
  session.items.forEach((i) => {
    const last = sections[sections.length - 1];
    if (last && last.name === i.section) last.items.push(i);
    else sections.push({ name: i.section, items: [i] });
  });
  const fingerStyles = session.kind === 'programme' && session.plannedDate ? plannedFingerStyles(programmes ?? [], session.plannedDate) : [];
  const climbStyles = Array.from(new Set(session.items.filter((i) => i.mode === 'climb' && i.climbStyle).map((i) => i.climbStyle!)));
  const fingerNow = Array.from(new Set([...fingerStyles, ...climbStyles.filter((s) => s === 'limit' || s === 'board' || s === 'project')]));
  const day = (programmes ?? []).find((v) => v.id === session.programmeVersionId)?.days.find((d) => d.weekday === session.weekday);
  const elapsedMin = Math.round((Date.now() - session.startedAt) / 60000);

  const advance = (fromId: string) => {
    const idx = session.items.findIndex((i) => i.id === fromId);
    const next = session.items.slice(idx + 1).find((i) => i.status === 'pending') ?? session.items.find((i) => i.status === 'pending' && i.id !== fromId);
    setOpenId(next?.id ?? null);
    if (next) {
      window.setTimeout(() => document.querySelector(`[data-item-id="${next.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }
  };

  const suggestionFor = (item: SessionItem): Suggestion | null => {
    if (flags.length || session.deload || item.mode !== 'reps' || item.load === 'none') return null;
    if (item.sets.some((s) => s.done)) return null;
    return strengthSuggestion(others, item.exerciseId, settings);
  };

  const acceptSuggestion = async (s: Suggestion) => {
    const ok = await confirm({
      title: `Use ${s.suggestedKg} kg for ${s.name}?`,
      message: 'This becomes the starting load for this exercise from now on. You can still change any set.',
      confirmLabel: `Use ${s.suggestedKg} kg`,
    });
    if (!ok) return;
    await updateSettings({ loadTargets: [...settings.loadTargets.filter((t) => t.exerciseId !== s.exerciseId), { exerciseId: s.exerciseId, weightKg: s.suggestedKg, acceptedAt: Date.now() }] });
    await updateSession(session.id, (ss) =>
      ss.items.filter((i) => i.exerciseId === s.exerciseId).forEach((i) => i.sets.forEach((set) => !set.done && (set.weightKg = s.suggestedKg))),
    );
    toast('Starting load updated');
  };
  const dismissSuggestion = async (s: Suggestion) => {
    await updateSettings({ dismissedSuggestions: [...settings.dismissedSuggestions, s.key] });
  };

  const onChoose = async (c: ExerciseChoice) => {
    if (!picker) return;
    if (picker.mode === 'add') {
      const item = newExtraItem({ ...c, climbStyle: c.mode === 'climb' ? 'volume' : null });
      await updateSession(session.id, (s) => s.items.push(item));
      setOpenId(item.id);
    } else {
      const original = picker.item;
      await updateItem(session.id, original.id, (i) => {
        if (!i.substitutedFor) i.substitutedFor = i.name;
        i.name = c.name;
        i.exerciseId = c.exerciseId;
        i.load = c.load;
        if (i.substitutedFor === c.name) i.substitutedFor = null;
        i.sets.forEach((set) => {
          // A different exercise needs its own load; clear unlogged weights.
          if (!set.done) set.weightKg = c.load === 'bodyweight' ? 0 : null;
        });
      });
      toast(`Swapped to ${c.name}`);
    }
    setPicker(null);
  };

  const saveTarget = async (rx: Prescription) => {
    if (!targetItem) return;
    await updateItem(session.id, targetItem.id, (i) => {
      i.target = rx;
      i.targetModified = !!i.prescribed && JSON.stringify(i.prescribed) !== JSON.stringify(rx);
      if (i.mode === 'reps' || i.mode === 'time') {
        const want = plannedSetCount(rx, i.mode);
        const doneCount = i.sets.filter((s) => s.done).length;
        while (i.sets.length < want) i.sets.push(emptySet(rx.min ?? null, i.sets[i.sets.length - 1]?.weightKg ?? null));
        // Drop unlogged sets beyond the new target; logged sets are never removed.
        for (let k = i.sets.length - 1; k >= 0 && i.sets.length > Math.max(want, doneCount); k--) if (!i.sets[k].done) i.sets.splice(k, 1);
      }
    });
    setTargetItem(null);
  };

  const removeExtra = async (item: SessionItem) => {
    if (await confirm({ title: `Remove ${item.name}?`, message: 'Logged sets for this added exercise will be removed.', confirmLabel: 'Remove', danger: true })) {
      await updateSession(session.id, (s) => (s.items = s.items.filter((i) => i.id !== item.id)));
    }
  };

  const openNewProblem = (item: SessionItem) => {
    const recent = sessionClimbs.filter((c) => c.sessionItemId === item.id).sort((a, b) => b.createdAt - a.createdAt)[0];
    const lastBoard = item.climbStyle === 'board' ? (climbs ?? []).filter((c) => c.style === 'board').sort((a, b) => b.createdAt - a.createdAt)[0] : undefined;
    setClimb(
      newClimb({
        date: session.date,
        style: item.climbStyle ?? 'volume',
        sessionId: session.id,
        sessionItemId: item.id,
        wall: recent?.wall ?? lastBoard?.wall ?? (item.climbStyle === 'board' ? 'Kilter Board' : 'Gym boulder wall'),
        angle: recent?.angle ?? lastBoard?.angle ?? null,
        grade: recent?.grade ?? null,
        company: session.company ?? null,
      }),
    );
  };

  const remove = async () => {
    setMenuOpen(false);
    const n = sessionClimbs.length;
    if (await confirm({ title: 'Delete this session?', message: `${session.title} on ${formatShort(session.date)}${n ? ` and its ${n} logged problems` : ''} will be permanently deleted.`, confirmLabel: 'Delete', danger: true })) {
      await deleteSession(session.id);
      toast('Session deleted');
      navigate('today');
    }
  };

  return (
    <>
      <div className="topbar">
        <button className="icon-btn" onClick={() => goBack('today')} aria-label="Back">
          <Icon name="back" />
        </button>
        <div className="topbar-title">
          {session.title}
          <span className="topbar-sub">
            {formatShort(session.date)}
            {session.status === 'in_progress' && session.date === todayISO() && elapsedMin < 360 ? ` · started ${formatTime(session.startedAt)} · ${formatDuration(elapsedMin)}` : ''}
            {session.status === 'completed' ? ' · completed' : ''}
          </span>
        </div>
        <button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="Session options" data-testid="session-menu">
          <Icon name="more" />
        </button>
      </div>
      <div className="screen with-topbar" data-testid="session-screen">
        <div className="card accent-card" style={{ ['--accent' as string]: categoryColor(session.category) }}>
          <div className="row wrap" style={{ gap: 6, marginBottom: day?.objective ? 10 : 0 }}>
            {session.deload && <span className="chip warn">Deload · volume −{settings.deloadPct}%</span>}
            {session.blockWeek && <span className="chip">Week {session.blockWeek}</span>}
            {fingerNow.length > 0 && <span className="chip finger">Finger loading: {fingerNow.map((s) => CLIMB_STYLE_LABELS[s].toLowerCase()).join(', ')}</span>}
            {session.status === 'completed' && <span className="chip good">Completed</span>}
          </div>
          {day?.objective && <p className="small text-2">{day.objective}</p>}
          {day && day.guidance.length > 0 && (
            <details className="disclosure" style={{ marginTop: 6 }}>
              <summary>Session notes</summary>
              <ul className="small muted" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {day.guidance.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </details>
          )}
          {comp.planned > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="row between xsmall muted" style={{ marginBottom: 6 }}>
                <span data-testid="session-progress">
                  {comp.done} of {comp.planned} done{comp.skipped ? ` · ${comp.skipped} skipped` : ''}
                  {comp.extra ? ` · ${comp.extra} added` : ''}
                </span>
                <span>{comp.pct ?? 0}%</span>
              </div>
              <div className="progress">
                <span style={{ width: `${comp.pct ?? 0}%` }} />
              </div>
            </div>
          )}
        </div>

        {flags.length > 0 && (
          <div className="alert warn">
            <Icon name="alert" />
            <div>
              <div className="alert-title">Discomfort flagged</div>
              {flags.map((f) => f.message).join(' ')}
            </div>
          </div>
        )}

        {sections.map((sec, si) => (
          <div key={`${sec.name}-${si}`}>
            <div className="sec-head">{sec.name}</div>
            {sec.items.map((item) => (
              <div key={item.id} data-item-id={item.id} style={{ scrollMarginTop: 80 }}>
                <ExerciseCard
                  sessionId={session.id}
                  item={item}
                  open={openId === item.id}
                  onToggle={() => setOpenId(openId === item.id ? null : item.id)}
                  onLogged={(completed) => completed && advance(item.id)}
                  last={item.mode === 'reps' || item.mode === 'time' ? lastSetsFor(others, item.exerciseId) : null}
                  suggestion={suggestionFor(item)}
                  onAcceptSuggestion={acceptSuggestion}
                  onDismissSuggestion={dismissSuggestion}
                  settings={settings}
                  climbs={sessionClimbs.filter((c) => c.sessionItemId === item.id)}
                  onLogProblem={() => openNewProblem(item)}
                  onEditProblem={(c) => setClimb(c)}
                  onEditTarget={() => setTargetItem(item)}
                  onSubstitute={() => setPicker({ mode: 'sub', item })}
                  onNotes={() => setNotesItem(item)}
                  onRemove={() => removeExtra(item)}
                />
              </div>
            ))}
          </div>
        ))}

        {session.items.length === 0 && <div className="empty">No exercises yet. Add one below.</div>}

        <div className="btn-row" style={{ marginTop: 16 }}>
          <button className="btn" onClick={() => setPicker({ mode: 'add' })} data-testid="add-exercise">
            <Icon name="plus" /> Add exercise
          </button>
        </div>
        {session.notes && (
          <div className="card tight" style={{ marginTop: 12 }}>
            <div className="xsmall muted">Session notes</div>
            <div className="small text-2">{session.notes}</div>
          </div>
        )}
      </div>

      <div className="session-foot">
        <div className="session-foot-inner">
          {session.status === 'completed' ? (
            <button className="btn btn-block btn-lg" onClick={() => setFinishOpen(true)} data-testid="edit-summary">
              Edit summary · {formatDuration(session.durationMin)}
              {session.rpe ? ` · RPE ${session.rpe}` : ''}
            </button>
          ) : (
            <>
              <button className="btn btn-lg" style={{ flex: 'none' }} onClick={() => navigate('today')} data-testid="save-exit">
                Save & exit
              </button>
              <button className="btn btn-primary btn-lg btn-block" onClick={() => setFinishOpen(true)} data-testid="finish-session">
                Finish session
              </button>
            </>
          )}
        </div>
      </div>

      <ExercisePickerSheet open={!!picker} title={picker?.mode === 'sub' ? `Swap ${picker.item.name}` : 'Add exercise'} keepTarget={picker?.mode === 'sub'} onClose={() => setPicker(null)} onChoose={onChoose} />
      <EditTargetSheet open={!!targetItem} item={targetItem} onClose={() => setTargetItem(null)} onSave={saveTarget} />
      <ItemNotesSheet
        open={!!notesItem}
        item={notesItem}
        onClose={() => setNotesItem(null)}
        onSave={async (notes, difficulty) => {
          if (notesItem) await updateItem(session.id, notesItem.id, (i) => Object.assign(i, { notes, difficulty }));
          setNotesItem(null);
        }}
      />
      <ClimbSheet open={!!climb} initial={climb} onClose={() => setClimb(null)} />
      <FinishSheet open={finishOpen} session={session} elapsedMin={elapsedMin} plannedMin={day?.durationMin ?? null} pending={comp.pending} onClose={() => setFinishOpen(false)} />
      <Sheet open={menuOpen} title="Session options" onClose={() => setMenuOpen(false)}>
        <Field label="Date performed">
          <input className="input" type="date" value={session.date} onChange={(e) => e.target.value && updateSession(session.id, (s) => void (s.date = e.target.value))} />
        </Field>
        <Field label="Session notes">
          <textarea className="textarea" defaultValue={session.notes ?? ''} onBlur={(e) => updateSession(session.id, (s) => void (s.notes = e.target.value || null))} />
        </Field>
        {session.status === 'completed' && (
          <button
            className="btn btn-block"
            style={{ marginBottom: 10 }}
            onClick={async () => {
              await reopenSession(session.id);
              setMenuOpen(false);
            }}
          >
            Mark as in progress
          </button>
        )}
        <button className="btn btn-block btn-danger" onClick={remove} data-testid="delete-session">
          <Icon name="trash" /> Delete session
        </button>
        <p className="xsmall muted" style={{ marginTop: 12 }}>
          Changes in this session never alter your weekly programme.
        </p>
      </Sheet>
    </>
  );
}

function FinishSheet({ open, session, elapsedMin, plannedMin, pending, onClose }: { open: boolean; session: Session; elapsedMin: number; plannedMin: number | null; pending: number; onClose: () => void }) {
  const [duration, setDuration] = useState<number | null>(null);
  const [rpe, setRpe] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [company, setCompany] = useState<Session['company']>(null);
  const { toast } = useFeedback();
  useEffect(() => {
    if (!open) return;
    const sensible = elapsedMin > 0 && elapsedMin < 360 ? elapsedMin : plannedMin;
    setDuration(session.durationMin ?? sensible ?? null);
    setRpe(session.rpe ?? null);
    setNotes(session.notes ?? '');
    setCompany(session.company ?? null);
  }, [open, session, elapsedMin, plannedMin]);
  const hasClimbing = session.items.some((i) => i.mode === 'climb');
  const done = session.status === 'completed';
  return (
    <Sheet
      open={open}
      title={done ? 'Session summary' : 'Finish session'}
      onClose={onClose}
      testId="finish-sheet"
      footer={
        <button
          className="btn btn-primary btn-lg"
          data-testid="complete-session"
          onClick={async () => {
            await completeSession(session.id, { durationMin: duration, rpe, notes: notes.trim() || null, company });
            onClose();
            if (!done) {
              toast('Session saved');
              navigate('today');
            }
          }}
        >
          {done ? 'Save' : 'Complete session'}
        </button>
      }
    >
      {pending > 0 && !done && (
        <div className="alert info">
          <Icon name="info" />
          <div>
            {pending} {pending === 1 ? 'exercise is' : 'exercises are'} not logged. {pending === 1 ? 'It' : 'They'} will be recorded as not completed. You can come back and edit later.
          </div>
        </div>
      )}
      <Stepper label="Duration (minutes)" value={duration} onChange={setDuration} step={5} min={0} max={480} testId="finish-duration" />
      <div style={{ height: 14 }} />
      <Field label="Session effort (RPE)">
        <Scale value={rpe} onChange={setRpe} from={1} to={10} low="Very easy" high="Maximal" testId="finish-rpe" />
      </Field>
      {hasClimbing && (
        <Field label="Climbing with">
          <Segmented
            value={company ?? 'none'}
            onChange={(v) => setCompany(v === 'none' ? null : (v as 'alone' | 'friends'))}
            options={[
              { value: 'alone', label: 'Alone' },
              { value: 'friends', label: 'Friends' },
            ]}
          />
        </Field>
      )}
      <Field label="Comments">
        <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How did it go?" />
      </Field>
      {session.items.some((i) => i.targetModified || i.substitutedFor || i.isExtra) && (
        <p className="xsmall muted">Session changes (targets, swaps, added exercises) are saved with this session only.</p>
      )}
    </Sheet>
  );
}
