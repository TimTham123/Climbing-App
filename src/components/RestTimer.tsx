import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { formatClock } from '../lib/dates';
import { Icon } from './Icon';

interface TimerState {
  endAt: number;
  duration: number;
  label: string;
}

interface TimerApi {
  /** Call synchronously inside a tap, before any await, so iOS allows the end-of-rest beep. */
  prime: () => void;
  start: (seconds: number, label?: string) => void;
  stop: () => void;
  active: boolean;
}

const KEY = 'ctt-rest-timer';
const Ctx = createContext<TimerApi>({ prime: () => {}, start: () => {}, stop: () => {}, active: false });

let audio: AudioContext | null = null;

/** iOS only allows audio after a user gesture, so this is called from the tap that starts the timer. */
function unlockAudio() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!audio) audio = new AC();
    if (audio.state === 'suspended') void audio.resume();
    // Playing a silent buffer inside the tap fully unlocks audio on iOS.
    const buf = audio.createBuffer(1, 1, 22050);
    const src = audio.createBufferSource();
    src.buffer = buf;
    src.connect(audio.destination);
    src.start(0);
  } catch {
    audio = null;
  }
}

function beep() {
  try {
    if (!audio) return;
    const now = audio.currentTime;
    [0, 0.28, 0.56].forEach((offset) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.2);
      osc.connect(gain).connect(audio!.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.22);
    });
  } catch {
    /* ignore */
  }
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* not supported on iOS */
  }
}

function load(): TimerState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as TimerState;
    return t.endAt > Date.now() - 15_000 ? t : null;
  } catch {
    return null;
  }
}

function save(t: TimerState | null) {
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function RestTimerProvider({ children }: { children: ReactNode }) {
  const [timer, setTimer] = useState<TimerState | null>(load);
  const [now, setNow] = useState(Date.now());
  const fired = useRef(false);

  const start = useCallback((seconds: number, label = 'Rest') => {
    unlockAudio();
    fired.current = false;
    const t = { endAt: Date.now() + seconds * 1000, duration: seconds, label };
    setTimer(t);
    save(t);
    setNow(Date.now());
  }, []);
  const stop = useCallback(() => {
    setTimer(null);
    save(null);
  }, []);

  useEffect(() => {
    if (!timer) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [timer]);

  const remaining = timer ? Math.ceil((timer.endAt - now) / 1000) : 0;
  useEffect(() => {
    if (!timer) return;
    if (remaining <= 0 && !fired.current) {
      fired.current = true;
      if (timer.endAt > Date.now() - 3000) beep();
    }
    if (remaining <= -15) stop();
  }, [remaining, timer, stop]);

  const adjust = (delta: number) => {
    if (!timer) return;
    const t = { ...timer, endAt: Math.max(Date.now() + 1000, timer.endAt + delta * 1000), duration: Math.max(5, timer.duration + delta) };
    fired.current = false;
    setTimer(t);
    save(t);
  };

  return (
    <Ctx.Provider value={{ prime: unlockAudio, start, stop, active: !!timer }}>
      {children}
      {timer && (
        <div className="timer-bar" data-testid="rest-timer">
          <div className={`timer-inner${remaining <= 0 ? ' done' : ''}`}>
            <Icon name="timer" size={20} />
            <div className="grow">
              <div className="timer-time">{remaining > 0 ? formatClock(remaining) : 'Go'}</div>
              <div className="xsmall text-2 ellipsis">{remaining > 0 ? timer.label : 'Rest complete'}</div>
            </div>
            {remaining > 0 && (
              <>
                <button className="btn" onClick={() => adjust(-15)} aria-label="Remove 15 seconds">
                  −15
                </button>
                <button className="btn" onClick={() => adjust(15)} aria-label="Add 15 seconds">
                  +15
                </button>
              </>
            )}
            <button className="btn" onClick={stop} aria-label="Dismiss rest timer">
              <Icon name="x" />
            </button>
            {remaining > 0 && <span className="timer-progress" style={{ width: `${Math.max(0, Math.min(100, (remaining / timer.duration) * 100))}%` }} />}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useRestTimer(): TimerApi {
  return useContext(Ctx);
}
