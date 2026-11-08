import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { BarChart, DEEMPH, HBars, LineChart, SERIES } from '../../components/charts/Charts';
import { Field, Sheet, Stepper, useFeedback } from '../../components/ui';
import { GradePicker } from '../../components/sheets/ClimbSheet';
import { deleteProject, newProject, saveProject } from '../../db/repo';
import { firstDataDate, weeklySeries } from '../../domain/summary';
import { CLIMB_STYLE_LABELS, WALL_TYPES, isBoardWall } from '../../data/programme';
import { formatDuration, formatShort, toISODate, type ISODate } from '../../lib/dates';
import { gradeLabel } from '../../lib/grades';
import { GradePill } from '../../components/GradePill';
import { clone, uid } from '../../lib/id';
import type { AllData } from '../../hooks/useAllData';
import type { ClimbEntry, ClimbStyle, MoveStatus, Project } from '../../db/types';
import { ChartCard, RangePicker, Stat, rangeWeeks, weekLabel, weekTitle, type Range } from './common';

const STYLE_ORDER: ClimbStyle[] = ['volume', 'limit', 'technical', 'social', 'project', 'board'];
const STYLE_COLOR: Record<ClimbStyle, string> = {
  volume: SERIES[0],
  limit: SERIES[1],
  technical: SERIES[2],
  social: SERIES[3],
  project: SERIES[4],
  board: SERIES[5],
};

export function ClimbingTab({ data, today, onOpenClimb }: { data: AllData; today: ISODate; onOpenClimb: (c: ClimbEntry) => void }) {
  const [range, setRange] = useState<Range>('12');
  const [project, setProject] = useState<Project | null>(null);
  const weeks = useMemo(() => rangeWeeks(range, today, firstDataDate(data)), [range, today, data]);
  const series = useMemo(() => weeklySeries({ ...data, today }, weeks), [data, today, weeks]);
  const from = weeks[0];
  const inRange = data.climbs.filter((c) => c.date >= from && c.date <= today);
  const sent = inRange.filter((c) => c.sent && c.grade != null);
  const topSent = sent.length ? Math.max(...sent.map((c) => c.grade as number)) : null;
  const minutes = series.reduce((a, w) => a + w.climbing.minutes, 0);
  const grades = Array.from(new Set(inRange.map((c) => c.grade).filter((g): g is number => g != null))).sort((a, b) => b - a);
  const boards = groupBoards(inRange.filter((c) => c.style === 'board' || isBoardWall(c.wall)));
  const styleTotals = STYLE_ORDER.filter((st) => series.some((w) => w.climbing.byStyle[st]));

  return (
    <div data-testid="climbing-tab">
      <RangePicker value={range} onChange={setRange} />
      <div className="stats" style={{ marginBottom: 12 }}>
        <Stat label="Highest sent" value={gradeLabel(topSent)} />
        <Stat label="Sent / attempted" value={<>{inRange.filter((c) => c.sent).length}<small> / {inRange.length}</small></>} note="problems" />
        <Stat label="Climbing time" value={minutes ? formatDuration(minutes) : '—'} />
      </div>
      <p className="xsmall muted" style={{ margin: '-4px 4px 12px' }}>
        Your current level is taken only from problems you log. Past grades are not used as targets.
      </p>

      <ChartCard title="Highest grade sent each week">
        <LineChart
          series={[{ id: 'g', label: 'Top grade', color: SERIES[0], points: series.map((w, i) => ({ x: i, y: w.climbing.topSent, tip: `${gradeLabel(w.climbing.topSent)} · ${w.climbing.sends} sends` })) }]}
          xFormat={(i) => weekLabel(weeks[i] ?? weeks[0])}
          yFormat={(v) => gradeLabel(Math.round(v))}
          integer
          empty="Log sends to see your grade trend."
        />
      </ChartCard>

      <ChartCard title="Problems per week">
        <BarChart
          legend={[
            { label: 'Sent', color: SERIES[0] },
            { label: 'Not sent', color: DEEMPH },
          ]}
          data={series.map((w) => ({
            key: w.weekStart,
            label: weekLabel(w.weekStart),
            title: weekTitle(w.weekStart),
            segments: [
              { id: 's', label: 'Sent', value: w.climbing.sends, color: SERIES[0] },
              { id: 'n', label: 'Not sent', value: w.climbing.problems - w.climbing.sends, color: DEEMPH },
            ],
          }))}
          empty="No problems logged in this range."
        />
      </ChartCard>

      <ChartCard title="Problems by style per week">
        <BarChart
          legend={styleTotals.map((st) => ({ label: CLIMB_STYLE_LABELS[st], color: STYLE_COLOR[st] }))}
          data={series.map((w) => ({
            key: w.weekStart,
            label: weekLabel(w.weekStart),
            title: weekTitle(w.weekStart),
            segments: styleTotals.map((st) => ({ id: st, label: CLIMB_STYLE_LABELS[st], value: w.climbing.byStyle[st]?.problems ?? 0, color: STYLE_COLOR[st] })),
          }))}
          empty="No problems logged in this range."
        />
      </ChartCard>

      <ChartCard title="Climbing time per week">
        <LineChart
          series={[{ id: 'm', label: 'Minutes', color: SERIES[2], points: series.map((w, i) => ({ x: i, y: w.climbing.minutes || null, tip: formatDuration(w.climbing.minutes) })) }]}
          xFormat={(i) => weekLabel(weeks[i] ?? weeks[0])}
          yFormat={(v) => `${v}`}
          yMin={0}
          empty="Enter time spent in climbing blocks to see this."
        />
      </ChartCard>

      <ChartCard title="Grade pyramid" sub="Sends by grade in this range (attempted in grey text)">
        {grades.length ? (
          <HBars labelWidth={58} rows={grades.map((g) => ({ label: gradeLabel(g), value: sent.filter((c) => c.grade === g).length, note: `of ${inRange.filter((c) => c.grade === g).length}` }))} />
        ) : (
          <div className="small muted">No graded problems yet.</div>
        )}
      </ChartCard>

      <ChartCard title="Board climbing">
        {boards.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Board</th>
                  <th>Angle</th>
                  <th>Sent</th>
                  <th>Top</th>
                </tr>
              </thead>
              <tbody>
                {boards.map((b) => (
                  <tr key={b.key}>
                    <td>{b.wall}</td>
                    <td>{b.angle != null ? `${b.angle}°` : '—'}</td>
                    <td>
                      {b.sends}/{b.problems}
                    </td>
                    <td>{gradeLabel(b.top)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="small muted">No board problems in this range.</div>
        )}
      </ChartCard>

      <div className="section-label row between" style={{ display: 'flex' }}>
        <span>Projects</span>
        <button className="btn btn-sm" onClick={() => setProject(newProject())} data-testid="add-project">
          <Icon name="plus" /> Project
        </button>
      </div>
      <ProjectList data={data} onOpen={setProject} />

      <div className="section-label">Recent problems</div>
      <div className="card flush">
        {[...inRange]
          .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1))
          .slice(0, 15)
          .map((c) => (
            <button key={c.id} className="list-item" onClick={() => onOpenClimb(c)}>
              <GradePill grade={c.grade} sent={c.sent} />
              <span className="grow">
                <span className="small">{c.name || CLIMB_STYLE_LABELS[c.style]}</span>
                <span className="xsmall muted" style={{ display: 'block' }}>
                  {formatShort(c.date)} · {c.wall}
                  {c.angle != null ? ` ${c.angle}°` : ''} · {c.attempts} att.
                </span>
              </span>
            </button>
          ))}
        {!inRange.length && <div className="empty">No problems logged in this range.</div>}
      </div>
      <ProjectSheet project={project} climbs={data.climbs} onClose={() => setProject(null)} />
    </div>
  );
}

function groupBoards(climbs: ClimbEntry[]) {
  const map = new Map<string, { key: string; wall: string; angle: number | null; problems: number; sends: number; top: number | null }>();
  climbs.forEach((c) => {
    const key = `${c.wall}|${c.angle ?? ''}`;
    const e = map.get(key) ?? { key, wall: c.wall, angle: c.angle ?? null, problems: 0, sends: 0, top: null };
    e.problems += 1;
    if (c.sent) {
      e.sends += 1;
      if (c.grade != null) e.top = Math.max(e.top ?? -2, c.grade);
    }
    map.set(key, e);
  });
  return Array.from(map.values()).sort((a, b) => b.problems - a.problems);
}

export function projectStats(p: Project, climbs: ClimbEntry[]) {
  const entries = climbs.filter((c) => c.projectId === p.id).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));
  const byDate = new Map<ISODate, { date: ISODate; attempts: number; high: number | null; sent: boolean }>();
  entries.forEach((e) => {
    const d = byDate.get(e.date) ?? { date: e.date, attempts: 0, high: null, sent: false };
    d.attempts += e.attempts;
    if (e.highPoint != null) d.high = Math.max(d.high ?? 0, e.highPoint);
    d.sent = d.sent || e.sent;
    byDate.set(e.date, d);
  });
  const sessions = Array.from(byDate.values());
  const attempts = entries.reduce((a, e) => a + e.attempts, 0);
  const highs = sessions.map((s) => s.high).filter((h): h is number => h != null);
  const linked = p.moves.filter((m) => m.status === 'linked').length;
  const done = p.moves.filter((m) => m.status !== 'open').length;
  return { entries, sessions, attempts, bestHigh: highs.length ? Math.max(...highs) : null, firstHigh: highs[0] ?? null, lastHigh: highs[highs.length - 1] ?? null, linked, done };
}

function ProjectList({ data, onOpen }: { data: AllData; onOpen: (p: Project) => void }) {
  const projects = [...data.projects].sort((a, b) => (a.status === b.status ? b.createdAt - a.createdAt : a.status === 'active' ? -1 : 1));
  if (!projects.length) {
    return (
      <div className="card">
        <div className="empty" style={{ padding: 12 }}>
          <strong>No projects yet</strong>
          Add a problem you are working on to track attempts and high points across sessions.
        </div>
      </div>
    );
  }
  return (
    <div className="card flush" data-testid="project-list">
      {projects.map((p) => {
        const st = projectStats(p, data.climbs);
        return (
          <button key={p.id} className="list-item" onClick={() => onOpen(p)}>
            <GradePill grade={p.grade} sent={p.status === 'sent'} />
            <span className="grow">
              <span className="strong small">{p.name || 'Untitled project'}</span>
              <span className="xsmall muted" style={{ display: 'block' }}>
                {p.status === 'sent' ? `Sent ${p.sentDate ? formatShort(p.sentDate) : ''}` : p.status === 'archived' ? 'Archived' : `${st.sessions.length} sessions · ${st.attempts} attempts`}
                {p.status === 'active' && st.bestHigh != null ? ` · high point ${st.bestHigh}${p.totalMoves ? `/${p.totalMoves}` : ''}` : ''}
                {p.status === 'active' && p.moves.length ? ` · moves ${st.done}/${p.moves.length} done` : ''}
              </span>
            </span>
            <Icon name="chevron" size={18} />
          </button>
        );
      })}
    </div>
  );
}

const MOVE_NEXT: Record<MoveStatus, MoveStatus> = { open: 'done', done: 'linked', linked: 'open' };
const MOVE_LABEL: Record<MoveStatus, string> = { open: 'Not yet', done: 'Done alone', linked: 'Linked' };

function ProjectSheet({ project, climbs, onClose }: { project: Project | null; climbs: ClimbEntry[]; onClose: () => void }) {
  const [p, setP] = useState<Project | null>(null);
  const [newMove, setNewMove] = useState('');
  const { confirm, toast } = useFeedback();
  useEffect(() => {
    setP(project ? clone(project) : null);
    setNewMove('');
  }, [project]);
  if (!p) return null;
  const st = projectStats(p, climbs);
  const exists = climbs.some((c) => c.projectId === p.id) || !!project?.name;
  const save = async () => {
    if (!p.name.trim()) return;
    await saveProject({ ...p, name: p.name.trim() });
    toast('Project saved');
    onClose();
  };
  const remove = async () => {
    if (await confirm({ title: `Delete ${p.name || 'project'}?`, message: 'Logged attempts are kept in your climbing log, just no longer linked to a project.', confirmLabel: 'Delete', danger: true })) {
      await deleteProject(p.id);
      onClose();
    }
  };
  return (
    <Sheet
      open={!!project}
      title={exists ? p.name || 'Project' : 'New project'}
      onClose={onClose}
      testId="project-sheet"
      footer={
        <>
          {exists && (
            <button className="btn btn-danger" style={{ flex: 'none' }} onClick={remove}>
              Delete
            </button>
          )}
          <button className="btn btn-primary btn-lg" onClick={save} disabled={!p.name.trim()} data-testid="project-save">
            Save
          </button>
        </>
      }
    >
      <Field label="Name">
        <input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="e.g. Yellow roof traverse" data-testid="project-name" />
      </Field>
      <Field label="Grade">
        <GradePicker value={p.grade} onChange={(g) => setP({ ...p, grade: g })} />
      </Field>
      <div className="grid-2">
        <Field label="Wall or board">
          <select className="select" value={p.wall} onChange={(e) => setP({ ...p, wall: e.target.value })}>
            {WALL_TYPES.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </Field>
        {isBoardWall(p.wall) ? (
          <div className="field">
            <Stepper label="Angle (°)" value={p.angle ?? null} onChange={(v) => setP({ ...p, angle: v })} step={5} max={70} size="sm" />
          </div>
        ) : (
          <Field label="Location">
            <input className="input" value={p.location ?? ''} onChange={(e) => setP({ ...p, location: e.target.value || null })} placeholder="Optional" />
          </Field>
        )}
      </div>
      <div className="field">
        <Stepper label="Number of moves (optional)" value={p.totalMoves ?? null} onChange={(v) => setP({ ...p, totalMoves: v })} max={60} size="sm" />
      </div>
      <Field label="Status">
        <div className="chips">
          {(['active', 'sent', 'archived'] as const).map((s) => (
            <button type="button" key={s} className={`chip${p.status === s ? ' selected' : ''}`} onClick={() => setP({ ...p, status: s, sentDate: s === 'sent' ? p.sentDate ?? st.entries.find((e) => e.sent)?.date ?? null : p.sentDate })}>
              {s === 'active' ? 'Working on it' : s === 'sent' ? 'Sent' : 'Archived'}
            </button>
          ))}
        </div>
      </Field>

      <div className="section-label" style={{ marginTop: 6 }}>
        Moves & sequences
      </div>
      <div className="card flush">
        {p.moves.map((m) => (
          <div className="list-item" key={m.id}>
            <span className="grow small">{m.text}</span>
            <button className={`chip${m.status === 'linked' ? ' good' : m.status === 'done' ? ' warn' : ''}`} style={{ height: 34 }} onClick={() => setP({ ...p, moves: p.moves.map((x) => (x.id === m.id ? { ...x, status: MOVE_NEXT[x.status] } : x)) })}>
              {MOVE_LABEL[m.status]}
            </button>
            <button className="icon-btn" style={{ width: 36 }} onClick={() => setP({ ...p, moves: p.moves.filter((x) => x.id !== m.id) })} aria-label="Remove move">
              <Icon name="x" size={18} />
            </button>
          </div>
        ))}
        <div className="list-item">
          <input className="input grow" value={newMove} onChange={(e) => setNewMove(e.target.value)} placeholder="Add a move or section" />
          <button
            className="btn btn-sm"
            onClick={() => {
              if (!newMove.trim()) return;
              setP({ ...p, moves: [...p.moves, { id: uid('mv_'), text: newMove.trim(), status: 'open' }] });
              setNewMove('');
            }}
          >
            Add
          </button>
        </div>
      </div>
      <p className="xsmall muted" style={{ margin: '-4px 4px 14px' }}>
        Tap a move’s status to cycle: not yet → done alone → linked.
      </p>
      <Field label="Notes">
        <textarea className="textarea" value={p.notes ?? ''} onChange={(e) => setP({ ...p, notes: e.target.value || null })} placeholder="Beta, remaining difficulties…" />
      </Field>

      <div className="section-label">History</div>
      {st.sessions.length ? (
        <>
          {st.sessions.some((s) => s.high != null) && (
            <LineChart
              series={[{ id: 'h', label: 'High point', color: SERIES[4], points: st.sessions.map((s, i) => ({ x: i, y: s.high, tip: `move ${s.high ?? '—'} · ${s.attempts} attempts${s.sent ? ' · sent' : ''}` })) }]}
              xFormat={(i) => formatShort(st.sessions[i]?.date ?? st.sessions[0].date)}
              yFormat={(v) => `${v}`}
              yMin={0}
              yMax={p.totalMoves ?? undefined}
              minPoints={1}
              height={150}
            />
          )}
          <div className="card flush" style={{ marginTop: 10 }}>
            {[...st.sessions].reverse().map((s) => (
              <div className="list-item" key={s.date}>
                <span className="grow small">{formatShort(s.date)}</span>
                <span className="small tabular">
                  {s.attempts} attempts{s.high != null ? ` · move ${s.high}` : ''}
                  {s.sent ? ' · sent' : ''}
                </span>
              </div>
            ))}
          </div>
          <p className="small text-2">
            {st.attempts} attempts over {st.sessions.length} sessions.
            {st.firstHigh != null && st.lastHigh != null && st.sessions.length > 1 ? ` High point ${st.firstHigh} → ${st.lastHigh}.` : ''}
            {p.moves.length ? ` ${st.done} of ${p.moves.length} moves done, ${st.linked} linked.` : ''}
          </p>
        </>
      ) : (
        <p className="small muted">No attempts logged yet. Log a problem with this project selected to build its history.</p>
      )}
      {exists && p.createdAt > 0 && (
        <p className="xsmall muted" style={{ marginTop: 8 }}>
          Added {formatShort(toISODate(new Date(p.createdAt)))}
        </p>
      )}
    </Sheet>
  );
}
