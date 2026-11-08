import { useEffect, useState, type ReactNode } from 'react';
import { Field, Scale, Segmented, Sheet, Stepper, Switch, useFeedback } from '../ui';
import { deleteHang, saveHang } from '../../db/repo';
import { db } from '../../db/db';
import { GRIP_LABELS, GRIPS } from '../../data/defaults';
import { clone, uid } from '../../lib/id';
import type { Grip, HangBlock, HangLoadMode, HangSession } from '../../db/types';

export function blankHangBlock(): HangBlock {
  return { id: uid('hb_'), grip: 'half_crimp', edgeMm: 20, holdType: null, loadMode: 'bodyweight', loadKg: 0, feetAssisted: false, hangSec: 7, sets: 3, restSec: 150, effort: null, discomfort: null, notes: null };
}

export function HangBlockEditor({ block, onChange, onRemove, showOutcome = true }: { block: HangBlock; onChange: (b: HangBlock) => void; onRemove?: () => void; showOutcome?: boolean }) {
  const set = <K extends keyof HangBlock>(k: K, v: HangBlock[K]) => onChange({ ...block, [k]: v });
  return (
    <div className="card" style={{ background: 'var(--surface-2)' }}>
      <Field label="Grip">
        <div className="chips">
          {GRIPS.map((g) => (
            <button type="button" key={g} className={`chip${block.grip === g ? ' selected' : ''}`} onClick={() => set('grip', g as Grip)}>
              {GRIP_LABELS[g]}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid-2">
        <Stepper label="Edge (mm)" value={block.edgeMm} onChange={(v) => set('edgeMm', v)} min={0} max={60} size="sm" />
        <Field label="Or hold type">
          <input className="input" value={block.holdType ?? ''} onChange={(e) => set('holdType', e.target.value || null)} placeholder="e.g. 35° sloper" />
        </Field>
      </div>
      <Field label="Load">
        <Segmented<HangLoadMode>
          value={block.loadMode}
          onChange={(v) => onChange({ ...block, loadMode: v, loadKg: v === 'bodyweight' ? 0 : block.loadKg })}
          options={[
            { value: 'bodyweight', label: 'Bodyweight' },
            { value: 'added', label: 'Added' },
            { value: 'assisted', label: 'Assisted' },
          ]}
        />
      </Field>
      {block.loadMode !== 'bodyweight' && (
        <div className="field">
          <Stepper label={block.loadMode === 'added' ? 'Added weight (kg)' : 'Assistance (kg removed)'} value={block.loadKg} onChange={(v) => set('loadKg', v ?? 0)} step={0.5} decimals={1} min={0} max={80} size="sm" />
        </div>
      )}
      <div className="setting-row">
        <span>Feet on the floor / foot support</span>
        <Switch checked={block.feetAssisted} onChange={(v) => set('feetAssisted', v)} label="Feet assisted" />
      </div>
      <div className="grid-3" style={{ marginTop: 12 }}>
        <Stepper label="Hang (s)" value={block.hangSec} onChange={(v) => set('hangSec', v ?? 0)} min={1} max={120} size="sm" />
        <Stepper label="Sets" value={block.sets} onChange={(v) => set('sets', v ?? 1)} min={1} max={20} size="sm" />
        <Stepper label="Rest (s)" value={block.restSec} onChange={(v) => set('restSec', v ?? 0)} step={15} min={0} max={600} size="sm" />
      </div>
      {showOutcome && (
        <>
          <div style={{ height: 14 }} />
          <Field label="Perceived effort">
            <Scale value={block.effort} onChange={(v) => set('effort', v)} from={1} to={10} low="Easy" high="Maximal" />
          </Field>
          <Field label="Finger discomfort">
            <Scale value={block.discomfort} onChange={(v) => set('discomfort', v)} from={0} to={10} low="None" high="Severe" />
          </Field>
          <Field label="Notes">
            <input className="input" value={block.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} placeholder="Optional" />
          </Field>
        </>
      )}
      {onRemove && (
        <button className="btn btn-sm btn-ghost" onClick={onRemove}>
          Remove this grip
        </button>
      )}
    </div>
  );
}

export function HangSheet({ open, initial, onClose, context }: { open: boolean; initial: HangSession | null; onClose: () => void; context?: ReactNode }) {
  const [h, setH] = useState<HangSession | null>(initial);
  const [isNew, setIsNew] = useState(true);
  const { confirm, toast } = useFeedback();

  useEffect(() => {
    if (!open || !initial) return;
    let alive = true;
    setH(clone(initial));
    db.hangs.get(initial.id).then((e) => alive && setIsNew(!e));
    return () => {
      alive = false;
    };
  }, [open, initial]);

  if (!h) return null;
  const save = async () => {
    await saveHang(h);
    toast('Hangboard session saved');
    onClose();
  };
  const remove = async () => {
    if (await confirm({ title: 'Delete this hangboard session?', confirmLabel: 'Delete', danger: true })) {
      await deleteHang(h.id);
      onClose();
    }
  };
  const highEffort = h.blocks.some((b) => (b.effort ?? 0) >= 9);

  return (
    <Sheet
      open={open}
      title={isNew ? 'Log hangboard' : 'Edit hangboard'}
      onClose={onClose}
      testId="hang-sheet"
      footer={
        <>
          {!isNew && (
            <button className="btn btn-danger" style={{ flex: 'none' }} onClick={remove}>
              Delete
            </button>
          )}
          <button className="btn btn-primary btn-lg" onClick={save} data-testid="hang-save">
            Save
          </button>
        </>
      }
    >
      {context}
      {highEffort && (
        <div className="alert warn">
          <div>The introductory protocol aims for about 7/10 effort with no maximal hangs.</div>
        </div>
      )}
      <Field label="Date">
        <input className="input" type="date" value={h.date} onChange={(e) => e.target.value && setH({ ...h, date: e.target.value })} />
      </Field>
      {h.blocks.map((b, i) => (
        <HangBlockEditor
          key={b.id}
          block={b}
          onChange={(nb) => setH({ ...h, blocks: h.blocks.map((x, j) => (j === i ? nb : x)) })}
          onRemove={h.blocks.length > 1 ? () => setH({ ...h, blocks: h.blocks.filter((_, j) => j !== i) }) : undefined}
        />
      ))}
      <button className="btn btn-block" onClick={() => setH({ ...h, blocks: [...h.blocks, { ...blankHangBlock(), grip: 'open_hand' }] })}>
        Add another grip
      </button>
      <div style={{ height: 14 }} />
      <Field label="Session notes">
        <textarea className="textarea" value={h.notes ?? ''} onChange={(e) => setH({ ...h, notes: e.target.value || null })} />
      </Field>
    </Sheet>
  );
}
