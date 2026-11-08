import { useEffect, useState } from 'react';
import { Field, Scale, Sheet, Stepper, useFeedback } from '../ui';
import { deleteCheckIn, saveCheckIn } from '../../db/repo';
import { db } from '../../db/db';
import { formatLong, type ISODate } from '../../lib/dates';
import type { CheckIn } from '../../db/types';

function blank(date: ISODate): CheckIn {
  return { date, sleepHours: null, sleepQuality: null, energy: null, fatigue: null, finger: null, elbow: null, shoulder: null, notes: null, updatedAt: 0 };
}

export function CheckInSheet({ open, date, onClose }: { open: boolean; date: ISODate; onClose: () => void }) {
  const [c, setC] = useState<CheckIn>(blank(date));
  const [exists, setExists] = useState(false);
  const { confirm, toast } = useFeedback();

  useEffect(() => {
    if (!open) return;
    let alive = true;
    db.checkins.get(date).then((existing) => {
      if (!alive) return;
      setExists(!!existing);
      // A new check-in starts blank: nothing is carried over or assumed.
      setC(existing ?? blank(date));
    });
    return () => {
      alive = false;
    };
  }, [open, date]);

  const set = <K extends keyof CheckIn>(k: K, v: CheckIn[K]) => setC((prev) => ({ ...prev, [k]: v }));
  const save = async () => {
    await saveCheckIn(c);
    toast('Check-in saved');
    onClose();
  };
  const remove = async () => {
    if (await confirm({ title: 'Delete this check-in?', message: formatLong(date), confirmLabel: 'Delete', danger: true })) {
      await deleteCheckIn(date);
      onClose();
    }
  };

  return (
    <Sheet
      open={open}
      title="Daily check-in"
      onClose={onClose}
      testId="checkin-sheet"
      footer={
        <>
          {exists && (
            <button className="btn btn-danger" style={{ flex: 'none' }} onClick={remove} aria-label="Delete check-in">
              Delete
            </button>
          )}
          <button className="btn btn-primary btn-lg" onClick={save} data-testid="checkin-save">
            Save check-in
          </button>
        </>
      }
    >
      <p className="small muted" style={{ marginBottom: 14 }}>
        {formatLong(date)} · Skip anything you don’t want to record.
      </p>
      <div className="field">
        <Stepper label="Sleep (hours)" value={c.sleepHours} onChange={(v) => set('sleepHours', v)} step={0.25} min={0} max={16} decimals={2} testId="ci-sleep" />
      </div>
      <Field label="Sleep quality">
        <Scale value={c.sleepQuality} onChange={(v) => set('sleepQuality', v)} from={1} to={5} low="Poor" high="Great" />
      </Field>
      <Field label="Energy">
        <Scale value={c.energy} onChange={(v) => set('energy', v)} from={1} to={5} low="Flat" high="High" testId="ci-energy" />
      </Field>
      <Field label="General fatigue">
        <Scale value={c.fatigue} onChange={(v) => set('fatigue', v)} from={1} to={5} low="Fresh" high="Very tired" />
      </Field>
      <div className="divider" />
      <p className="small text-2" style={{ marginBottom: 10 }}>
        Discomfort (0 = none, 10 = severe)
      </p>
      <Field label="Fingers">
        <Scale value={c.finger} onChange={(v) => set('finger', v)} from={0} to={10} testId="ci-finger" />
      </Field>
      <Field label="Elbows">
        <Scale value={c.elbow} onChange={(v) => set('elbow', v)} from={0} to={10} testId="ci-elbow" />
      </Field>
      <Field label="Shoulders">
        <Scale value={c.shoulder} onChange={(v) => set('shoulder', v)} from={0} to={10} testId="ci-shoulder" />
      </Field>
      <Field label="Other discomfort or notes">
        <textarea className="textarea" value={c.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} placeholder="e.g. left ring finger tender after board session" />
      </Field>
    </Sheet>
  );
}
