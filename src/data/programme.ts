import type { ClimbStyle, DayPlan, ItemMode, LoadType, PlanItem, Prescription } from '../db/types';

/* Compact builders so the programme below reads like the written plan. */

let seq = 0;
function item(
  day: string,
  section: string,
  exerciseId: string,
  name: string,
  mode: ItemMode,
  load: LoadType,
  rx: Prescription,
  extra: Partial<PlanItem> = {},
): PlanItem {
  seq += 1;
  return { id: `${day}-${exerciseId}-${seq}`, exerciseId, name, section, mode, load, rx, ...extra };
}

const reps = (sets: number, min: number, max?: number | null, per?: string, setsMax?: number): Prescription => ({
  sets,
  setsMax: setsMax ?? null,
  min,
  max: max ?? null,
  per: per ?? null,
});
const secs = reps; // same shape, interpreted as seconds for time items
const note = (text: string): Prescription => ({ sets: 1, note: text });
const climbs = (n: number): Prescription => ({ sets: 1, min: n, max: null });
const minutes = (min: number | null, max?: number | null, text?: string): Prescription => ({
  sets: 1,
  min,
  max: max ?? null,
  note: text ?? null,
});

const climb = (day: string, section: string, id: string, name: string, style: ClimbStyle, rx: Prescription, notes?: string) =>
  item(day, section, id, name, 'climb', 'none', rx, { climbStyle: style, notes: notes ?? null });

export function buildDefaultProgramme(): DayPlan[] {
  seq = 0;
  const monday: DayPlan = {
    weekday: 0,
    title: 'Pull strength',
    category: 'pull',
    durationMin: 75,
    durationMax: 90,
    objective: 'Develop upper-body pulling strength, back musculature, biceps and lock-off strength.',
    guidance: ['Pull-ups start at bodyweight. Add external weight only as strength improves.'],
    isRest: false,
    items: [
      item('mon', 'Strength', 'pull-ups', 'Pull-ups', 'reps', 'bodyweight', reps(3, 5, 8), {
        restSec: 150,
        notes: 'Bodyweight initially.',
      }),
      item('mon', 'Strength', 'chest-supported-rows', 'Chest-supported rows', 'reps', 'external', reps(3, 8, 10), { restSec: 120 }),
      item('mon', 'Strength', 'neutral-lat-pulldown', 'Neutral-grip lat pulldown', 'reps', 'external', reps(2, 10, 12), { restSec: 90 }),
      item('mon', 'Strength', 'hammer-curls', 'Dumbbell hammer curls', 'reps', 'external', reps(2, 10, 12), { restSec: 75 }),
      item('mon', 'Strength', 'prone-y-raises', 'Prone Y raises', 'reps', 'external', reps(2, 12, 15), { restSec: 60 }),
      item('mon', 'Finish', 'thoracic-extensions', 'Thoracic extensions', 'reps', 'none', reps(2, 10), { restSec: 20 }),
      item('mon', 'Finish', 'doorway-pec-stretch', 'Doorway pec stretch', 'time', 'none', secs(2, 30), { restSec: 15 }),
      item('mon', 'Finish', 'wrist-extensor-stretch', 'Wrist extensor stretch', 'time', 'none', secs(2, 30), { restSec: 15 }),
      item('mon', 'Finish', '90-90-hip-switches', '90/90 hip switches', 'reps', 'none', reps(2, 10), { restSec: 20 }),
    ],
  };

  const tuesday: DayPlan = {
    weekday: 1,
    title: 'Limit bouldering, legs & core',
    category: 'limit',
    durationMin: 105,
    durationMax: 120,
    objective: 'Improve maximum climbing ability, recruitment, movement execution and body tension.',
    guidance: [
      'Prioritise quality attempts and sufficient rest between them.',
      'Record problems attempted, grades, attempts and completions, plus notes on moves and sequences.',
    ],
    isRest: false,
    items: [
      item('tue', 'Warm-up', 'general-cardio', 'General cardio', 'check', 'none', note('5 minutes')),
      item('tue', 'Warm-up', 'shoulder-wrist-rotations', 'Shoulder and wrist rotations', 'check', 'none', note('Controlled circles')),
      item('tue', 'Warm-up', 'band-pull-aparts', 'Band pull-aparts', 'reps', 'none', reps(2, 15), { restSec: 30 }),
      item('tue', 'Warm-up', 'easy-climbing', 'Progressive easy climbing', 'check', 'none', note('Build up gradually')),
      climb('tue', 'Climbing', 'limit-bouldering', 'Limit bouldering', 'limit', minutes(50, 60),
        'Quality attempts, full rest. Note moves and sequences.'),
      item('tue', 'Strength', 'goblet-squats', 'Goblet squats', 'reps', 'external', reps(3, 8, 10), { restSec: 120 }),
      item('tue', 'Strength', 'step-ups', 'Step-ups', 'reps', 'external', reps(2, 8, null, 'each leg'), { restSec: 90 }),
      item('tue', 'Strength', 'reverse-crunches', 'Reverse crunches', 'reps', 'none', reps(3, 12, 15), { restSec: 60 }),
      item('tue', 'Strength', 'side-planks', 'Side planks', 'time', 'none', secs(2, 30, 45, 'each side'), { restSec: 45 }),
      item('tue', 'Finish', 'couch-stretch', 'Couch stretch', 'check', 'none', note('Each side')),
      item('tue', 'Finish', 'deep-squat-hold', 'Deep squat hold', 'check', 'none', note('Relaxed hold')),
      item('tue', 'Finish', 'thoracic-rotations', 'Thoracic rotations', 'check', 'none', note('Each side')),
    ],
  };

  const wednesday: DayPlan = {
    weekday: 2,
    title: 'Upper-body balance & posture',
    category: 'posture',
    durationMin: 60,
    durationMax: 60,
    objective: 'Strengthen antagonistic muscles, rotator cuffs, scapular stabilisers and core.',
    guidance: ['Low-intensity structural strength day. No climbing or hangboarding by default.'],
    isRest: false,
    items: [
      item('wed', 'Strength', 'incline-db-bench', 'Incline dumbbell bench press', 'reps', 'external', reps(3, 8, 10), { restSec: 120 }),
      item('wed', 'Strength', 'landmine-press', 'Half-kneeling landmine press', 'reps', 'external', reps(2, 8, null, 'each side'), { restSec: 90 }),
      item('wed', 'Strength', 'cable-external-rotations', 'Cable external rotations', 'reps', 'external', reps(2, 12, 15), { restSec: 60 }),
      item('wed', 'Strength', 'serratus-wall-slides', 'Serratus wall slides', 'reps', 'none', reps(2, 12), { restSec: 45 }),
      item('wed', 'Strength', 'prone-yt-raises', 'Prone Y/T raises', 'reps', 'none', reps(2, 10, null, 'each'), { restSec: 45 }),
      item('wed', 'Strength', 'band-finger-extensions', 'Band finger extensions', 'reps', 'none', reps(2, 20), { restSec: 30 }),
      item('wed', 'Strength', 'dead-bugs', 'Dead bugs', 'reps', 'none', reps(2, 10, null, 'each side'), { restSec: 45 }),
      item('wed', 'Mobility', 'open-book-rotations', 'Open-book rotations', 'reps', 'none', reps(2, 10, null, 'each side'), { restSec: 15 }),
      item('wed', 'Mobility', 'cat-cow', 'Cat-cow', 'reps', 'none', reps(2, 10), { restSec: 15 }),
      item('wed', 'Mobility', 'doorway-pec-stretch', 'Pec doorway stretch', 'time', 'none', secs(2, 30), { restSec: 15 }),
      item('wed', 'Mobility', 'shoulder-flexion-wall', 'Shoulder flexion against wall', 'reps', 'none', reps(2, 10), { restSec: 15 }),
    ],
  };

  const thursday: DayPlan = {
    weekday: 3,
    title: 'Board climbing & technical footwork',
    category: 'board',
    durationMin: 90,
    durationMax: 120,
    objective: 'Develop climbing-specific strength, familiarity with different holds, body positioning and movement efficiency.',
    guidance: [
      'Primary climbing-specific strength session. No separate pull training or hangboarding by default.',
      'Board: pick roughly 4–6 problems mixing pinch, sloper, edge, dynamic and body-tension moves. Keep it submaximal initially.',
    ],
    isRest: false,
    items: [
      item('thu', 'Warm-up', 'general-warm-up', 'General warm-up', 'check', 'none', note('Raise temperature')),
      item('thu', 'Warm-up', 'shoulder-wrist-activation', 'Shoulder and wrist activation', 'check', 'none', note('Light activation')),
      item('thu', 'Warm-up', 'easy-climbing', 'Progressive easy climbing', 'check', 'none', note('Build up gradually')),
      item('thu', 'Footwork drills', 'silent-feet', 'Silent feet', 'count', 'none', climbs(3)),
      item('thu', 'Footwork drills', 'no-hand-readjustments', 'No hand readjustments', 'count', 'none', climbs(2)),
      item('thu', 'Footwork drills', 'deliberate-flagging', 'Deliberate flagging', 'count', 'none', climbs(2)),
      item('thu', 'Footwork drills', 'high-foot-placements', 'High-foot placements', 'count', 'none', climbs(2)),
      climb('thu', 'Board climbing', 'board-climbing', 'Board climbing', 'board', minutes(35, 50),
        '4–6 problems. Vary pinch, sloper, edge, dynamic and tension. Submaximal at first.'),
      item('thu', 'Cooldown', 'thoracic-extensions', 'Thoracic extensions', 'reps', 'none', reps(2, 10), { restSec: 15 }),
      item('thu', 'Cooldown', 'lat-stretch', 'Lat stretch', 'time', 'none', secs(2, 30), { restSec: 15 }),
      item('thu', 'Cooldown', 'adductor-rockbacks', 'Adductor rockbacks', 'reps', 'none', reps(2, 10), { restSec: 15 }),
      item('thu', 'Cooldown', 'pancake-stretch', 'Pancake stretch', 'time', 'none', secs(2, 30), { restSec: 15 }),
    ],
  };

  const friday: DayPlan = {
    weekday: 4,
    title: 'Legs & antagonistic strength',
    category: 'legs',
    durationMin: 60,
    durationMax: 75,
    objective: 'Build lower-body strength, hip stability and the muscles opposing those used heavily in climbing.',
    guidance: [],
    isRest: false,
    items: [
      item('fri', 'Lower body', 'front-squats', 'Front squats', 'reps', 'external', reps(3, 6, 8), { restSec: 150 }),
      item('fri', 'Lower body', 'romanian-deadlifts', 'Romanian deadlifts', 'reps', 'external', reps(3, 8), { restSec: 120 }),
      item('fri', 'Lower body', 'bulgarian-split-squats', 'Bulgarian split squats', 'reps', 'external', reps(2, 8, null, 'each leg'), { restSec: 90 }),
      item('fri', 'Lower body', 'standing-calf-raises', 'Standing calf raises', 'reps', 'external', reps(3, 12, 15), { restSec: 60 }),
      item('fri', 'Lower body', 'tibialis-raises', 'Tibialis raises', 'reps', 'external', reps(2, 15, 20), { restSec: 60 }),
      item('fri', 'Antagonists', 'push-ups', 'Push-ups', 'reps', 'bodyweight', reps(2, 10, 15, undefined, 3), { restSec: 75 }),
      item('fri', 'Antagonists', 'wrist-extensions', 'Wrist extensions', 'reps', 'external', reps(2, 15, 20), { restSec: 45 }),
      item('fri', 'Antagonists', 'pronation-supination', 'Dumbbell pronation/supination', 'reps', 'external', reps(2, 12, null, 'each'), { restSec: 45 }),
      item('fri', 'Antagonists', 'band-external-rotations', 'Band external rotations', 'reps', 'none', reps(2, 15), { restSec: 45 }),
      item('fri', 'Flexibility', 'couch-stretch', 'Couch stretch', 'time', 'none', secs(2, 45, null, 'each side'), { restSec: 10 }),
      item('fri', 'Flexibility', 'hamstring-stretch', 'Hamstring stretch', 'time', 'none', secs(2, 45), { restSec: 10 }),
      item('fri', 'Flexibility', 'frog-stretch', 'Frog stretch', 'time', 'none', secs(2, 45), { restSec: 10 }),
      item('fri', 'Flexibility', 'ankle-dorsiflexion', 'Ankle dorsiflexion', 'reps', 'none', reps(2, 10, null, 'each side'), { restSec: 10 }),
    ],
  };

  const saturday: DayPlan = {
    weekday: 5,
    title: 'Project & social climbing',
    category: 'project',
    durationMin: 120,
    durationMax: null,
    objective: 'Enjoy climbing, progress personal projects and assess performance.',
    guidance: [
      'Strength testing is occasional, not every Saturday.',
      'Log project attempts against your project list to see progress across sessions.',
    ],
    isRest: false,
    items: [
      climb('sat', 'Warm-up', 'warm-up-climbing', 'Warm-up climbing', 'volume', minutes(15, 20)),
      climb('sat', 'Projects', 'project-climbing', 'Project climbing', 'project', minutes(60, 90),
        'Log each project attempt. Note moves, sequences and what still feels hard.'),
      climb('sat', 'Social', 'social-climbing', 'Social climbing & experimentation', 'social', minutes(null, null, 'Remaining time')),
    ],
  };

  const sunday: DayPlan = {
    weekday: 6,
    title: 'Rest',
    category: 'rest',
    durationMin: null,
    durationMax: null,
    objective: 'Complete rest from structured training.',
    guidance: ['Optional: gentle walking or light mobility. Log it if you like.'],
    isRest: true,
    items: [],
  };

  return [monday, tuesday, wednesday, thursday, friday, saturday, sunday];
}

/** Climbing styles that load the fingers heavily. */
export const FINGER_LOADING_STYLES: ClimbStyle[] = ['limit', 'board', 'project'];

export const CLIMB_STYLE_LABELS: Record<ClimbStyle, string> = {
  limit: 'Limit bouldering',
  technical: 'Technical',
  board: 'Board',
  project: 'Projecting',
  volume: 'Volume',
  social: 'Social',
};

export const WALL_TYPES = [
  'Gym boulder wall',
  'Kilter Board',
  'Moonboard',
  'Tension Board',
  'Spray wall',
  'Other board',
  'Outdoor',
];

export const HOLD_TYPES = ['Edge', 'Crimp', 'Pinch', 'Sloper', 'Pocket', 'Jug', 'Dynamic', 'Body tension', 'Compression', 'Heel/toe hook'];

export function isBoardWall(wall: string): boolean {
  return /board|spray/i.test(wall);
}
