import {
  BreathingConfigSchema,
  DEFAULT_BREATHING_CONFIG,
  type BreathingConfig,
} from '@breath-in-flow/shared';

export interface RoutineGuidance {
  purpose: string;
  setup: string[];
  steps: string[];
  progression: {
    endurance: string;
    strengthening: string;
  };
  precautions: string[];
}

export interface GuidedPreset {
  id: string;
  description: string;
  config: BreathingConfig;
  guidance?: RoutineGuidance;
}

export function presetConfig(preset: GuidedPreset): BreathingConfig {
  return BreathingConfigSchema.parse(preset.config);
}

export const guidedPresets: GuidedPreset[] = [
  {
    id: 'box-breathing',
    description: 'Equal inhale, hold, exhale, and hold for a steady calming rhythm.',
    config: {
      ...DEFAULT_BREATHING_CONFIG,
      name: 'Box Breathing',
      inhaleTime: 4,
      inhaleHoldTime: 4,
      exhaleTime: 4,
      exhaleHoldTime: 4,
      repetitions: 4,
      soundTheme: 'subtle',
      ttsEnabled: true,
    },
  },
  {
    id: 'four-seven-eight',
    description: 'A familiar slow-exhale relaxation pattern.',
    config: {
      ...DEFAULT_BREATHING_CONFIG,
      name: '4-7-8 Relaxation',
      inhaleTime: 4,
      inhaleHoldTime: 7,
      exhaleTime: 8,
      exhaleHoldTime: 0,
      repetitions: 4,
      soundTheme: 'chimes',
      ttsEnabled: true,
    },
  },
  {
    id: 'cyclic-hyperventilation',
    description: 'Fast paced breathing followed by user-controlled recovery holds.',
    config: {
      ...DEFAULT_BREATHING_CONFIG,
      name: 'Cyclic Hyperventilation Method',
      inhaleTime: 2,
      inhaleHoldTime: 0,
      exhaleTime: 2,
      exhaleHoldTime: 0,
      repetitions: 30,
      extendedHoldEnabled: true,
      extendedHoldType: 'EXHALE',
      extendedHoldMode: 'TOLERANCE',
      secondExtendedHoldEnabled: true,
      secondExtendedHoldType: 'INHALE',
      secondExtendedHoldMode: 'TIMED',
      secondExtendedHoldDuration: 15,
      targetSets: 3,
      soundTheme: 'wind',
      ttsEnabled: true,
    },
  },
  {
    id: 'coherent-breathing',
    description: 'An even five-second inhale and exhale for paced breathing practice.',
    config: {
      ...DEFAULT_BREATHING_CONFIG,
      name: 'Coherent Breathing',
      inhaleTime: 5,
      inhaleHoldTime: 0,
      exhaleTime: 5,
      exhaleHoldTime: 0,
      repetitions: 6,
      targetSets: 1,
      soundTheme: 'water',
      ttsEnabled: true,
    },
  },
  {
    id: 'altitude-adapted',
    description: 'A shorter-hold variation for people who prefer less breath-hold time.',
    config: {
      ...DEFAULT_BREATHING_CONFIG,
      name: 'Altitude Adapted 3-5-7',
      inhaleTime: 3,
      inhaleHoldTime: 5,
      exhaleTime: 7,
      exhaleHoldTime: 0,
      repetitions: 6,
      soundTheme: 'wood',
      ttsEnabled: true,
    },
  },
  {
    id: 'stress-relief-quick',
    description: 'A short pattern with a longer exhale for a brief calming break.',
    config: {
      ...DEFAULT_BREATHING_CONFIG,
      name: 'Stress Relief (Quick)',
      inhaleTime: 4,
      inhaleHoldTime: 2,
      exhaleTime: 6,
      exhaleHoldTime: 0,
      repetitions: 8,
      targetSets: 1,
      soundTheme: 'water',
      ttsEnabled: true,
    },
  },
  {
    id: 'diaphragm-resistance-starter',
    description:
      'A conservative cadence for learning controlled breathing with inspiratory resistance.',
    config: {
      ...DEFAULT_BREATHING_CONFIG,
      name: 'Diaphragm Resistance Training — Starter',
      inhaleTime: 3,
      inhaleHoldTime: 1,
      exhaleTime: 4,
      exhaleHoldTime: 1,
      repetitions: 10,
      targetSets: 2,
      restBetweenSetsSeconds: 60,
      extendedHoldEnabled: false,
      soundTheme: 'wood',
      ttsEnabled: true,
    },
    guidance: {
      purpose:
        'Use this routine as a cadence and session-structure guide. The app does not set or measure resistance.',
      setup: [
        'Sit upright with relaxed shoulders and room for your lower ribs to expand.',
        'When resistance is intended, use a purpose-designed inspiratory resistance trainer according to its instructions. Do not improvise an airway obstruction.',
        'Choose gentle resistance that still allows a smooth full inhale and controlled exhale without straining.',
      ],
      steps: [
        'Seal your lips around the trainer mouthpiece if you are using one.',
        'Follow the inhale, short hold, exhale, and short hold prompts; that full sequence is one repetition.',
        'Keep your neck and shoulders relaxed. End the set if your technique becomes forced.',
        'Use the rest countdown to recover before the next set.',
      ],
      progression: {
        endurance:
          'Use lighter resistance and add comfortable repetitions or sets gradually while keeping every breath controlled.',
        strengthening:
          'Use higher resistance only within device or professional guidance, with fewer deliberate repetitions and more recovery.',
      },
      precautions: [
        'Stop for dizziness, faintness, chest pain, unusual shortness of breath, or loss of controlled technique.',
        'Do not use timing alone as a substitute for a measured resistance load.',
        'If you are under care for a heart or lung condition, or have been told to avoid strenuous breathing, get individualized guidance before resistance training.',
      ],
    },
  },
];
