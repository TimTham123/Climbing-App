import type { ReactNode } from 'react';
import { Segmented } from '../../components/ui';
import { addDays, formatDayMonth, parseISODate, startOfWeek, toISODate, type ISODate } from '../../lib/dates';
import { weekStarts } from '../../domain/summary';

export type Range = '4' | '12' | 'all';

export function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <Segmented<Range>
        value={value}
        onChange={onChange}
        options={[
          { value: '4', label: '4 weeks' },
          { value: '12', label: '12 weeks' },
          { value: 'all', label: 'All' },
        ]}
        testId="range-picker"
      />
    </div>
  );
}

/** Week starts covered by a range, ending with the current week. "all" starts at the first data date. */
export function rangeWeeks(range: Range, today: ISODate, firstDate: ISODate | null): ISODate[] {
  const thisWeek = startOfWeek(today);
  if (range !== 'all') return weekStarts(thisWeek, Number(range));
  if (!firstDate) return weekStarts(thisWeek, 4);
  const first = startOfWeek(firstDate);
  const n = Math.max(1, Math.round((parseISODate(thisWeek).getTime() - parseISODate(first).getTime()) / (7 * 86400000)) + 1);
  return weekStarts(thisWeek, Math.min(n, 104));
}

export function rangeStart(range: Range, today: ISODate, firstDate: ISODate | null): ISODate {
  return rangeWeeks(range, today, firstDate)[0];
}

/** X value for dates on line charts (days since epoch). */
export const dayNum = (d: ISODate) => Math.round(parseISODate(d).getTime() / 86400000);
export const dayLabel = (n: number) => formatDayMonth(toISODate(new Date(n * 86400000 + 12 * 3600000)));
export const weekLabel = (w: ISODate) => formatDayMonth(w);
export const weekTitle = (w: ISODate) => `Week of ${formatDayMonth(w)} – ${formatDayMonth(addDays(w, 6))}`;

export function Stat({ label, value, note, testId }: { label: string; value: ReactNode; note?: ReactNode; testId?: string }) {
  return (
    <div className="stat" data-testid={testId}>
      <div className="stat-label">{label}</div>
      <div className="stat-value tabular">{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}

export function ChartCard({ title, sub, children, action }: { title: string; sub?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="card">
      <div className="row between top" style={{ marginBottom: 10 }}>
        <div>
          <div className="strong small">{title}</div>
          {sub && <div className="xsmall muted">{sub}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Neutral wording for a change between two recorded values. */
export function changeText(first: number, last: number, unit: string, better: 'higher' | 'lower'): string {
  const diff = Math.round((last - first) * 10) / 10;
  if (diff === 0) return 'No change';
  const sign = diff > 0 ? '+' : '−';
  const improved = better === 'higher' ? diff > 0 : diff < 0;
  return `${sign}${Math.abs(diff)}${unit === '°' ? '°' : ` ${unit}`} ${improved ? '(more range)' : '(less range)'}`;
}
