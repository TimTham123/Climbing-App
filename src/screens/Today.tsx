import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Sheet, Tick, useFeedback } from '../components/ui';
import { CheckInSheet } from '../components/sheets/CheckInSheet';
import { ClimbSheet } from '../components/sheets/ClimbSheet';
import { HangSheet, blankHangBlock } from '../components/sheets/HangSheet';
import { MobilitySheet, RomSheet, WalkSheet } from '../components/sheets/LogSheets';
import { FingerWeek } from '../components/FingerWeek';
import { useAssessments, useCheckins, useChecklists, useClimbs, useHangs, useProgrammes, useSessions, useSettings, useToday } from '../hooks/data';
import { navigate } from '../hooks/route';
import { newClimb, startCustomSession, startProgrammeSession, skipPlannedDay, toggleChecklist, deleteSession } from '../db/repo';
import { blockPosition, hangboardUnlockDate, HANGBOARD_FROM_WEEK } from '../domain/phase';
import { formatRx, newExtraItem, programmeForDate, sessionCompletion } from '../domain/session';
import { discomfortFlags, NOT_A_DIAGNOSIS, regionSeries } from '../domain/recovery';
import { fingerLoadWeek, isFingerStyle, plannedFingerStyles } from '../domain/fingerLoad';
import { CLIMB_STYLE_LABELS } from '../data/programme';
import { addDays, formatWeekRange, formatDuration, formatLong, formatShort, startOfWeek, weekdayIndex, WEEKDAY_NAMES, daysBetween, type ISODate } from '../lib/dates';
import { uid, clone } from '../lib/id';
import { categoryColor } from './SessionScreen';
import { useAllData } from '../hooks/useAllData';
import { weeklySummary } from '../domain/summary';
import { gradeLabel } from '../lib/grades';
import type { ChecklistItem, ClimbEntry, HangSession, Session } from '../db/types';

export function TodayScreen() {
  const today = useToday();
  const settings = useSettings();
  const programmes = useProgrammes();
  const sessions = useSessions();
  const checkins = useCheckins();
  const hangs = useHangs();
  const climbs = useClimbs();
  const checklists = useChecklists();
  const assessments = useAssessments();
  const { confirm, toast } = useFeedback();

  const [sheet, setSheet] = useState<null | 'checkin' | 'mobility' | 'rom' | 'walk' | 'other'>(null);
  const [climb, setClimb] = useState<ClimbEntry | null>(null);
  const [hang, setHang] = useState<HangSession | null>(null);

  const flags = useMemo(() => discomfortFlags(checkins ?? [], today, hangs ?? []), [checkins, hangs, today]);
  const fingerDays = useMemo(
    () => fingerLoadWeek({ weekStart: startOfWeek(today), programmes: programmes ?? [], sessions: sessions ?? [], climbs: climbs ?? [], hangs: hangs ?? [] }),
    [today, programmes, sessions, climbs, hangs],
  );

  if (!settings || !programmes || !sessions) return <div className="screen" />;

  const pos = blockPosition(settings, today);
  const version = programmeForDate(programmes, today);
  const day = version?.days.find((d) => d.weekday === weekdayIndex(today));
  const todays = sessions.filter((s) => s.date === today).sort((a, b) => a.startedAt - b.startedAt);
  const planned = todays.filter((s) => s.kind === 'programme');
  const main = planned.find((s) => s.status === 'in_progress') ?? planned.find((s) => s.status === 'completed') ?? planned.find((s) => s.status === 'skipped');
  const extra = todays.filter((s) => s !== main);
  const unfinished = sessions.filter((s) => s.status === 'in_progress' && s.date < today).sort((a, b) => (a.date < b.date ? 1 : -1));
  const checkin = (checkins ?? []).find((c) => c.date === today);
  const fingerToday = plannedFingerStyles(programmes, today);
  const lastAssessment = (assessments ?? []).map((a) => a.date).sort().pop() ?? null;
  const assessmentDue = !lastAssessment
    ? !!settings.blockStart
    : daysBetween(lastAssessment, today) >= settings.assessmentIntervalWeeks * 7;
  const unlockDate = hangboardUnlockDate(settings);
  const fingerRecent = regionSeries(checkins ?? [], 'finger', today, 14);
  const fingerMax = fingerRecent.length ? Math.max(...fingerRecent.map((p) => p.value)) : null;

  const start = async (weekday?: number) => {
    const s = await startProgrammeSession(today, weekday);
    navigate(`session/${s.id}`);
  };

  const newHang = (): HangSession => {
    const fromTemplate = settings.hangboardUnlocked || (pos?.week ?? 0) >= HANGBOARD_FROM_WEEK;
    const blocks = fromTemplate ? clone(settings.hangTemplate.blocks).map((b) => ({ ...b, id: uid('hb_') })) : [blankHangBlock()];
    return { id: uid('hng_'), date: today, fromTemplate, blocks, notes: null, createdAt: Date.now(), updatedAt: Date.now() };
  };
  const todayFinger = fingerDays.find((d) => d.date === today);
  // Finger loading today and on neighbouring days, so a hangboard decision has context.
  const loadOn = (date: ISODate) => {
    const done = Array.from(new Set((climbs ?? []).filter((c) => c.date === date && isFingerStyle(c.style)).map((c) => c.style)));
    const planned = plannedFingerStyles(programmes, date);
    return { done, planned };
  };
  const yesterday = loadOn(addDays(today, -1));
  const tomorrow = loadOn(addDays(today, 1));
  const styleList = (list: string[]) => list.map((s) => CLIMB_STYLE_LABELS[s as keyof typeof CLIMB_STYLE_LABELS].toLowerCase()).join(' and ');
  const hangNotes: string[] = [];
  if (todayFinger && (todayFinger.climbing.styles.length > 0 || todayFinger.planned.length > 0)) {
    hangNotes.push(
      `Fingers are ${todayFinger.climbing.styles.length ? 'already loaded' : 'scheduled to be loaded'} today through ${styleList(todayFinger.climbing.styles.length ? todayFinger.climbing.styles : todayFinger.planned)}.`,
    );
  }
  if (yesterday.done.length) hangNotes.push(`Yesterday: ${styleList(yesterday.done)}.`);
  if (tomorrow.planned.length) hangNotes.push(`Tomorrow's plan includes ${styleList(tomorrow.planned)}.`);
  const protocolNote =
    !settings.hangboardUnlocked && (pos?.week ?? 0) < HANGBOARD_FROM_WEEK
      ? unlockDate
        ? `The introductory protocol starts in week ${HANGBOARD_FROM_WEEK} (${formatShort(unlockDate)}). You can still record hangs you choose to do.`
        : 'The introductory protocol becomes available after the first four weeks of your training block.'
      : null;
  const hangContext =
    hangNotes.length || protocolNote ? (
      <>
        {protocolNote && (
          <div className="alert info">
            <Icon name="info" />
            <div>{protocolNote}</div>
          </div>
        )}
        {hangNotes.length > 0 && (
          <div className="alert warn">
            <Icon name="hand" />
            <div>{hangNotes.join(' ')}</div>
          </div>
        )}
      </>
    ) : null;

  return (
    <div className="screen" data-testid="today-screen">
      <div className="page-head">
        <div>
          <h1 className="page-title">Today</h1>
          <div className="page-sub">{formatLong(today)}</div>
        </div>
        {pos?.inBlock ? (
          <button className="chip" onClick={() => navigate('profile')} style={{ height: 32 }}>
            Week {pos.week} of {settings.blockWeeks} · {pos.phase?.name}
          </button>
        ) : pos?.afterBlock ? (
          <button className="chip" onClick={() => navigate('profile')} style={{ height: 32 }}>
            Block complete
          </button>
        ) : (
          <button className="chip" onClick={() => navigate('profile')} style={{ height: 32 }} data-testid="set-block">
            Set training block
          </button>
        )}
      </div>

      {flags.map((f) => (
        <div key={f.region} className={`alert ${f.level === 'high' ? 'critical' : 'warn'}`} data-testid="discomfort-flag">
          <Icon name="alert" />
          <div>
            <div className="alert-title">{f.level === 'high' ? 'High' : 'Rising'} {f.region} discomfort</div>
            <div>{f.message}</div>
            <div className="xsmall" style={{ marginTop: 6, opacity: 0.85 }}>
              {NOT_A_DIAGNOSIS}
            </div>
          </div>
        </div>
      ))}

      {/* Daily check-in */}
      <button className="card tight row" style={{ width: '100%', textAlign: 'left', color: 'inherit' }} onClick={() => setSheet('checkin')} data-testid="open-checkin">
        <Icon name="heart" size={22} />
        <div className="grow">
          {checkin ? (
            <>
              <div className="strong small">Check-in done</div>
              <div className="xsmall muted tabular">
                {[
                  checkin.sleepHours != null && `Sleep ${checkin.sleepHours} h`,
                  checkin.energy != null && `energy ${checkin.energy}/5`,
                  checkin.fatigue != null && `fatigue ${checkin.fatigue}/5`,
                  checkin.finger != null && `fingers ${checkin.finger}/10`,
                  checkin.elbow != null && `elbows ${checkin.elbow}/10`,
                  checkin.shoulder != null && `shoulders ${checkin.shoulder}/10`,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Nothing recorded'}
              </div>
            </>
          ) : (
            <>
              <div className="strong small">Daily check-in</div>
              <div className="xsmall muted">Sleep, energy and discomfort · about 20 seconds</div>
            </>
          )}
        </div>
        <Icon name={checkin ? 'edit' : 'chevron'} size={18} />
      </button>

      {/* Unfinished sessions from previous days */}
      {unfinished.map((s) => {
        const c = sessionCompletion(s);
        return (
          <div className="card accent-card" key={s.id} style={{ ['--accent' as string]: categoryColor(s.category) }} data-testid="unfinished-card">
            <div className="xsmall muted strong">UNFINISHED · {formatShort(s.date).toUpperCase()}</div>
            <div className="strong" style={{ margin: '4px 0 8px' }}>
              {s.title}
            </div>
            <div className="xsmall muted" style={{ marginBottom: 10 }}>
              {c.done} of {c.planned} exercises logged
            </div>
            <div className="btn-row">
              <button
                className="btn btn-sm"
                onClick={async () => {
                  if (await confirm({ title: 'Discard this session?', message: 'Logged sets in it will be deleted.', confirmLabel: 'Discard', danger: true })) await deleteSession(s.id);
                }}
              >
                Discard
              </button>
              <button className="btn btn-sm btn-primary" onClick={() => navigate(`session/${s.id}`)} data-testid="resume-unfinished">
                Resume
              </button>
            </div>
          </div>
        );
      })}

      {/* Today's programme */}
      {day && (
        <div className="card accent-card hero" style={{ ['--accent' as string]: categoryColor(day.category) }} data-testid="today-card">
          <div className="xsmall muted strong">{WEEKDAY_NAMES[day.weekday].toUpperCase()}</div>
          <h2 className="hero-title" style={{ marginTop: 2 }}>
            {day.title}
          </h2>
          <div className="hero-meta">
            {day.durationMin && (
              <span className="chip">
                {day.durationMax == null ? `${formatDuration(day.durationMin)}+` : day.durationMax === day.durationMin ? formatDuration(day.durationMin) : `${day.durationMin}–${day.durationMax} min`}
              </span>
            )}
            {pos?.deload && settings.applyDeload && !day.isRest && <span className="chip warn">Deload week · −{settings.deloadPct}% volume</span>}
            {fingerToday.length > 0 && <span className="chip finger">Finger loading · {fingerToday.map((s) => CLIMB_STYLE_LABELS[s].toLowerCase()).join(', ')}</span>}
          </div>
          <p className="small text-2" style={{ marginBottom: 12 }}>
            {day.objective}
          </p>

          {day.isRest ? (
            <>
              <p className="small muted" style={{ marginBottom: 12 }}>
                {day.guidance[0]}
              </p>
              <div className="btn-row">
                <button className="btn" onClick={() => setSheet('walk')} data-testid="log-walk">
                  <Icon name="walk" /> Log walk
                </button>
                <button className="btn" onClick={() => setSheet('mobility')}>
                  <Icon name="stretch" /> Mobility
                </button>
              </div>
            </>
          ) : main?.status === 'completed' ? (
            <SessionDone session={main} />
          ) : main?.status === 'in_progress' ? (
            <>
              <InProgress session={main} />
              <button className="btn btn-primary btn-lg btn-block" onClick={() => navigate(`session/${main.id}`)} data-testid="resume-session">
                Resume session
              </button>
            </>
          ) : main?.status === 'skipped' ? (
            <div className="row between">
              <span className="small muted">Marked as skipped</span>
              <button className="btn btn-sm" onClick={() => deleteSession(main.id)}>
                Undo
              </button>
            </div>
          ) : (
            <>
              <ul className="preview-list">
                {day.items.map((i) => (
                  <li key={i.id}>
                    <span className="ellipsis">{i.name}</span>
                    <span className="rx">{formatRx(i.rx, i.mode)}</span>
                  </li>
                ))}
              </ul>
              <button className="btn btn-primary btn-lg btn-block" onClick={() => start()} data-testid="start-session">
                <Icon name="play" /> Start session
              </button>
              <div className="btn-row" style={{ marginTop: 8 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => setSheet('other')} data-testid="other-workout">
                  Different workout
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={async () => {
                    if (await confirm({ title: 'Skip today’s session?', message: 'It will be recorded as planned but not done.', confirmLabel: 'Skip today' })) {
                      await skipPlannedDay(today);
                      toast('Marked as skipped');
                    }
                  }}
                >
                  Skip today
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {extra.map((s) => (
        <button key={s.id} className="card tight accent-card row" style={{ width: '100%', textAlign: 'left', color: 'inherit', ['--accent' as string]: categoryColor(s.category) }} onClick={() => s.kind !== 'walk' && navigate(`session/${s.id}`)}>
          <div className="grow">
            <div className="strong small">{s.title}</div>
            <div className="xsmall muted">{s.kind === 'walk' ? formatDuration(s.durationMin) : s.status === 'completed' ? 'Completed' : 'In progress'}</div>
          </div>
          {s.kind !== 'walk' && <Icon name="chevron" size={18} />}
        </button>
      ))}

      {/* Prompts */}
      {pos && pos.week >= HANGBOARD_FROM_WEEK && pos.inBlock && !settings.hangboardUnlocked && (
        <div className="alert info" data-testid="hangboard-ready">
          <Icon name="hand" />
          <div>
            <div className="alert-title" style={{ color: 'var(--text)' }}>Hangboarding can be introduced</div>
            The introductory protocol becomes available from week {HANGBOARD_FROM_WEEK} if recovery has been good.
            {fingerMax != null ? ` Highest finger discomfort in the last 14 days: ${fingerMax}/10.` : ' No finger check-ins in the last 14 days.'}
            <div style={{ marginTop: 10 }}>
              <button className="btn btn-sm" onClick={() => navigate('progress/fingers')}>
                Review finger section
              </button>
            </div>
          </div>
        </div>
      )}
      {assessmentDue && (
        <div className="alert info" data-testid="assessment-due">
          <Icon name="target" />
          <div>
            <div className="alert-title" style={{ color: 'var(--text)' }}>{lastAssessment ? 'Reassessment due' : 'Record your baselines'}</div>
            {lastAssessment
              ? `Last assessment ${formatShort(lastAssessment)}. Your interval is ${settings.assessmentIntervalWeeks} weeks — pick a fresh day for it.`
              : 'Establish your current pull-up, squat, bench, finger and climbing baselines on a well-recovered day.'}
            <div style={{ marginTop: 10 }}>
              <button className="btn btn-sm" onClick={() => navigate('profile/baselines')}>
                Open baselines
              </button>
            </div>
          </div>
        </div>
      )}

      <LastWeekCard today={today} />

      {/* Quick log */}
      <div className="section-label">Quick log</div>
      <div className="quick-grid">
        <button className="quick" onClick={() => setClimb(newClimb({ date: today, style: 'volume' }))} data-testid="quick-climb">
          <Icon name="mountain" />
          Climb
        </button>
        <button className="quick" onClick={() => setHang(newHang())} data-testid="quick-hang">
          <Icon name="hand" />
          Hangboard
        </button>
        <button className="quick" onClick={() => setSheet('mobility')} data-testid="quick-mobility">
          <Icon name="stretch" />
          Mobility
        </button>
        <button className="quick" onClick={() => setSheet('rom')} data-testid="quick-rom">
          <Icon name="ruler" />
          Measure
        </button>
      </div>
      {unlockDate && today < unlockDate && (
        <p className="xsmall muted" style={{ margin: '-4px 4px 12px' }}>
          Hangboard template unlocks {formatShort(unlockDate)} (week {HANGBOARD_FROM_WEEK}). You can still log hangs manually.
        </p>
      )}

      <Checklist title="Dynamic warm-up · 8–10 min" kind="warmup" items={settings.warmup} done={(checklists ?? []).find((c) => c.id === `${today}:warmup`)?.done ?? []} date={today} />
      <Checklist title="Cooldown" kind="cooldown" items={settings.cooldown} done={(checklists ?? []).find((c) => c.id === `${today}:cooldown`)?.done ?? []} date={today} />

      <div className="card">
        <div className="card-title">
          <span>Finger loading this week</span>
          <button className="link-btn" onClick={() => navigate('progress/fingers')}>
            Details
          </button>
        </div>
        <FingerWeek days={fingerDays} today={today} />
      </div>

      <CheckInSheet open={sheet === 'checkin'} date={today} onClose={() => setSheet(null)} />
      <MobilitySheet open={sheet === 'mobility'} date={today} onClose={() => setSheet(null)} />
      <RomSheet open={sheet === 'rom'} date={today} onClose={() => setSheet(null)} />
      <WalkSheet open={sheet === 'walk'} date={today} onClose={() => setSheet(null)} />
      <ClimbSheet open={!!climb} initial={climb} onClose={() => setClimb(null)} />
      <HangSheet open={!!hang} initial={hang} onClose={() => setHang(null)} context={hangContext} />
      <OtherWorkoutSheet open={sheet === 'other'} today={today} onClose={() => setSheet(null)} onStart={start} days={version?.days ?? []} />
    </div>
  );
}

function InProgress({ session }: { session: Session }) {
  const c = sessionCompletion(session);
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="row between xsmall muted" style={{ marginBottom: 6 }}>
        <span>
          In progress · {c.done} of {c.planned} done
        </span>
        <span>{c.pct ?? 0}%</span>
      </div>
      <div className="progress">
        <span style={{ width: `${c.pct ?? 0}%` }} />
      </div>
    </div>
  );
}

function SessionDone({ session }: { session: Session }) {
  const c = sessionCompletion(session);
  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <Tick state="done" />
        <div className="grow">
          <div className="strong">Session completed</div>
          <div className="xsmall muted tabular">
            {c.done} of {c.planned} exercises · {formatDuration(session.durationMin)}
            {session.rpe ? ` · RPE ${session.rpe}` : ''}
          </div>
        </div>
      </div>
      <button className="btn btn-block" onClick={() => navigate(`session/${session.id}`)} data-testid="view-session">
        View or edit
      </button>
    </div>
  );
}

function Checklist({ title, kind, items, done, date }: { title: string; kind: 'warmup' | 'cooldown'; items: ChecklistItem[]; done: string[]; date: ISODate }) {
  const [open, setOpen] = useState(false);
  const count = items.filter((i) => done.includes(i.id)).length;
  if (!items.length) return null;
  return (
    <div className="card" data-testid={`checklist-${kind}`}>
      <button className="row" style={{ width: '100%', background: 'none', border: 0, padding: 0, textAlign: 'left', color: 'inherit' }} onClick={() => setOpen(!open)} aria-expanded={open}>
        <div className="grow">
          <div className="strong small">{title}</div>
          <div className="xsmall muted">Optional · {count} of {items.length} done</div>
        </div>
        <Icon name={open ? 'down' : 'chevron'} size={18} />
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          {items.map((i) => {
            const on = done.includes(i.id);
            return (
              <button key={i.id} className={`check-row${on ? ' done' : ''}`} onClick={() => toggleChecklist(date, kind, i.id)}>
                <Tick state={on ? 'done' : 'pending'} />
                <span className="check-label">{i.text}</span>
              </button>
            );
          })}
          <button className="link-btn" style={{ marginTop: 8 }} onClick={() => navigate('profile/preferences')}>
            Edit checklist
          </button>
        </div>
      )}
    </div>
  );
}

function OtherWorkoutSheet({ open, today, onClose, onStart, days }: { open: boolean; today: ISODate; onClose: () => void; onStart: (weekday: number) => void; days: Array<{ weekday: number; title: string; category: string; isRest: boolean }> }) {
  const startClimbing = async () => {
    const s = await startCustomSession({
      date: today,
      title: 'Climbing session',
      category: 'custom',
      items: [newExtraItem({ exerciseId: 'climbing', name: 'Climbing', mode: 'climb', load: 'none', rx: { sets: 1, min: 60 }, section: 'Climbing', climbStyle: 'volume' })],
    });
    navigate(`session/${s.id}`);
  };
  const startCustom = async () => {
    const s = await startCustomSession({ date: today, title: 'Custom workout' });
    navigate(`session/${s.id}`);
  };
  return (
    <Sheet open={open} title="Choose a workout" onClose={onClose} testId="other-sheet">
      <p className="small muted" style={{ marginBottom: 12 }}>
        Do a different day’s session today, or log something unscheduled. Your programme stays unchanged.
      </p>
      <div className="card flush">
        {days
          .filter((d) => !d.isRest)
          .map((d) => (
            <button key={d.weekday} className="list-item" onClick={() => onStart(d.weekday)}>
              <span className="dot" style={{ ['--accent' as string]: categoryColor(d.category) }} />
              <span className="grow">
                <span className="strong">{d.title}</span>
                <span className="xsmall muted" style={{ display: 'block' }}>
                  {WEEKDAY_NAMES[d.weekday]}’s session
                </span>
              </span>
              <Icon name="chevron" size={18} />
            </button>
          ))}
      </div>
      <div className="card flush">
        <button className="list-item" onClick={startClimbing}>
          <Icon name="mountain" size={20} />
          <span className="grow">Unscheduled climbing session</span>
        </button>
        <button className="list-item" onClick={startCustom}>
          <Icon name="plus" size={20} />
          <span className="grow">Custom workout</span>
        </button>
      </div>
    </Sheet>
  );
}

/** Compact summary of the previous week, shown from Monday onwards. */
function LastWeekCard({ today }: { today: ISODate }) {
  const data = useAllData();
  const lastWeek = addDays(startOfWeek(today), -7);
  const s = useMemo(() => (data ? weeklySummary({ ...data, today, weekStart: lastWeek }) : null), [data, today, lastWeek]);
  if (!s || (s.consistency.completed === 0 && s.climbing.problems === 0 && s.recovery.checkins === 0)) return null;
  return (
    <button className="card tight row" style={{ width: '100%', textAlign: 'left', color: 'inherit' }} onClick={() => navigate(`progress/week/${lastWeek}`)} data-testid="last-week">
      <Icon name="chart" size={22} />
      <div className="grow">
        <div className="strong small">Last week · {formatWeekRange(lastWeek)}</div>
        <div className="xsmall muted tabular">
          {s.consistency.completed}/{s.consistency.planned} sessions
          {s.consistency.trainingMinutes ? ` · ${formatDuration(s.consistency.trainingMinutes)}` : ''}
          {s.consistency.completionPct != null ? ` · ${s.consistency.completionPct}% of exercises` : ''}
          {s.climbing.topSent != null ? ` · top send ${gradeLabel(s.climbing.topSent)}` : ''}
        </div>
      </div>
      <Icon name="chevron" size={18} />
    </button>
  );
}
