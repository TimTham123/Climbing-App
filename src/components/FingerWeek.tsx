import { CLIMB_STYLE_LABELS } from '../data/programme';
import { GRIP_LABELS } from '../data/defaults';
import { WEEKDAY_SHORT, weekdayIndex, type ISODate } from '../lib/dates';
import type { FingerDay } from '../domain/fingerLoad';

const ABBR: Record<string, string> = { limit: 'L', board: 'B', project: 'P' };

/**
 * Seven-day strip showing where finger loading happens: climbing styles that
 * load the fingers (L = limit, B = board, P = projecting) and hangboard (H).
 * An outline marks days the programme plans finger loading.
 */
export function FingerWeek({ days, today, detailed }: { days: FingerDay[]; today: ISODate; detailed?: boolean }) {
  return (
    <div data-testid="finger-week">
      <div className="week-strip">
        {days.map((d) => {
          const marks = [...d.climbing.styles.map((s) => ABBR[s] ?? '•'), ...(d.hang.sessions ? ['H'] : [])];
          const plannedOnly = !d.loaded && d.planned.length > 0;
          return (
            <div key={d.date} style={{ minWidth: 0 }}>
              <div className="xsmall muted" style={{ textAlign: 'center', marginBottom: 4, fontWeight: d.date === today ? 700 : 500, color: d.date === today ? 'var(--text)' : undefined }}>
                {WEEKDAY_SHORT[weekdayIndex(d.date)]}
              </div>
              <div
                className={`finger-cell${d.loaded ? ' on' : ''}${d.planned.length ? ' planned' : ''}`}
                title={d.loaded ? marks.join(' ') : plannedOnly ? 'Planned' : 'None'}
                aria-label={`${WEEKDAY_SHORT[weekdayIndex(d.date)]}: ${d.loaded ? marks.join(', ') : plannedOnly ? 'planned finger loading' : 'no finger loading'}`}
              >
                {d.loaded ? marks.join('') : plannedOnly ? <span style={{ opacity: 0.7 }}>{d.planned.map((s) => ABBR[s]).join('')}</span> : '·'}
              </div>
            </div>
          );
        })}
      </div>
      <div className="xsmall muted" style={{ marginTop: 8 }}>
        L limit · B board · P project · H hangboard. Outline = planned by the programme.
      </div>
      {detailed && (
        <div style={{ marginTop: 12 }}>
          {days
            .filter((d) => d.loaded)
            .map((d) => (
              <div className="kv" key={d.date}>
                <span>{WEEKDAY_SHORT[weekdayIndex(d.date)]}</span>
                <span className="small">
                  {[
                    d.climbing.styles.length && `${d.climbing.styles.map((s) => CLIMB_STYLE_LABELS[s]).join(' + ')}${d.climbing.minutes ? ` ${d.climbing.minutes} min` : ''}${d.climbing.problems ? ` · ${d.climbing.problems} problems, ${d.climbing.attempts} attempts` : ''}`,
                    d.hang.sessions && `Hangboard ${d.hang.sets} sets · ${d.hang.seconds} s (${d.hang.grips.map((g) => GRIP_LABELS[g]).join(', ')})`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
            ))}
          {!days.some((d) => d.loaded) && <div className="small muted">No finger loading logged this week.</div>}
        </div>
      )}
    </div>
  );
}
