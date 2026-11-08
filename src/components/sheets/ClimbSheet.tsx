import { useEffect, useState } from 'react';
import { Field, Scale, Segmented, Sheet, Stepper, useFeedback } from '../ui';
import { deleteClimb, newClimb, saveClimb } from '../../db/repo';
import { useProjects } from '../../hooks/data';
import { CLIMB_STYLE_LABELS, HOLD_TYPES, WALL_TYPES, isBoardWall } from '../../data/programme';
import { GRADES, gradeLabel } from '../../lib/grades';
import { GradeSwatch } from '../GradePill';
import type { ClimbEntry, ClimbStyle } from '../../db/types';
import { clone } from '../../lib/id';
import { db } from '../../db/db';

const STYLES = Object.keys(CLIMB_STYLE_LABELS) as ClimbStyle[];

export function GradePicker({ value, onChange, testId }: { value: number | null; onChange: (g: number | null) => void; testId?: string }) {
  return (
    <div className="grade-grid" data-testid={testId} role="radiogroup" aria-label="Grade">
      {GRADES.map((g) => (
        <button type="button" key={g} role="radio" aria-checked={value === g} aria-label={gradeLabel(g)} className={`chip${value === g ? ' selected' : ''}`} onClick={() => onChange(value === g ? null : g)}>
          <GradeSwatch grade={g} size={14} />
          {gradeLabel(g)}
        </button>
      ))}
    </div>
  );
}

/**
 * Logs one boulder problem. Opened from a climbing block (linked to the session)
 * or on its own from Today / the log.
 */
export function ClimbSheet({
  open,
  initial,
  onClose,
}: {
  open: boolean;
  initial: ClimbEntry | null;
  onClose: () => void;
}) {
  const projects = useProjects();
  const [c, setC] = useState<ClimbEntry>(initial ?? newClimb({ date: '', style: 'volume' }));
  const [isNew, setIsNew] = useState(true);
  const { confirm, toast } = useFeedback();

  useEffect(() => {
    if (!open || !initial) return;
    let alive = true;
    setC(clone(initial));
    db.climbs.get(initial.id).then((existing) => alive && setIsNew(!existing));
    return () => {
      alive = false;
    };
  }, [open, initial]);

  const set = <K extends keyof ClimbEntry>(k: K, v: ClimbEntry[K]) => setC((p) => ({ ...p, [k]: v }));
  const activeProjects = (projects ?? []).filter((p) => p.status === 'active' || p.id === c.projectId);
  const project = activeProjects.find((p) => p.id === c.projectId);
  const board = isBoardWall(c.wall);

  const save = async () => {
    await saveClimb(c);
    toast(c.sent ? `${gradeLabel(c.grade)} sent — logged` : 'Problem logged');
    onClose();
  };
  const remove = async () => {
    if (await confirm({ title: 'Delete this problem?', confirmLabel: 'Delete', danger: true })) {
      await deleteClimb(c.id);
      onClose();
    }
  };

  const pickProject = (id: string) => {
    const p = activeProjects.find((x) => x.id === id);
    setC((prev) => ({
      ...prev,
      projectId: id || null,
      name: p ? p.name : prev.name,
      grade: p ? p.grade : prev.grade,
      wall: p ? p.wall : prev.wall,
      angle: p ? p.angle ?? null : prev.angle,
    }));
  };

  return (
    <Sheet
      open={open}
      title={isNew ? 'Log problem' : 'Edit problem'}
      onClose={onClose}
      testId="climb-sheet"
      footer={
        <>
          {!isNew && (
            <button className="btn btn-danger" style={{ flex: 'none' }} onClick={remove}>
              Delete
            </button>
          )}
          <button className="btn btn-primary btn-lg" onClick={save} data-testid="climb-save">
            Save
          </button>
        </>
      }
    >
      <Field label="Grade">
        <GradePicker value={c.grade} onChange={(g) => set('grade', g)} testId="climb-grade" />
      </Field>
      <div className="grid-2">
        <Stepper label="Attempts" value={c.attempts} onChange={(v) => set('attempts', Math.max(1, v ?? 1))} min={1} max={99} testId="climb-attempts" />
        <div>
          <div className="stepper-label">
            <span>Result</span>
          </div>
          <Segmented
            value={c.sent ? 'sent' : 'notyet'}
            onChange={(v) => set('sent', v === 'sent')}
            options={[
              { value: 'notyet', label: 'Not yet' },
              { value: 'sent', label: 'Sent' },
            ]}
            testId="climb-result"
          />
        </div>
      </div>
      <div style={{ height: 14 }} />
      <Field label="Style">
        <div className="chips">
          {STYLES.map((s) => (
            <button type="button" key={s} className={`chip${c.style === s ? ' selected' : ''}`} onClick={() => set('style', s)}>
              {CLIMB_STYLE_LABELS[s]}
            </button>
          ))}
        </div>
      </Field>
      {(c.style === 'project' || c.projectId || activeProjects.length > 0) && (
        <Field label="Project" hint={activeProjects.length ? undefined : 'Add projects under Progress → Climbing.'}>
          <select className="select" value={c.projectId ?? ''} onChange={(e) => pickProject(e.target.value)} data-testid="climb-project">
            <option value="">Not a project</option>
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {gradeLabel(p.grade)}
              </option>
            ))}
          </select>
        </Field>
      )}
      {project && (
        <div className="field">
          <Stepper
            label="Furthest move reached"
            aside={project.totalMoves ? `of ${project.totalMoves}` : undefined}
            value={c.highPoint}
            onChange={(v) => set('highPoint', v)}
            min={0}
            max={project.totalMoves ?? 99}
          />
        </div>
      )}
      <div className="grid-2">
        <Field label="Wall or board">
          <select className="select" value={WALL_TYPES.includes(c.wall) ? c.wall : 'Other board'} onChange={(e) => set('wall', e.target.value)}>
            {WALL_TYPES.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </Field>
        {board ? (
          <div className="field">
            <Stepper label="Angle (°)" value={c.angle} onChange={(v) => set('angle', v)} step={5} min={0} max={70} size="sm" />
          </div>
        ) : (
          <Field label="Name">
            <input className="input" value={c.name ?? ''} onChange={(e) => set('name', e.target.value || null)} placeholder="Optional" />
          </Field>
        )}
      </div>
      {board && (
        <Field label="Problem name">
          <input className="input" value={c.name ?? ''} onChange={(e) => set('name', e.target.value || null)} placeholder="Optional" />
        </Field>
      )}
      <Field label="Hold & movement types">
        <div className="chips">
          {HOLD_TYPES.map((h) => {
            const on = (c.holds ?? []).includes(h);
            return (
              <button type="button" key={h} className={`chip${on ? ' selected' : ''}`} onClick={() => set('holds', on ? (c.holds ?? []).filter((x) => x !== h) : [...(c.holds ?? []), h])}>
                {h}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Perceived difficulty">
        <Scale value={c.difficulty} onChange={(v) => set('difficulty', v)} from={1} to={10} low="Easy" high="Max" />
      </Field>
      <Field label="Moves & sequences">
        <textarea className="textarea" value={c.moves ?? ''} onChange={(e) => set('moves', e.target.value || null)} placeholder="e.g. Left heel at start, crux is the cross to the pinch" />
      </Field>
      <Field label="Notes">
        <textarea className="textarea" value={c.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} placeholder="Progress, what still feels hard…" />
      </Field>
      <div className="grid-2">
        <Field label="Climbing with">
          <Segmented
            value={c.company ?? 'none'}
            onChange={(v) => set('company', v === 'none' ? null : (v as 'alone' | 'friends'))}
            options={[
              { value: 'alone', label: 'Alone' },
              { value: 'friends', label: 'Friends' },
            ]}
          />
        </Field>
        <Field label="Date">
          <input className="input" type="date" value={c.date} onChange={(e) => e.target.value && set('date', e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}
