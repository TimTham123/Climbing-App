import { gradeLabel, gradeSwatch } from '../lib/grades';

/** Small colour swatch for a gym grade. */
export function GradeSwatch({ grade, size = 12 }: { grade: number | null | undefined; size?: number }) {
  const c = gradeSwatch(grade);
  if (!c) return null;
  return <span className="grade-swatch" style={{ background: c, width: size, height: size }} aria-hidden="true" />;
}

/** Grade badge: colour swatch + name, green-tinted when sent. */
export function GradePill({ grade, sent }: { grade: number | null | undefined; sent?: boolean }) {
  return (
    <span className={`grade-pill${sent ? ' sent' : ''}`}>
      <GradeSwatch grade={grade} />
      {gradeLabel(grade)}
    </span>
  );
}
