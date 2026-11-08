import { createContext, isValidElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

/* ------------------------------------------------------------------ */
/* Sheet                                                               */
/* ------------------------------------------------------------------ */

export function Sheet({
  open,
  title,
  onClose,
  children,
  footer,
  testId,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} data-testid={testId}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Number entry                                                        */
/* ------------------------------------------------------------------ */

function fmt(v: number | null | undefined, decimals: number): string {
  if (v == null || !isFinite(v)) return '';
  const r = Math.round(v * 10 ** decimals) / 10 ** decimals;
  return String(r);
}

export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  decimals = 0,
  placeholder = '—',
  label,
  aside,
  size,
  ariaLabel,
  testId,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  step?: number;
  min?: number;
  max?: number;
  decimals?: number;
  placeholder?: string;
  label?: ReactNode;
  aside?: ReactNode;
  size?: 'sm';
  ariaLabel?: string;
  testId?: string;
}) {
  const [text, setText] = useState(fmt(value, decimals));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmt(value, decimals));
  }, [value, decimals]);
  const clampV = (n: number) => Math.min(max, Math.max(min, n));
  const bump = (dir: 1 | -1) => {
    const base = value ?? (dir > 0 ? min - step : min + step);
    const next = clampV(Math.round((base + dir * step) * 1000) / 1000);
    onChange(next);
    setText(fmt(next, decimals));
  };
  const commit = (t: string) => {
    const cleaned = t.replace(',', '.').trim();
    if (cleaned === '') return onChange(null);
    const n = Number(cleaned);
    if (isFinite(n)) onChange(clampV(n));
  };
  return (
    <div>
      {(label || aside) && (
        <div className="stepper-label">
          <span>{label}</span>
          <span>{aside}</span>
        </div>
      )}
      <div className={`stepper${size === 'sm' ? ' sm' : ''}`} data-testid={testId}>
        <button type="button" aria-label={`Decrease ${ariaLabel ?? ''}`.trim()} onClick={() => bump(-1)}>
          −
        </button>
        <input
          inputMode={decimals > 0 || step % 1 !== 0 ? 'decimal' : 'numeric'}
          pattern={decimals > 0 ? undefined : '[0-9]*'}
          value={text}
          placeholder={placeholder}
          aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
          onFocus={(e) => {
            focused.current = true;
            e.currentTarget.select();
          }}
          onChange={(e) => {
            setText(e.target.value);
            commit(e.target.value);
          }}
          onBlur={() => {
            focused.current = false;
            setText(fmt(value, decimals));
          }}
        />
        <button type="button" aria-label={`Increase ${ariaLabel ?? ''}`.trim()} onClick={() => bump(1)}>
          +
        </button>
      </div>
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  placeholder,
  decimals = 1,
  suffix,
  testId,
}: {
  label: ReactNode;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  placeholder?: string;
  decimals?: number;
  suffix?: string;
  testId?: string;
}) {
  const [text, setText] = useState(fmt(value, decimals));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmt(value, decimals));
  }, [value, decimals]);
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {suffix ? <span className="muted"> ({suffix})</span> : null}
      </span>
      <input
        className="input tabular"
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        data-testid={testId}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          setText(fmt(value, decimals));
        }}
        onChange={(e) => {
          setText(e.target.value);
          const t = e.target.value.replace(',', '.').trim();
          if (t === '') onChange(null);
          else if (isFinite(Number(t))) onChange(Number(t));
        }}
      />
    </label>
  );
}

/** Row of numbered pills, e.g. 1–5 or 0–10. Tapping the selected value clears it. */
export function Scale({
  value,
  onChange,
  from,
  to,
  low,
  high,
  dense,
  testId,
  labels,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  from: number;
  to: number;
  low?: string;
  high?: string;
  dense?: boolean;
  testId?: string;
  labels?: Record<number, string>;
}) {
  const nums = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  return (
    <div data-testid={testId}>
      <div className={`scale${dense || nums.length > 6 ? ' dense' : ''}`} role="radiogroup">
        {nums.map((n) => (
          <button
            type="button"
            key={n}
            role="radio"
            aria-checked={value === n}
            className={value === n ? 'on' : ''}
            onClick={() => onChange(value === n ? null : n)}
          >
            {labels?.[n] ?? n}
          </button>
        ))}
      </div>
      {(low || high) && (
        <div className="scale-ends">
          <span>{low}</span>
          <span>{high}</span>
        </div>
      )}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  testId,
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode }>;
  onChange: (v: T) => void;
  testId?: string;
}) {
  return (
    <div className="seg" role="tablist" data-testid={testId}>
      {options.map((o) => (
        <button type="button" role="tab" aria-selected={o.value === value} key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <span className="switch">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </span>
  );
}

/**
 * Labelled form row. A <label> is used only around a native text control; for
 * button groups (scales, chips, segmented controls) a <label> would make a tap
 * on the label text press the first button, so a plain group is used instead.
 */
export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  const native = isValidElement(children) && typeof children.type === 'string' && ['input', 'textarea', 'select'].includes(children.type);
  const body = (
    <>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="xsmall muted" style={{ display: 'block', marginTop: 5 }}>{hint}</span>}
    </>
  );
  return native ? (
    <label className="field">{body}</label>
  ) : (
    <div className="field" role="group" aria-label={typeof label === 'string' ? label : undefined}>
      {body}
    </div>
  );
}

export function Tick({ state }: { state: 'pending' | 'done' | 'skipped' }) {
  return (
    <span className={`tick${state === 'done' ? ' on' : state === 'skipped' ? ' skip' : ''}`} aria-hidden="true">
      {state === 'done' && <Icon name="check" />}
      {state === 'skipped' && <Icon name="minus" />}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Confirm dialog + toast                                              */
/* ------------------------------------------------------------------ */

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

interface FeedbackApi {
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  toast: (message: string, action?: { label: string; run: () => void }) => void;
}

const FeedbackCtx = createContext<FeedbackApi>({
  confirm: async () => false,
  toast: () => {},
});

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [toastState, setToast] = useState<{ message: string; action?: { label: string; run: () => void }; id: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...o, resolve })), []);
  const toast = useCallback((message: string, action?: { label: string; run: () => void }) => {
    window.clearTimeout(timer.current);
    setToast({ message, action, id: Date.now() });
    timer.current = window.setTimeout(() => setToast(null), action ? 5000 : 2500);
  }, []);
  const close = (v: boolean) => {
    pending?.resolve(v);
    setPending(null);
  };

  return (
    <FeedbackCtx.Provider value={{ confirm, toast }}>
      {children}
      <Sheet
        open={!!pending}
        title={pending?.title ?? ''}
        onClose={() => close(false)}
        testId="confirm-sheet"
        footer={
          <>
            <button className="btn" onClick={() => close(false)}>
              Cancel
            </button>
            <button className={`btn ${pending?.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)} data-testid="confirm-ok">
              {pending?.confirmLabel ?? 'Confirm'}
            </button>
          </>
        }
      >
        <div className="text-2">{pending?.message}</div>
      </Sheet>
      {toastState &&
        createPortal(
          <div className="toast" role="status" key={toastState.id}>
            <span>{toastState.message}</span>
            {toastState.action && (
              <button
                onClick={() => {
                  toastState.action!.run();
                  setToast(null);
                }}
              >
                {toastState.action.label}
              </button>
            )}
          </div>,
          document.body,
        )}
    </FeedbackCtx.Provider>
  );
}

export function useFeedback(): FeedbackApi {
  return useContext(FeedbackCtx);
}
