import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { LineChart, SERIES } from '../../components/charts/Charts';
import { ASSESSMENT_LABELS, AssessmentSheet, BodySheet, RomSheet, assessmentSummary } from '../../components/sheets/LogSheets';
import { formatShort, type ISODate } from '../../lib/dates';
import type { AllData } from '../../hooks/useAllData';
import type { Assessment, AssessmentType, BodyMeasurement } from '../../db/types';
import { ChartCard, dayLabel, dayNum } from './common';

export function BodyTab({ data, today }: { data: AllData; today: ISODate }) {
  const [body, setBody] = useState<{ initial: BodyMeasurement | null } | null>(null);
  const [asm, setAsm] = useState<{ initial: Assessment | null } | null>(null);
  const [rom, setRom] = useState(false);
  const rows = [...data.body].sort((a, b) => (a.date < b.date ? -1 : 1));
  const metric = (k: 'weightKg' | 'bodyFatPct' | 'leanMassKg' | 'waistCm') => rows.filter((r) => r[k] != null).map((r) => ({ x: dayNum(r.date), y: r[k] as number }));
  const charts: Array<{ k: 'weightKg' | 'bodyFatPct' | 'leanMassKg' | 'waistCm'; title: string; unit: string }> = [
    { k: 'weightKg', title: 'Body weight', unit: 'kg' },
    { k: 'bodyFatPct', title: 'Body fat', unit: '%' },
    { k: 'leanMassKg', title: 'Lean mass', unit: 'kg' },
    { k: 'waistCm', title: 'Waist', unit: 'cm' },
  ];

  return (
    <div data-testid="body-tab">
      <div className="btn-row" style={{ marginBottom: 14 }}>
        <button className="btn" onClick={() => setBody({ initial: null })} data-testid="body-add">
          <Icon name="plus" /> Measurement
        </button>
        <button className="btn" onClick={() => setAsm({ initial: null })} data-testid="assessment-add">
          <Icon name="target" /> Assessment
        </button>
      </div>
      {charts.map((c) => {
        const pts = metric(c.k);
        if (!pts.length) return null;
        const diff = pts.length > 1 ? Math.round((pts[pts.length - 1].y - pts[0].y) * 10) / 10 : null;
        return (
          <ChartCard key={c.k} title={`${c.title} (${c.unit})`} sub={diff != null ? `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.abs(diff)} ${c.unit} since ${dayLabel(pts[0].x)}` : 'One entry so far'}>
            <LineChart series={[{ id: c.k, label: c.title, color: SERIES[0], points: pts }]} xFormat={dayLabel} yFormat={(v) => `${v}`} minPoints={1} height={150} />
          </ChartCard>
        );
      })}
      {!rows.length && (
        <div className="card">
          <div className="empty" style={{ padding: 12 }}>
            <strong>No body measurements</strong>
            Record body weight occasionally. Body fat, lean mass and waist are optional.
          </div>
        </div>
      )}
      {rows.length > 0 && (
        <div className="card flush">
          {[...rows].reverse().map((r) => (
            <button key={r.id} className="list-item" onClick={() => setBody({ initial: r })}>
              <span className="grow small">{formatShort(r.date)}</span>
              <span className="xsmall text-2 tabular">
                {[r.weightKg != null && `${r.weightKg} kg`, r.bodyFatPct != null && `${r.bodyFatPct}% fat`, r.leanMassKg != null && `${r.leanMassKg} kg lean`, r.waistCm != null && `${r.waistCm} cm waist`].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="section-label">Baseline assessments</div>
      <AssessmentList assessments={data.assessments} onOpen={(a) => setAsm({ initial: a })} />

      <BodySheet open={!!body} date={today} initial={body?.initial ?? null} onClose={() => setBody(null)} />
      <AssessmentSheet
        open={!!asm}
        date={today}
        initial={asm?.initial ?? null}
        onClose={() => setAsm(null)}
        onFlexibility={() => {
          setAsm(null);
          setRom(true);
        }}
      />
      <RomSheet open={rom} date={today} onClose={() => setRom(false)} />
    </div>
  );
}

export function AssessmentList({ assessments, onOpen }: { assessments: Assessment[]; onOpen: (a: Assessment) => void }) {
  const types = Object.keys(ASSESSMENT_LABELS) as AssessmentType[];
  const any = assessments.length > 0;
  if (!any) {
    return (
      <div className="card">
        <div className="empty" style={{ padding: 12 }}>
          <strong>No assessments yet</strong>
          Record baselines on a well-recovered day, then repeat every 8–12 weeks.
        </div>
      </div>
    );
  }
  return (
    <div className="card flush" data-testid="assessment-list">
      {types.map((t) => {
        const list = assessments.filter((a) => a.type === t).sort((a, b) => (a.date < b.date ? 1 : -1));
        if (!list.length) return null;
        return list.map((a, i) => (
          <button key={a.id} className="list-item" onClick={() => onOpen(a)}>
            <span className="grow">
              <span className="small strong">{i === 0 ? ASSESSMENT_LABELS[t] : ''}</span>
              <span className="xsmall muted" style={{ display: 'block' }}>
                {formatShort(a.date)}
                {i === list.length - 1 && list.length > 1 ? ' · first' : i === 0 ? ' · latest' : ''}
              </span>
            </span>
            <span className="small tabular text-2">{assessmentSummary(a)}</span>
          </button>
        ));
      })}
    </div>
  );
}
