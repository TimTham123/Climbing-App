import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Field, Sheet } from '../components/ui';
import { ClimbSheet } from '../components/sheets/ClimbSheet';
import { HangSheet } from '../components/sheets/HangSheet';
import { CheckInSheet } from '../components/sheets/CheckInSheet';
import { AssessmentSheet, BodySheet, MobilitySheet, RomSheet, ASSESSMENT_LABELS, assessmentSummary } from '../components/sheets/LogSheets';
import { useAllData } from '../hooks/useAllData';
import { useToday } from '../hooks/data';
import { navigate } from '../hooks/route';
import { startProgrammeSession } from '../db/repo';
import { loggedSummary, programmeForDate, sessionCompletion } from '../domain/session';
import { CLIMB_STYLE_LABELS } from '../data/programme';
import { GRIP_LABELS } from '../data/defaults';
import { romMetric } from '../data/library';
import { formatDuration, formatLong, WEEKDAY_NAMES, type ISODate } from '../lib/dates';
import { gradeLabel } from '../lib/grades';
import { categoryColor } from './SessionScreen';
import type { Assessment, BodyMeasurement, CheckIn, ClimbEntry, HangSession, MobilityLog, RomMeasurement, Session } from '../db/types';

type Kind = 'all' | 'workouts' | 'climbs' | 'hangboard' | 'mobility' | 'checkins' | 'measurements';
const FILTERS: Array<{ id: Kind; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'workouts', label: 'Workouts' },
  { id: 'climbs', label: 'Climbs' },
  { id: 'hangboard', label: 'Hangboard' },
  { id: 'mobility', label: 'Mobility' },
  { id: 'checkins', label: 'Check-ins' },
  { id: 'measurements', label: 'Measurements' },
];

type Entry =
  | { t: 'session'; date: ISODate; sort: number; v: Session; text: string }
  | { t: 'climb'; date: ISODate; sort: number; v: ClimbEntry; text: string }
  | { t: 'hang'; date: ISODate; sort: number; v: HangSession; text: string }
  | { t: 'mobility'; date: ISODate; sort: number; v: MobilityLog; text: string }
  | { t: 'checkin'; date: ISODate; sort: number; v: CheckIn; text: string }
  | { t: 'body'; date: ISODate; sort: number; v: BodyMeasurement; text: string }
  | { t: 'assessment'; date: ISODate; sort: number; v: Assessment; text: string }
  | { t: 'rom'; date: ISODate; sort: number; v: RomMeasurement; text: string };

export function LogScreen() {
  const data = useAllData();
  const today = useToday();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [limit, setLimit] = useState(40);
  const [open, setOpen] = useState<Entry | null>(null);
  const [pastOpen, setPastOpen] = useState(false);

  const entries = useMemo<Entry[]>(() => {
    if (!data) return [];
    const climbsBySession = new Map<string, ClimbEntry[]>();
    data.climbs.forEach((c) => c.sessionId && climbsBySession.set(c.sessionId, [...(climbsBySession.get(c.sessionId) ?? []), c]));
    const climbText = (c: ClimbEntry) => [gradeLabel(c.grade), c.name, c.wall, c.angle != null ? `${c.angle}°` : '', CLIMB_STYLE_LABELS[c.style], c.notes, c.moves, c.sent ? 'sent' : '', ...(c.holds ?? [])].join(' ');
    const out: Entry[] = [];
    data.sessions.forEach((s) =>
      out.push({
        t: 'session',
        date: s.date,
        sort: s.startedAt,
        v: s,
        text: [s.title, s.notes, s.status, ...s.items.map((i) => `${i.name} ${i.notes ?? ''} ${i.substitutedFor ?? ''}`), ...(climbsBySession.get(s.id) ?? []).map(climbText)].join(' '),
      }),
    );
    data.climbs.forEach((c) => out.push({ t: 'climb', date: c.date, sort: c.createdAt, v: c, text: climbText(c) }));
    data.hangs.forEach((h) => out.push({ t: 'hang', date: h.date, sort: h.createdAt, v: h, text: ['hangboard', h.notes, ...h.blocks.map((b) => `${GRIP_LABELS[b.grip]} ${b.edgeMm ?? ''}mm ${b.notes ?? ''}`)].join(' ') }));
    data.mobility.forEach((m) => out.push({ t: 'mobility', date: m.date, sort: m.createdAt, v: m, text: `${m.name} mobility ${m.notes ?? ''}` }));
    data.checkins.forEach((c) => out.push({ t: 'checkin', date: c.date, sort: c.updatedAt, v: c, text: `check-in recovery sleep ${c.notes ?? ''}` }));
    data.body.forEach((b) => out.push({ t: 'body', date: b.date, sort: b.createdAt, v: b, text: `body weight measurement ${b.notes ?? ''}` }));
    data.assessments.forEach((a) => out.push({ t: 'assessment', date: a.date, sort: a.createdAt, v: a, text: `assessment baseline ${ASSESSMENT_LABELS[a.type]} ${a.exercise ?? ''} ${a.notes ?? ''}` }));
    data.rom.forEach((r) => out.push({ t: 'rom', date: r.date, sort: r.createdAt, v: r, text: `range of motion flexibility ${romMetric(r.metric)?.label ?? r.metric} ${r.notes ?? ''}` }));
    return out.sort((a, b) => (a.date === b.date ? b.sort - a.sort : a.date < b.date ? 1 : -1));
  }, [data]);

  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return entries.filter((e) => {
      const kindOk =
        kind === 'all'
          ? !(e.t === 'climb' && e.v.sessionId) // in-session problems are shown within their session
          : kind === 'workouts'
            ? e.t === 'session'
            : kind === 'climbs'
              ? e.t === 'climb'
              : kind === 'hangboard'
                ? e.t === 'hang'
                : kind === 'mobility'
                  ? e.t === 'mobility'
                  : kind === 'checkins'
                    ? e.t === 'checkin'
                    : e.t === 'body' || e.t === 'assessment' || e.t === 'rom';
      if (!kindOk) return false;
      if (!terms.length) return true;
      const hay = e.text.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [entries, q, kind]);

  if (!data) return <div className="screen" />;
  const shown = filtered.slice(0, limit);
  const groups: Array<{ date: ISODate; items: Entry[] }> = [];
  shown.forEach((e) => {
    const g = groups[groups.length - 1];
    if (g && g.date === e.date) g.items.push(e);
    else groups.push({ date: e.date, items: [e] });
  });
  const climbsIn = (id: string) => data.climbs.filter((c) => c.sessionId === id);

  const tap = (e: Entry) => {
    if (e.t === 'session') navigate(`session/${e.v.id}`);
    else setOpen(e);
  };

  return (
    <div className="screen" data-testid="log-screen">
      <div className="page-head">
        <div>
          <h1 className="page-title">Training log</h1>
          <div className="page-sub">{entries.length ? `${entries.filter((e) => e.t === 'session' && e.v.kind !== 'walk').length} sessions recorded` : 'Nothing logged yet'}</div>
        </div>
        <button className="btn btn-sm" onClick={() => setPastOpen(true)} data-testid="log-past">
          <Icon name="plus" /> Past session
        </button>
      </div>
      <div className="search" style={{ marginBottom: 10 }}>
        <Icon name="search" />
        <input className="input" type="search" placeholder="Search exercises, grades, notes…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="log-search" />
      </div>
      <div className="chips scroll" style={{ marginBottom: 14 }}>
        {FILTERS.map((f) => (
          <button key={f.id} className={`chip${kind === f.id ? ' selected' : ''}`} onClick={() => setKind(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {groups.map((g) => (
        <div key={g.date}>
          <div className="section-label" style={{ marginTop: 14 }}>
            {formatLong(g.date)}
          </div>
          <div className="card flush">
            {g.items.map((e) => (
              <button key={`${e.t}-${'id' in e.v ? e.v.id : e.date}`} className="list-item" onClick={() => tap(e)} data-testid={`log-${e.t}`}>
                <EntryRow e={e} climbs={e.t === 'session' ? climbsIn(e.v.id) : []} />
              </button>
            ))}
          </div>
        </div>
      ))}
      {!filtered.length && (
        <div className="empty">
          <strong>{q ? 'No matches' : 'Nothing here yet'}</strong>
          {q ? 'Try a different search.' : 'Logged sessions, climbs and measurements will appear here.'}
        </div>
      )}
      {filtered.length > limit && (
        <button className="btn btn-block" onClick={() => setLimit(limit + 40)}>
          Show more
        </button>
      )}

      <ClimbSheet open={open?.t === 'climb'} initial={open?.t === 'climb' ? open.v : null} onClose={() => setOpen(null)} />
      <HangSheet open={open?.t === 'hang'} initial={open?.t === 'hang' ? open.v : null} onClose={() => setOpen(null)} />
      <MobilitySheet open={open?.t === 'mobility'} date={today} initial={open?.t === 'mobility' ? open.v : null} onClose={() => setOpen(null)} />
      <CheckInSheet open={open?.t === 'checkin'} date={open?.t === 'checkin' ? open.v.date : today} onClose={() => setOpen(null)} />
      <BodySheet open={open?.t === 'body'} date={today} initial={open?.t === 'body' ? open.v : null} onClose={() => setOpen(null)} />
      <AssessmentSheet open={open?.t === 'assessment'} date={today} initial={open?.t === 'assessment' ? open.v : null} onClose={() => setOpen(null)} />
      <RomSheet open={open?.t === 'rom'} date={today} initial={open?.t === 'rom' ? open.v : null} onClose={() => setOpen(null)} />
      <PastSessionSheet open={pastOpen} today={today} onClose={() => setPastOpen(false)} data={data} />
    </div>
  );
}

function EntryRow({ e, climbs }: { e: Entry; climbs: ClimbEntry[] }) {
  switch (e.t) {
    case 'session': {
      const s = e.v;
      const c = sessionCompletion(s);
      const sent = climbs.filter((x) => x.sent).length;
      const strength = s.items.filter((i) => i.mode === 'reps' && i.sets.some((x) => x.done)).slice(0, 2).map((i) => `${i.name} ${loggedSummary(i)}`);
      return (
        <>
          <span className="dot" style={{ ['--accent' as string]: categoryColor(s.category) }} />
          <span className="grow">
            <span className="strong small">{s.title}</span>
            <span className="xsmall muted" style={{ display: 'block' }}>
              {s.kind === 'walk'
                ? formatDuration(s.durationMin)
                : s.status === 'skipped'
                  ? 'Skipped'
                  : `${s.status === 'completed' ? '' : 'In progress · '}${c.planned ? `${c.done}/${c.planned} exercises` : `${s.items.length} items`}${s.durationMin ? ` · ${formatDuration(s.durationMin)}` : ''}${s.rpe ? ` · RPE ${s.rpe}` : ''}${climbs.length ? ` · ${sent}/${climbs.length} sent` : ''}`}
            </span>
            {strength.length > 0 && (
              <span className="xsmall text-2 ellipsis" style={{ display: 'block' }}>
                {strength.join(' · ')}
              </span>
            )}
          </span>
          <Icon name="chevron" size={18} />
        </>
      );
    }
    case 'climb':
      return (
        <>
          <span className={`grade-pill${e.v.sent ? ' sent' : ''}`}>{gradeLabel(e.v.grade)}</span>
          <span className="grow">
            <span className="small">{e.v.name || CLIMB_STYLE_LABELS[e.v.style]}</span>
            <span className="xsmall muted" style={{ display: 'block' }}>
              {CLIMB_STYLE_LABELS[e.v.style]} · {e.v.wall}
              {e.v.angle != null ? ` ${e.v.angle}°` : ''} · {e.v.attempts} att.{e.v.sent ? ' · sent' : ''}
            </span>
          </span>
        </>
      );
    case 'hang':
      return (
        <>
          <Icon name="hand" size={20} />
          <span className="grow">
            <span className="small">Hangboard</span>
            <span className="xsmall muted" style={{ display: 'block' }}>
              {e.v.blocks.map((b) => `${GRIP_LABELS[b.grip]} ${b.sets}×${b.hangSec}s`).join(' · ')}
            </span>
          </span>
        </>
      );
    case 'mobility':
      return (
        <>
          <Icon name="stretch" size={20} />
          <span className="grow small">{e.v.name}</span>
          <span className="xsmall muted tabular">
            {e.v.sets ?? 1} × {e.v.reps != null ? e.v.reps : `${e.v.durationSec ?? 0} s`}
          </span>
        </>
      );
    case 'checkin':
      return (
        <>
          <Icon name="heart" size={20} />
          <span className="grow">
            <span className="small">Check-in</span>
            <span className="xsmall muted tabular" style={{ display: 'block' }}>
              {e.v.sleepHours != null ? `${e.v.sleepHours} h sleep · ` : ''}energy {e.v.energy ?? '–'} · fingers {e.v.finger ?? '–'} · elbows {e.v.elbow ?? '–'} · shoulders {e.v.shoulder ?? '–'}
            </span>
          </span>
        </>
      );
    case 'body':
      return (
        <>
          <Icon name="user" size={20} />
          <span className="grow small">Body measurement</span>
          <span className="xsmall muted tabular">{[e.v.weightKg != null && `${e.v.weightKg} kg`, e.v.bodyFatPct != null && `${e.v.bodyFatPct}%`].filter(Boolean).join(' · ')}</span>
        </>
      );
    case 'assessment':
      return (
        <>
          <Icon name="target" size={20} />
          <span className="grow small">{ASSESSMENT_LABELS[e.v.type]} assessment</span>
          <span className="xsmall muted tabular">{assessmentSummary(e.v)}</span>
        </>
      );
    case 'rom':
      return (
        <>
          <Icon name="ruler" size={20} />
          <span className="grow small">
            {romMetric(e.v.metric)?.label ?? e.v.metric}
            {e.v.side ? ` (${e.v.side})` : ''}
          </span>
          <span className="xsmall muted tabular">
            {e.v.value} {romMetric(e.v.metric)?.unit}
          </span>
        </>
      );
  }
}

function PastSessionSheet({ open, today, onClose, data }: { open: boolean; today: ISODate; onClose: () => void; data: NonNullable<ReturnType<typeof useAllData>> }) {
  const [date, setDate] = useState(today);
  const version = programmeForDate(data.programmes, date);
  return (
    <Sheet open={open} title="Log a past session" onClose={onClose} testId="past-sheet">
      <Field label="Date">
        <input className="input" type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} data-testid="past-date" />
      </Field>
      <p className="small muted" style={{ marginBottom: 10 }}>
        Choose which workout you did. It opens ready to fill in.
      </p>
      <div className="card flush">
        {(version?.days ?? [])
          .filter((d) => !d.isRest)
          .map((d) => (
            <button
              key={d.weekday}
              className="list-item"
              onClick={async () => {
                const s = await startProgrammeSession(date, d.weekday);
                onClose();
                navigate(`session/${s.id}`);
              }}
            >
              <span className="dot" style={{ ['--accent' as string]: categoryColor(d.category) }} />
              <span className="grow">
                {d.title}
                <span className="xsmall muted" style={{ display: 'block' }}>
                  {WEEKDAY_NAMES[d.weekday]}’s session
                </span>
              </span>
            </button>
          ))}
      </div>
    </Sheet>
  );
}
