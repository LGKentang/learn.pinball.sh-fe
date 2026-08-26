import { useEffect, useRef, useState } from 'react';
import { STATES, STATE_LABEL, type State } from './api';

export function StateBadge({ state }: { state: State }) {
  return (
    <span className={`state ${state}`}>
      <i className="pip" />
      {STATE_LABEL[state]}
    </span>
  );
}

const STATE_COLOR: Record<State, string> = {
  unexplored: '#39415a',
  exploring: '#e2b352',
  understood: '#5aa9ff',
  can_explain: '#4ec9a0',
  verified: '#b18aff',
};

/** Must match the thumb size in CSS: the thumb centre never reaches the track ends. */
const THUMB = 14;

/**
 * Where the thumb actually sits for step `n` — it travels from THUMB/2 to
 * width - THUMB/2, not 0 to width, so evenly spaced labels drift out of line.
 */
function tickLeft(n: number, last: number): string {
  const f = last === 0 ? 0 : n / last;
  return `calc(${THUMB / 2}px + ${f * 100}% - ${f * THUMB}px)`;
}

/** Edge labels hug the ends instead of centring, so they cannot overhang the track. */
function tickShift(n: number, last: number): string {
  if (n === 0) return `translateX(-${THUMB / 2}px)`;
  if (n === last) return `translateX(calc(-100% + ${THUMB / 2}px))`;
  return 'translateX(-50%)';
}

type StateControl = 'select' | 'slider';
const CONTROL_KEY = 'pinball:state-control';

function readControl(): StateControl {
  try {
    return localStorage.getItem(CONTROL_KEY) === 'slider' ? 'slider' : 'select';
  } catch {
    return 'select';
  }
}

/**
 * The five states are ordered, so a slider reads them as a scale you move along
 * rather than a list you pick from. Which one suits depends on how you think about
 * it, so both are offered and the choice is remembered.
 */
export function StatePicker({ value, onChange }: { value: State; onChange: (s: State) => void }) {
  const [control, setControl] = useState<StateControl>(readControl);

  function switchTo(next: StateControl) {
    setControl(next);
    try {
      localStorage.setItem(CONTROL_KEY, next);
    } catch {
      /* private mode, or storage disabled — the session default still works */
    }
  }

  const i = Math.max(0, STATES.indexOf(value));

  return (
    <div className={`state-control ${control}`}>
      {control === 'select' ? (
        <select
          className="field"
          style={{ width: 'auto', padding: '5px 8px', fontSize: 13 }}
          value={value}
          onChange={(e) => onChange(e.target.value as State)}
        >
          {STATES.map((s) => (
            <option key={s} value={s}>
              {STATE_LABEL[s]}
            </option>
          ))}
        </select>
      ) : (
        <div className="state-slider">
          <input
            type="range"
            min={0}
            max={STATES.length - 1}
            step={1}
            value={i}
            aria-label="Understanding state"
            style={{ ['--c' as string]: STATE_COLOR[value] }}
            onChange={(e) => onChange(STATES[Number(e.target.value)])}
          />
          <div className="ticks" aria-hidden>
            {STATES.map((s, n) => {
              const last = STATES.length - 1;
              return (
                <span
                  key={s}
                  className={n === i ? 'on' : ''}
                  style={{
                    left: tickLeft(n, last),
                    transform: tickShift(n, last),
                    color: n === i ? STATE_COLOR[s] : undefined,
                  }}
                >
                  {STATE_LABEL[s]}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <button
        type="button"
        className="control-swap"
        title={control === 'select' ? 'Switch to a slider' : 'Switch to a dropdown'}
        aria-label={control === 'select' ? 'Switch to a slider' : 'Switch to a dropdown'}
        onClick={() => switchTo(control === 'select' ? 'slider' : 'select')}
      >
        {control === 'select' ? '⇹' : '☰'}
      </button>
    </div>
  );
}

/**
 * Creating a subquestion has to cost nothing — one field, Enter to commit,
 * Escape to leave. Principle: make subquestions frictionless.
 */
export function QuickAsk({
  placeholder,
  onSubmit,
  autoFocus,
}: {
  placeholder: string;
  onSubmit: (title: string) => void | Promise<void>;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  async function commit() {
    const t = value.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await onSubmit(t);
      setValue('');
      ref.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="row">
      <input
        ref={ref}
        className="field"
        placeholder={placeholder}
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void commit();
          if (e.key === 'Escape') setValue('');
        }}
      />
      <button className="btn primary" onClick={() => void commit()} disabled={!value.trim() || busy}>
        Ask
      </button>
    </div>
  );
}

export function Meter({ counts, total }: { counts: Partial<Record<State, number>>; total: number }) {
  if (!total) return <div className="meter" />;
  return (
    <>
      <div className="meter">
        {STATES.map((s) => {
          const n = counts[s] ?? 0;
          if (!n) return null;
          return <i key={s} className={s} style={{ width: `${(n / total) * 100}%` }} />;
        })}
      </div>
      <div className="legend">
        {STATES.map((s) => {
          const n = counts[s] ?? 0;
          if (!n) return null;
          return (
            <span key={s}>
              <b className={`meter-key ${s}`} style={{ background: METER_COLOR[s] }} />
              {STATE_LABEL[s]} {n}
            </span>
          );
        })}
      </div>
    </>
  );
}

const METER_COLOR: Record<State, string> = {
  unexplored: '#39415a',
  exploring: 'var(--amber)',
  understood: 'var(--blue)',
  can_explain: 'var(--green)',
  verified: 'var(--violet)',
};

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <div className="err">{error instanceof Error ? error.message : String(error)}</div>;
}
