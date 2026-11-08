import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Field, Segmented, Sheet, Stepper, Switch, useFeedback } from '../components/ui';
import { AssessmentSheet, BodySheet, RomSheet } from '../components/sheets/LogSheets';
import { AssessmentList } from './progress/BodyTab';
import { useAllData } from '../hooks/useAllData';
import { useToday } from '../hooks/data';
import { navigate } from '../hooks/route';
import { updateSettings } from '../db/repo';
import { climbsCsv, eraseAll, exportAll, hangsCsv, importBackup, measurementsCsv, recoveryCsv, sessionsCsv, validateBackup } from '../db/backup';
import { dbMode, writeDbMode, DEMO_DB_NAME } from '../db/db';
import Dexie from 'dexie';
import { blockPosition, hangboardUnlockDate, HANGBOARD_FROM_WEEK } from '../domain/phase';
import { PHASES } from '../data/defaults';
import { addDays, daysBetween, formatLong, formatShort, startOfWeek } from '../lib/dates';
import { readFileText, saveTextFile } from '../lib/download';
import { uid } from '../lib/id';
import type { Assessment, BodyMeasurement, ChecklistItem } from '../db/types';

export function ProfileScreen({ section }: { section?: string }) {
  const data = useAllData();
  const today = useToday();
  const { confirm, toast } = useFeedback();
  const [body, setBody] = useState<{ initial: BodyMeasurement | null } | null>(null);
  const [asm, setAsm] = useState<{ initial: Assessment | null } | null>(null);
  const [rom, setRom] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [importText, setImportText] = useState<{ name: string; raw: unknown; summary: string } | null>(null);
  const [eraseOpen, setEraseOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);
  useEffect(() => {
    if (section && data) window.setTimeout(() => document.getElementById(`sec-${section}`)?.scrollIntoView({ block: 'start' }), 50);
  }, [section, !!data]);

  if (!data) return <div className="screen" />;
  const s = data.settings;
  const pos = blockPosition(s, today);
  const lastAssessment = data.assessments.map((a) => a.date).sort().pop() ?? null;
  const nextDue = lastAssessment ? addDays(lastAssessment, s.assessmentIntervalWeeks * 7) : null;
  const latestBody = [...data.body].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const unlockDate = hangboardUnlockDate(s);
  const standalone = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
  const isSample = dbMode === 'sample';

  const exportJson = async () => {
    const backup = await exportAll();
    const r = await saveTextFile(`climbing-training-backup-${today}.json`, JSON.stringify(backup, null, 1), 'application/json');
    if (r !== 'cancelled') toast('Backup exported');
  };
  const exportCsv = async (kind: 'sessions' | 'climbs' | 'hangs' | 'recovery' | 'measurements') => {
    const content = kind === 'sessions' ? sessionsCsv(data.sessions) : kind === 'climbs' ? await climbsCsv() : kind === 'hangs' ? await hangsCsv() : kind === 'recovery' ? await recoveryCsv() : await measurementsCsv();
    const r = await saveTextFile(`climbing-${kind}-${today}.csv`, content, 'text/csv');
    if (r !== 'cancelled') toast('CSV exported');
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const raw = JSON.parse(await readFileText(f));
      const b = validateBackup(raw);
      const n = (k: string) => ((b.data as Record<string, unknown[]>)[k] ?? []).length;
      setImportText({ name: f.name, raw, summary: `${n('sessions')} sessions, ${n('climbs')} climbs, ${n('hangs')} hangboard sessions, ${n('checkins')} check-ins, exported ${b.exportedAt.slice(0, 10)}` });
    } catch (e) {
      toast(e instanceof SyntaxError ? 'That file is not valid JSON.' : (e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const doImport = async (mode: 'merge' | 'replace') => {
    if (!importText) return;
    if (mode === 'replace' && !(await confirm({ title: 'Replace all data?', message: 'Everything currently in the app will be replaced by the backup. Export first if unsure.', confirmLabel: 'Replace', danger: true }))) return;
    await importBackup(importText.raw, mode);
    setImportText(null);
    toast('Backup imported');
  };
  const toggleSample = async () => {
    if (isSample) {
      writeDbMode('real');
      window.location.hash = '#/profile';
      window.location.reload();
      return;
    }
    if (await confirm({ title: 'Preview with sample data?', message: 'The app switches to a separate sample database so you can see how charts look. Your real training data is not touched, and a banner shows while the sample is active.', confirmLabel: 'Show sample' })) {
      writeDbMode('sample');
      window.location.hash = '#/progress/week';
      window.location.reload();
    }
  };

  return (
    <div className="screen" data-testid="profile-screen">
      <div className="page-head">
        <div>
          <h1 className="page-title">Profile</h1>
          <div className="page-sub">Training phase, baselines, preferences and data</div>
        </div>
      </div>

      {/* ---------------- Training block ---------------- */}
      <div className="section-label" id="sec-block">
        Training block
      </div>
      <div className="card">
        {pos ? (
          <>
            <div className="strong">{pos.inBlock ? `Week ${pos.week} of ${s.blockWeeks} · ${pos.phase?.name}` : `Block finished (week ${pos.week})`}</div>
            <div className="small muted">{pos.inBlock ? pos.phase?.focus : 'Start a new block when you are ready.'}</div>
          </>
        ) : (
          <div className="small text-2">
            {s.blockStart ? `Your block starts ${formatLong(s.blockStart)}.` : 'Set the Monday your 10-week rebuilding block starts. Weeks, deloads and the hangboard introduction follow from it.'}
          </div>
        )}
        <div style={{ height: 12 }} />
        <Field label="Block start (week 1, Monday)">
          <input
            className="input"
            type="date"
            value={s.blockStart ?? ''}
            onChange={(e) => e.target.value && updateSettings({ blockStart: startOfWeek(e.target.value) })}
            data-testid="block-start"
          />
        </Field>
        <div className="btn-row">
          <button className="btn btn-sm" onClick={() => updateSettings({ blockStart: startOfWeek(today) })} data-testid="start-block-this-week">
            Start this week
          </button>
          {s.blockStart && (
            <button className="btn btn-sm btn-ghost" onClick={() => updateSettings({ blockStart: null })}>
              Clear
            </button>
          )}
        </div>
        <div className="divider" />
        {PHASES.map((p) => (
          <div className="row top" key={p.name} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', opacity: pos && pos.inBlock && !p.weeks.includes(pos.week) ? 0.65 : 1 }}>
            <div className="grow small">
              <div className="strong">
                Weeks {p.weeks.join('–')} · {p.name}
              </div>
              <div className="muted">{p.focus}</div>
            </div>
            {pos?.inBlock && p.weeks.includes(pos.week) && <span className="chip good">Now</span>}
          </div>
        ))}
        <div className="divider" />
        <div className="setting-row">
          <span>
            Apply deload automatically
            <span className="xsmall muted" style={{ display: 'block' }}>
              Reduces sets, reps and climbing time in deload weeks. Mobility is unchanged.
            </span>
          </span>
          <Switch checked={s.applyDeload} onChange={(v) => updateSettings({ applyDeload: v })} label="Apply deload" />
        </div>
        <div style={{ padding: '10px 0' }}>
          <Stepper label="Deload volume reduction (%)" value={s.deloadPct} onChange={(v) => updateSettings({ deloadPct: Math.min(60, Math.max(10, v ?? 35)) })} step={5} min={10} max={60} size="sm" testId="deload-pct" />
        </div>
        <div className="field-label">Deload weeks</div>
        <div className="chips">
          {Array.from({ length: s.blockWeeks }, (_, i) => i + 1).map((w) => (
            <button key={w} className={`chip${s.deloadWeeks.includes(w) ? ' selected' : ''}`} onClick={() => updateSettings({ deloadWeeks: s.deloadWeeks.includes(w) ? s.deloadWeeks.filter((x) => x !== w) : [...s.deloadWeeks, w].sort((a, b) => a - b) })}>
              {w}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="setting-row">
          <span>
            Introductory hangboarding
            <span className="xsmall muted" style={{ display: 'block' }}>
              {s.hangboardUnlocked
                ? 'Enabled. Never scheduled automatically.'
                : pos && pos.week >= HANGBOARD_FROM_WEEK
                  ? 'Available now if recovery has been good.'
                  : unlockDate
                    ? `Available from week ${HANGBOARD_FROM_WEEK} (${formatShort(unlockDate)}).`
                    : 'Available after the first four weeks of your block.'}
            </span>
          </span>
          <Switch
            checked={s.hangboardUnlocked}
            onChange={async (v) => {
              if (!v) return updateSettings({ hangboardUnlocked: false });
              if (!pos || pos.week < HANGBOARD_FROM_WEEK) {
                toast(`Hangboarding unlocks in week ${HANGBOARD_FROM_WEEK}.`);
                return;
              }
              navigate('progress/fingers');
            }}
            label="Hangboarding enabled"
          />
        </div>
      </div>

      {/* ---------------- Baselines ---------------- */}
      <div className="section-label" id="sec-baselines">
        Baselines & measurements
      </div>
      <div className="card">
        <div className="row between">
          <div>
            <div className="strong small">Body composition</div>
            <div className="xsmall muted">
              {latestBody
                ? `${formatShort(latestBody.date)}: ${[latestBody.weightKg != null && `${latestBody.weightKg} kg`, latestBody.bodyFatPct != null && `${latestBody.bodyFatPct}% fat`, latestBody.leanMassKg != null && `${latestBody.leanMassKg} kg lean`, latestBody.waistCm != null && `waist ${latestBody.waistCm} cm`].filter(Boolean).join(' · ')}`
                : 'No measurements yet'}
            </div>
          </div>
          <button className="btn btn-sm" onClick={() => setBody({ initial: null })} data-testid="profile-body-add">
            <Icon name="plus" /> Add
          </button>
        </div>
        <button className="link-btn" style={{ marginTop: 8 }} onClick={() => navigate('progress/body')}>
          View history & charts
        </button>
      </div>
      <div className="card">
        <div className="row between" style={{ marginBottom: 10 }}>
          <div>
            <div className="strong small">Strength, finger & climbing assessments</div>
            <div className="xsmall muted">
              {nextDue ? `Next due around ${formatShort(nextDue)}${daysBetween(today, nextDue) < 0 ? ' (due now)' : ''}` : 'No assessments yet'}
            </div>
          </div>
          <button className="btn btn-sm" onClick={() => setAsm({ initial: null })} data-testid="profile-assessment-add">
            <Icon name="plus" /> Add
          </button>
        </div>
        <Stepper label="Reassess every (weeks)" value={s.assessmentIntervalWeeks} onChange={(v) => updateSettings({ assessmentIntervalWeeks: Math.min(26, Math.max(4, v ?? 10)) })} min={4} max={26} size="sm" />
        <p className="xsmall muted" style={{ marginTop: 8 }}>
          Assessments are occasional. Submaximal sets are fine; no weekly one-rep-max testing.
        </p>
      </div>
      <AssessmentList assessments={data.assessments} onOpen={(a) => setAsm({ initial: a })} />
      <div className="card">
        <Field label="Historical best grade (reference only)" hint="Not used as a target. Your current level comes from the problems you log.">
          <input className="input" value={s.historicalMaxGrade} onChange={(e) => updateSettings({ historicalMaxGrade: e.target.value })} />
        </Field>
      </div>

      {/* ---------------- Preferences ---------------- */}
      <div className="section-label" id="sec-preferences">
        Preferences
      </div>
      <div className="card">
        <Field label="Rest timer between sets">
          <Segmented
            value={s.restTimer}
            onChange={(v) => updateSettings({ restTimer: v })}
            options={[
              { value: 'auto', label: 'Auto-start' },
              { value: 'manual', label: 'Tap to start' },
              { value: 'off', label: 'Off' },
            ]}
            testId="rest-timer-mode"
          />
        </Field>
        <div className="grid-2">
          <Stepper label="Default rest (s)" value={s.defaultRestSec} onChange={(v) => updateSettings({ defaultRestSec: v ?? 90 })} step={15} min={15} max={600} size="sm" />
          <Stepper label="Weight step (kg)" value={s.weightIncrementKg} onChange={(v) => updateSettings({ weightIncrementKg: v && v > 0 ? v : 2.5 })} step={0.25} decimals={2} min={0.25} max={10} size="sm" />
        </div>
        <p className="xsmall muted" style={{ marginTop: 8 }}>
          Each exercise has its own planned rest; the default applies to added exercises.
        </p>
      </div>
      <ChecklistEditor title="Dynamic warm-up checklist" items={s.warmup} onChange={(items) => updateSettings({ warmup: items })} />
      <ChecklistEditor title="Cooldown checklist" items={s.cooldown} onChange={(items) => updateSettings({ cooldown: items })} />

      {/* ---------------- Data ---------------- */}
      <div className="section-label" id="sec-data">
        Data
      </div>
      {!standalone && !isSample && (
        <div className="alert info">
          <Icon name="info" />
          <div>
            <div className="alert-title" style={{ color: 'var(--text)' }}>Install on your iPhone</div>
            In Safari, tap Share → <b>Add to Home Screen</b>. It then opens full-screen, works offline, and Safari will not clear its storage after a week of inactivity.
          </div>
        </div>
      )}
      <div className="card">
        <div className="kv">
          <span>Storage</span>
          <span className="small">On this device only{persisted ? ' · protected' : ''}</span>
        </div>
        {persisted === false && (
          <button
            className="btn btn-sm btn-block"
            style={{ margin: '8px 0' }}
            onClick={async () => {
              const ok = await navigator.storage?.persist?.();
              setPersisted(!!ok);
              toast(ok ? 'Storage protected' : 'The browser declined. Adding to the home screen and regular backups keep data safe.');
            }}
          >
            Ask browser to protect storage
          </button>
        )}
        <p className="xsmall muted" style={{ margin: '6px 0 12px' }}>
          Nothing is uploaded. Export a backup regularly — for example after each training block.
        </p>
        <button className="btn btn-block btn-primary" onClick={exportJson} disabled={isSample} data-testid="export-json">
          <Icon name="download" /> Export full backup (JSON)
        </button>
        <div className="field-label" style={{ marginTop: 14 }}>
          Export training history (CSV)
        </div>
        <div className="chips">
          <button className="chip" onClick={() => exportCsv('sessions')} data-testid="export-csv-sessions">
            Workouts & sets
          </button>
          <button className="chip" onClick={() => exportCsv('climbs')}>
            Climbing
          </button>
          <button className="chip" onClick={() => exportCsv('hangs')}>
            Hangboard
          </button>
          <button className="chip" onClick={() => exportCsv('recovery')}>
            Recovery
          </button>
          <button className="chip" onClick={() => exportCsv('measurements')}>
            Measurements
          </button>
        </div>
        <div className="divider" />
        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files?.[0])} data-testid="import-file" />
        <button className="btn btn-block" onClick={() => fileRef.current?.click()} disabled={isSample}>
          <Icon name="upload" /> Import a backup
        </button>
      </div>
      <div className="card">
        <div className="setting-row">
          <span>
            Preview with sample data
            <span className="xsmall muted" style={{ display: 'block' }}>
              Uses a separate database; your real history is untouched.
            </span>
          </span>
          <Switch checked={isSample} onChange={toggleSample} label="Sample data preview" />
        </div>
        {isSample && (
          <button
            className="btn btn-sm btn-block"
            style={{ marginTop: 8 }}
            onClick={async () => {
              await Dexie.delete(DEMO_DB_NAME);
              window.location.reload();
            }}
          >
            Regenerate sample data
          </button>
        )}
      </div>
      <div className="card">
        <button className="btn btn-block btn-danger" onClick={() => setEraseOpen(true)} data-testid="erase-open">
          <Icon name="trash" /> Erase {isSample ? 'sample' : 'all'} data
        </button>
      </div>
      <p className="xsmall muted" style={{ textAlign: 'center', margin: '16px 0' }}>
        Climbing & Training Tracker · {data.sessions.filter((x) => x.kind !== 'walk').length} sessions · {data.climbs.length} problems logged
      </p>

      <BodySheet open={!!body} date={today} initial={body?.initial ?? null} onClose={() => setBody(null)} />
      <AssessmentSheet open={!!asm} date={today} initial={asm?.initial ?? null} onClose={() => setAsm(null)} onFlexibility={() => { setAsm(null); setRom(true); }} />
      <RomSheet open={rom} date={today} onClose={() => setRom(false)} />
      <Sheet
        open={!!importText}
        title="Import backup"
        onClose={() => setImportText(null)}
        testId="import-sheet"
        footer={
          <>
            <button className="btn" onClick={() => doImport('merge')} data-testid="import-merge">
              Merge
            </button>
            <button className="btn btn-danger" onClick={() => doImport('replace')} data-testid="import-replace">
              Replace all
            </button>
          </>
        }
      >
        <p className="small text-2" style={{ marginBottom: 10 }}>
          {importText?.name}: {importText?.summary}.
        </p>
        <p className="small muted">
          <b>Merge</b> adds the backup to what is here (matching records are overwritten). <b>Replace all</b> clears this device first.
        </p>
      </Sheet>
      <EraseSheet open={eraseOpen} onClose={() => setEraseOpen(false)} onErase={async () => {
        await eraseAll();
        setEraseOpen(false);
        toast('All data erased');
      }} />
    </div>
  );
}

function EraseSheet({ open, onClose, onErase }: { open: boolean; onClose: () => void; onErase: () => void }) {
  const [text, setText] = useState('');
  useEffect(() => setText(''), [open]);
  return (
    <Sheet
      open={open}
      title="Erase all data"
      onClose={onClose}
      testId="erase-sheet"
      footer={
        <button className="btn btn-danger btn-lg" disabled={text.trim().toUpperCase() !== 'ERASE'} onClick={onErase} data-testid="erase-confirm">
          Erase everything
        </button>
      }
    >
      <p className="small text-2" style={{ marginBottom: 12 }}>
        This permanently deletes every session, climb, measurement and setting on this device. Export a backup first. Type <b>ERASE</b> to confirm.
      </p>
      <input className="input" value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="characters" data-testid="erase-input" />
    </Sheet>
  );
}

function ChecklistEditor({ title, items, onChange }: { title: string; items: ChecklistItem[]; onChange: (items: ChecklistItem[]) => void }) {
  const [draft, setDraft] = useState('');
  return (
    <div className="card">
      <div className="strong small" style={{ marginBottom: 8 }}>
        {title}
      </div>
      {items.map((it, i) => (
        <div className="row" key={it.id} style={{ marginBottom: 6 }}>
          <input className="input grow" value={it.text} onChange={(e) => onChange(items.map((x) => (x.id === it.id ? { ...x, text: e.target.value } : x)))} aria-label={`Checklist item ${i + 1}`} />
          <button className="icon-btn" onClick={() => onChange(items.filter((x) => x.id !== it.id))} aria-label="Remove item">
            <Icon name="x" size={18} />
          </button>
        </div>
      ))}
      <div className="row">
        <input className="input grow" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add an item" />
        <button
          className="btn btn-sm"
          onClick={() => {
            if (!draft.trim()) return;
            onChange([...items, { id: uid('chk_'), text: draft.trim() }]);
            setDraft('');
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

