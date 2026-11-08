import type { HangTemplate, Settings } from '../db/types';

export interface Phase {
  weeks: number[];
  name: string;
  focus: string;
}

/** The initial 10-week rebuilding block. */
export const PHASES: Phase[] = [
  { weeks: [1, 2], name: 'Rebuild', focus: 'Rebuild general fitness and climbing tolerance.' },
  { weeks: [3, 4], name: 'Build volume', focus: 'Gradually increase climbing volume and strength. Week 4 is a deload.' },
  { weeks: [5, 6], name: 'Introduce fingers', focus: 'Introduce low-volume hangboarding if recovery and finger tolerance are good.' },
  { weeks: [7, 8], name: 'Progress intensity', focus: 'Progress climbing and strength intensity. Week 8 is a deload.' },
  { weeks: [9, 10], name: 'Consolidate', focus: 'Consolidate training and assess progress.' },
];

export function defaultHangTemplate(): HangTemplate {
  return {
    name: 'Introductory hangs',
    notes: 'Comfortable edge. Feet-assisted if necessary. About 7/10 effort. No maximal hangs.',
    blocks: [
      {
        id: 'tpl-1',
        grip: 'half_crimp',
        edgeMm: 20,
        holdType: null,
        loadMode: 'bodyweight',
        loadKg: 0,
        feetAssisted: true,
        hangSec: 7,
        sets: 3,
        restSec: 150,
        effort: 7,
        discomfort: null,
        notes: null,
      },
    ],
  };
}

export const DEFAULT_WARMUP = [
  { id: 'wu-cat-cow', text: 'Cat-cow · 10 reps' },
  { id: 'wu-open-book', text: 'Open-book rotations · 8 each side' },
  { id: 'wu-9090', text: '90/90 hip switches · 10 reps' },
  { id: 'wu-wall-slides', text: 'Wall slides · 12 reps' },
  { id: 'wu-pull-aparts', text: 'Band pull-aparts · 15 reps' },
  { id: 'wu-wrist', text: 'Wrist rotations · 15 each direction' },
];

export const DEFAULT_COOLDOWN = [
  { id: 'cd-walk', text: 'Easy walk or light cardio · 3–5 min' },
  { id: 'cd-forearm', text: 'Forearm flexor & extensor stretch · 30 s each' },
  { id: 'cd-lat', text: 'Lat stretch · 30 s each side' },
  { id: 'cd-hip', text: 'Hip flexor stretch · 30 s each side' },
  { id: 'cd-breathe', text: 'Slow breathing · 1 min' },
];

export function defaultSettings(): Settings {
  return {
    id: 'settings',
    blockStart: null,
    blockWeeks: 10,
    deloadWeeks: [4, 8],
    deloadPct: 35,
    applyDeload: true,
    weightIncrementKg: 2.5,
    restTimer: 'auto',
    defaultRestSec: 90,
    assessmentIntervalWeeks: 10,
    warmup: DEFAULT_WARMUP.map((i) => ({ ...i })),
    cooldown: DEFAULT_COOLDOWN.map((i) => ({ ...i })),
    hangTemplate: defaultHangTemplate(),
    hangboardUnlocked: false,
    historicalMaxGrade: 'V6–V7',
    loadTargets: [],
    dismissedSuggestions: [],
    createdAt: Date.now(),
  };
}

export const GRIP_LABELS: Record<string, string> = {
  half_crimp: 'Half crimp',
  open_hand: 'Open hand',
  three_finger_drag: 'Three-finger drag',
  pinch: 'Pinch',
  sloper: 'Sloper',
};

export const GRIPS = Object.keys(GRIP_LABELS) as Array<keyof typeof GRIP_LABELS>;
