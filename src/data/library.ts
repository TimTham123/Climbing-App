import type { ItemMode, LoadType } from '../db/types';

export type LibraryGroup =
  | 'shoulder'
  | 'hip'
  | 'flexibility'
  | 'posture'
  | 'pull'
  | 'push'
  | 'legs'
  | 'core'
  | 'forearm'
  | 'warmup'
  | 'climbing';

export interface LibraryExercise {
  id: string;
  name: string;
  group: LibraryGroup;
  mode: ItemMode;
  load: LoadType;
  /** Default dose when logged on its own from the library */
  sets?: number;
  amount?: number;
  per?: string;
  /** Mobility/flexibility work counts towards the mobility summary */
  mobility?: boolean;
}

export const GROUP_LABELS: Record<LibraryGroup, string> = {
  shoulder: 'Shoulder & upper-back mobility',
  hip: 'Hip mobility',
  flexibility: 'Flexibility',
  posture: 'Posture & stability',
  pull: 'Pull strength',
  push: 'Push strength',
  legs: 'Lower body',
  core: 'Core',
  forearm: 'Forearm & wrist',
  warmup: 'Warm-up',
  climbing: 'Climbing',
};

/** Groups shown in the mobility library, in this order. */
export const MOBILITY_GROUPS: LibraryGroup[] = ['shoulder', 'hip', 'flexibility', 'posture'];

const m = (
  id: string,
  name: string,
  group: LibraryGroup,
  mode: ItemMode,
  sets: number,
  amount: number,
  per?: string,
): LibraryExercise => ({ id, name, group, mode, load: 'none', sets, amount, per, mobility: true });

const s = (id: string, name: string, group: LibraryGroup, load: LoadType, mode: ItemMode = 'reps'): LibraryExercise => ({
  id,
  name,
  group,
  mode,
  load,
});

export const LIBRARY: LibraryExercise[] = [
  // Shoulder and upper-back mobility
  m('thoracic-extensions', 'Thoracic extensions', 'shoulder', 'reps', 2, 10),
  m('open-book-rotations', 'Open-book rotations', 'shoulder', 'reps', 2, 10, 'each side'),
  m('cat-cow', 'Cat-cow', 'shoulder', 'reps', 2, 10),
  m('wall-slides', 'Wall slides', 'shoulder', 'reps', 2, 12),
  m('doorway-pec-stretch', 'Doorway pec stretch', 'shoulder', 'time', 2, 30),
  m('shoulder-flexion-wall', 'Shoulder flexion against wall', 'shoulder', 'reps', 2, 10),
  m('thoracic-rotations', 'Thoracic rotations', 'shoulder', 'reps', 2, 10, 'each side'),
  m('lat-stretch', 'Lat stretch', 'shoulder', 'time', 2, 30),

  // Hip mobility
  m('90-90-hip-switches', '90/90 hip switches', 'hip', 'reps', 2, 10),
  m('couch-stretch', 'Couch stretch', 'hip', 'time', 2, 45, 'each side'),
  m('deep-squat-hold', 'Deep squat hold', 'hip', 'time', 2, 45),
  m('cossack-squats', 'Cossack squats', 'hip', 'reps', 2, 8, 'each side'),
  m('frog-stretch', 'Frog stretch', 'hip', 'time', 2, 45),
  m('pigeon-stretch', 'Pigeon stretch', 'hip', 'time', 2, 45, 'each side'),
  m('adductor-rockbacks', 'Adductor rockbacks', 'hip', 'reps', 2, 10),

  // Flexibility
  m('pancake-stretch', 'Pancake stretch', 'flexibility', 'time', 2, 30),
  m('hamstring-stretch', 'Hamstring stretch', 'flexibility', 'time', 2, 45),
  m('middle-splits', 'Middle splits progression', 'flexibility', 'time', 2, 45),
  m('calf-stretch', 'Calf stretch', 'flexibility', 'time', 2, 30, 'each side'),
  m('hip-flexor-stretch', 'Hip flexor stretch', 'flexibility', 'time', 2, 30, 'each side'),
  m('ankle-dorsiflexion', 'Ankle dorsiflexion', 'flexibility', 'reps', 2, 10, 'each side'),
  m('wrist-extensor-stretch', 'Wrist extensor stretch', 'flexibility', 'time', 2, 30),

  // Posture and stability
  m('chin-tucks', 'Chin tucks', 'posture', 'reps', 2, 10),
  m('wall-angels', 'Wall angels', 'posture', 'reps', 2, 10),
  m('band-pull-aparts', 'Band pull-aparts', 'posture', 'reps', 2, 15),
  m('serratus-wall-slides', 'Serratus wall slides', 'posture', 'reps', 2, 12),
  m('face-pulls', 'Face pulls', 'posture', 'reps', 2, 15),
  m('prone-yt-raises', 'Prone Y/T raises', 'posture', 'reps', 2, 10, 'each'),
  m('external-rotations', 'External rotations', 'posture', 'reps', 2, 15),
  m('scapular-push-ups', 'Scapular push-ups', 'posture', 'reps', 2, 10),

  // Strength (used by the programme; also available as extra exercises)
  s('pull-ups', 'Pull-ups', 'pull', 'bodyweight'),
  s('chest-supported-rows', 'Chest-supported rows', 'pull', 'external'),
  s('neutral-lat-pulldown', 'Neutral-grip lat pulldown', 'pull', 'external'),
  s('hammer-curls', 'Dumbbell hammer curls', 'pull', 'external'),
  s('prone-y-raises', 'Prone Y raises', 'posture', 'external'),
  s('incline-db-bench', 'Incline dumbbell bench press', 'push', 'external'),
  s('landmine-press', 'Half-kneeling landmine press', 'push', 'external'),
  s('cable-external-rotations', 'Cable external rotations', 'posture', 'external'),
  s('push-ups', 'Push-ups', 'push', 'bodyweight'),
  s('goblet-squats', 'Goblet squats', 'legs', 'external'),
  s('step-ups', 'Step-ups', 'legs', 'external'),
  s('front-squats', 'Front squats', 'legs', 'external'),
  s('romanian-deadlifts', 'Romanian deadlifts', 'legs', 'external'),
  s('bulgarian-split-squats', 'Bulgarian split squats', 'legs', 'external'),
  s('standing-calf-raises', 'Standing calf raises', 'legs', 'external'),
  s('tibialis-raises', 'Tibialis raises', 'legs', 'external'),
  s('reverse-crunches', 'Reverse crunches', 'core', 'none'),
  s('side-planks', 'Side planks', 'core', 'none', 'time'),
  s('dead-bugs', 'Dead bugs', 'core', 'none'),
  s('wrist-extensions', 'Wrist extensions', 'forearm', 'external'),
  s('pronation-supination', 'Dumbbell pronation/supination', 'forearm', 'external'),
  s('band-finger-extensions', 'Band finger extensions', 'forearm', 'none'),
  s('band-external-rotations', 'Band external rotations', 'posture', 'none'),

  // Warm-up and climbing items
  s('general-cardio', 'General cardio', 'warmup', 'none', 'check'),
  s('shoulder-wrist-rotations', 'Shoulder and wrist rotations', 'warmup', 'none', 'check'),
  s('shoulder-wrist-activation', 'Shoulder and wrist activation', 'warmup', 'none', 'check'),
  s('general-warm-up', 'General warm-up', 'warmup', 'none', 'check'),
  s('easy-climbing', 'Progressive easy climbing', 'climbing', 'none', 'check'),
  s('silent-feet', 'Silent feet', 'climbing', 'none', 'count'),
  s('no-hand-readjustments', 'No hand readjustments', 'climbing', 'none', 'count'),
  s('deliberate-flagging', 'Deliberate flagging', 'climbing', 'none', 'count'),
  s('high-foot-placements', 'High-foot placements', 'climbing', 'none', 'count'),
  s('limit-bouldering', 'Limit bouldering', 'climbing', 'none', 'climb'),
  s('board-climbing', 'Board climbing', 'climbing', 'none', 'climb'),
  s('warm-up-climbing', 'Warm-up climbing', 'climbing', 'none', 'climb'),
  s('project-climbing', 'Project climbing', 'climbing', 'none', 'climb'),
  s('social-climbing', 'Social climbing & experimentation', 'climbing', 'none', 'climb'),
];

const BY_ID = new Map(LIBRARY.map((e) => [e.id, e]));

export function libraryExercise(id: string): LibraryExercise | undefined {
  return BY_ID.get(id);
}

export function isMobilityExercise(id: string): boolean {
  return !!BY_ID.get(id)?.mobility;
}

/** Exercises tracked on the strength charts by default, in display order. */
export const KEY_LIFTS = [
  'pull-ups',
  'front-squats',
  'goblet-squats',
  'incline-db-bench',
  'chest-supported-rows',
  'romanian-deadlifts',
  'neutral-lat-pulldown',
];

/** Range-of-motion measurements the user can record over time. */
export interface RomMetric {
  id: string;
  label: string;
  unit: string;
  perSide: boolean;
  better: 'higher' | 'lower';
  how: string;
  focus: 'pancake' | 'hip' | 'ankle' | 'shoulder' | 'other';
}

export const ROM_METRICS: RomMetric[] = [
  {
    id: 'pancake-chest-floor',
    label: 'Pancake: chest to floor',
    unit: 'cm',
    perSide: false,
    better: 'lower',
    how: 'Seated straddle, fold forward with a flat back. Measure from sternum to floor.',
    focus: 'pancake',
  },
  {
    id: 'straddle-width',
    label: 'Straddle width',
    unit: 'cm',
    perSide: false,
    better: 'higher',
    how: 'Seated straddle against a wall. Measure heel to heel.',
    focus: 'pancake',
  },
  {
    id: 'hip-internal-rotation',
    label: 'Hip internal rotation',
    unit: '°',
    perSide: true,
    better: 'higher',
    how: 'Seated, knee at 90°. Rotate the shin outward; estimate the angle from vertical.',
    focus: 'hip',
  },
  {
    id: 'hip-external-rotation',
    label: 'Hip external rotation',
    unit: '°',
    perSide: true,
    better: 'higher',
    how: 'Seated, knee at 90°. Rotate the shin inward; estimate the angle from vertical.',
    focus: 'hip',
  },
  {
    id: 'knee-to-wall',
    label: 'Ankle dorsiflexion: knee to wall',
    unit: 'cm',
    perSide: true,
    better: 'higher',
    how: 'Lunge facing a wall, heel down, knee touching the wall. Measure toe to wall.',
    focus: 'ankle',
  },
  {
    id: 'shoulder-flexion-gap',
    label: 'Shoulder flexion: wall gap',
    unit: 'cm',
    perSide: false,
    better: 'lower',
    how: 'Back flat on a wall, arms straight overhead. Measure the gap from thumbs to wall.',
    focus: 'shoulder',
  },
  {
    id: 'middle-split-floor',
    label: 'Middle split: groin to floor',
    unit: 'cm',
    perSide: false,
    better: 'lower',
    how: 'Slide into a middle split. Measure groin to floor.',
    focus: 'other',
  },
  {
    id: 'toe-touch',
    label: 'Standing toe touch',
    unit: 'cm',
    perSide: false,
    better: 'higher',
    how: 'Straight legs. Measure fingertips past toes (negative if short of toes).',
    focus: 'other',
  },
];

export function romMetric(id: string): RomMetric | undefined {
  return ROM_METRICS.find((r) => r.id === id);
}
