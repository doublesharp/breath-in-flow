import { z } from 'zod';

// ============================================
// Sound Theme Schemas
// ============================================

export const SoundThemeSchema = z.enum(['default', 'water', 'wind', 'subtle', 'chimes']);

export type SoundTheme = z.infer<typeof SoundThemeSchema>;

// ============================================
// Breathing Configuration Schemas
// ============================================

export const BreathingPhaseSchema = z.enum([
  'IDLE',
  'INHALE',
  'INHALE_HOLD',
  'EXHALE',
  'EXHALE_HOLD',
  'EXTENDED_INHALE_HOLD',
  'EXTENDED_EXHALE_HOLD',
  'SET_COMPLETE',
  'SESSION_COMPLETE',
  'PAUSED',
]);

export type BreathingPhase = z.infer<typeof BreathingPhaseSchema>;

export const ExtendedHoldTypeSchema = z.enum(['INHALE', 'EXHALE']);
export type ExtendedHoldType = z.infer<typeof ExtendedHoldTypeSchema>;

export const ExtendedHoldModeSchema = z.enum(['TIMED', 'TOLERANCE']);
export type ExtendedHoldMode = z.infer<typeof ExtendedHoldModeSchema>;

export const BreathingConfigSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Name is required').max(100),

  // Core breathing times (in seconds)
  inhaleTime: z.number().min(1).max(60).default(4),
  inhaleHoldTime: z.number().min(0).max(60).default(0),
  exhaleTime: z.number().min(1).max(60).default(4),
  exhaleHoldTime: z.number().min(0).max(60).default(0),

  // Repetitions before extended hold
  repetitions: z.number().min(1).max(100).default(4),

  // Extended hold configuration
  extendedHoldEnabled: z.boolean().default(false),
  extendedHoldType: ExtendedHoldTypeSchema.default('EXHALE'),
  extendedHoldMode: ExtendedHoldModeSchema.default('TOLERANCE'),
  extendedHoldDuration: z.number().min(0).max(300).default(0), // For TIMED mode

  // Second extended hold (repeat segment)
  secondExtendedHoldEnabled: z.boolean().default(false),
  secondExtendedHoldType: ExtendedHoldTypeSchema.default('INHALE'),
  secondExtendedHoldMode: ExtendedHoldModeSchema.default('TIMED'),
  secondExtendedHoldDuration: z.number().min(0).max(300).default(15),

  // Set configuration
  targetSets: z.number().min(0).max(20).default(0), // 0 means record as you go

  // Audio configuration
  soundEnabled: z.boolean().default(false),

  // Metadata
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type BreathingConfig = z.infer<typeof BreathingConfigSchema>;

export const CreateBreathingConfigSchema = BreathingConfigSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateBreathingConfig = z.infer<typeof CreateBreathingConfigSchema>;

// ============================================
// Session Schemas
// ============================================

export const ExtendedHoldRecordSchema = z.object({
  id: z.string().uuid().optional(),
  type: ExtendedHoldTypeSchema,
  mode: ExtendedHoldModeSchema,
  targetDuration: z.number().min(0).optional(), // For TIMED mode
  actualDuration: z.number().min(0), // Actual time held
  completedAt: z.date(),
});

export type ExtendedHoldRecord = z.infer<typeof ExtendedHoldRecordSchema>;

export const SessionSetSchema = z.object({
  id: z.string().uuid().optional(),
  setNumber: z.number().min(1),
  completedRepetitions: z.number().min(0),
  extendedHolds: z.array(ExtendedHoldRecordSchema).default([]),
  startedAt: z.date(),
  completedAt: z.date().optional(),
  notes: z.string().max(500).optional(),
});

export type SessionSet = z.infer<typeof SessionSetSchema>;

export const SessionStatusSchema = z.enum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED']);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionSchema = z.object({
  id: z.string().uuid().optional(),
  configId: z.string().uuid().optional(),
  configSnapshot: BreathingConfigSchema, // Snapshot of config at session start
  status: SessionStatusSchema.default('IN_PROGRESS'),
  sets: z.array(SessionSetSchema).default([]),
  targetSets: z.number().min(0).default(0),
  completedSets: z.number().min(0).default(0),
  startedAt: z.date(),
  completedAt: z.date().optional(),
  notes: z.string().max(1000).optional(),
});

export type Session = z.infer<typeof SessionSchema>;

export const CreateSessionSchema = z.object({
  configId: z.string().uuid().optional(),
  config: BreathingConfigSchema,
});

export type CreateSession = z.infer<typeof CreateSessionSchema>;

// ============================================
// Timer State Schema
// ============================================

export const TimerStateSchema = z.object({
  phase: BreathingPhaseSchema,
  currentTime: z.number().min(0), // Time remaining in current phase
  totalPhaseTime: z.number().min(0), // Total time for current phase
  currentRepetition: z.number().min(0),
  currentSet: z.number().min(0),
  isRunning: z.boolean(),
  isPaused: z.boolean(),
  extendedHoldStartTime: z.number().optional(), // For tolerance mode
  extendedHoldElapsed: z.number().default(0), // Time elapsed in extended hold
  isFirstExtendedHold: z.boolean().default(true), // First or second extended hold
  isRecoveryBreath: z.boolean().default(false), // Whether we are in a recovery breath (inhale before second hold)
});

export type TimerState = z.infer<typeof TimerStateSchema>;

// ============================================
// Default Values
// ============================================

export const DEFAULT_BREATHING_CONFIG: CreateBreathingConfig = {
  name: 'Default',
  inhaleTime: 4,
  inhaleHoldTime: 0,
  exhaleTime: 4,
  exhaleHoldTime: 0,
  repetitions: 4,
  extendedHoldEnabled: false,
  extendedHoldType: 'EXHALE',
  extendedHoldMode: 'TOLERANCE',
  extendedHoldDuration: 0,
  secondExtendedHoldEnabled: false,
  secondExtendedHoldType: 'INHALE',
  secondExtendedHoldMode: 'TIMED',
  secondExtendedHoldDuration: 15,
  targetSets: 0,
  soundEnabled: false,
};

export const INITIAL_TIMER_STATE: TimerState = {
  phase: 'IDLE',
  currentTime: 0,
  totalPhaseTime: 0,
  currentRepetition: 0,
  currentSet: 0,
  isRunning: false,
  isPaused: false,
  extendedHoldElapsed: 0,
  isFirstExtendedHold: true,
  isRecoveryBreath: false,
};

// ============================================
// Utility Types
// ============================================

export interface PhaseInfo {
  phase: BreathingPhase;
  label: string;
  instruction: string;
  color: string;
}

function getBreathInstruction(duration: number, type: 'inhale' | 'exhale'): string {
  const action = type === 'inhale' ? 'Breathe in' : 'Breathe out';
  
  if (duration <= 2) {
    return `${action} quickly`;
  } else if (duration <= 4) {
    return `${action} steadily`;
  } else if (duration <= 6) {
    return `${action} slowly`;
  } else {
    return `${action} very slowly`;
  }
}

export function getPhaseInfo(phase: BreathingPhase, config?: BreathingConfig): PhaseInfo {
  const baseInfo: Record<BreathingPhase, Omit<PhaseInfo, 'instruction'> & { instruction: string | ((c: BreathingConfig) => string) }> = {
    IDLE: {
      phase: 'IDLE',
      label: 'Ready',
      instruction: 'Press Start to begin',
      color: 'gray',
    },
    INHALE: {
      phase: 'INHALE',
      label: 'Inhale',
      instruction: (c: BreathingConfig) => getBreathInstruction(c.inhaleTime, 'inhale'),
      color: 'green',
    },
    INHALE_HOLD: {
      phase: 'INHALE_HOLD',
      label: 'Hold',
      instruction: 'Hold your breath',
      color: 'amber',
    },
    EXHALE: {
      phase: 'EXHALE',
      label: 'Exhale',
      instruction: (c: BreathingConfig) => getBreathInstruction(c.exhaleTime, 'exhale'),
      color: 'blue',
    },
    EXHALE_HOLD: {
      phase: 'EXHALE_HOLD',
      label: 'Hold',
      instruction: 'Hold empty',
      color: 'amber',
    },
    EXTENDED_INHALE_HOLD: {
      phase: 'EXTENDED_INHALE_HOLD',
      label: 'Extended Hold',
      instruction: 'Hold as long as comfortable',
      color: 'red',
    },
    EXTENDED_EXHALE_HOLD: {
      phase: 'EXTENDED_EXHALE_HOLD',
      label: 'Extended Hold',
      instruction: 'Hold as long as comfortable',
      color: 'red',
    },
    SET_COMPLETE: {
      phase: 'SET_COMPLETE',
      label: 'Set Complete',
      instruction: 'Rest before next set',
      color: 'emerald',
    },
    SESSION_COMPLETE: {
      phase: 'SESSION_COMPLETE',
      label: 'Complete!',
      instruction: 'Great job!',
      color: 'emerald',
    },
    PAUSED: {
      phase: 'PAUSED',
      label: 'Paused',
      instruction: 'Press Resume to continue',
      color: 'gray',
    },
  };

  const info = baseInfo[phase];
  const instruction = typeof info.instruction === 'function' 
    ? (config ? info.instruction(config) : 'Breathe')
    : info.instruction;

  return {
    phase: info.phase,
    label: info.label,
    instruction,
    color: info.color,
  };
}

// Backward compatibility - default PHASE_INFO without config
export const PHASE_INFO: Record<BreathingPhase, PhaseInfo> = {
  IDLE: getPhaseInfo('IDLE'),
  INHALE: getPhaseInfo('INHALE', DEFAULT_BREATHING_CONFIG as BreathingConfig),
  INHALE_HOLD: getPhaseInfo('INHALE_HOLD'),
  EXHALE: getPhaseInfo('EXHALE', DEFAULT_BREATHING_CONFIG as BreathingConfig),
  EXHALE_HOLD: getPhaseInfo('EXHALE_HOLD'),
  EXTENDED_INHALE_HOLD: getPhaseInfo('EXTENDED_INHALE_HOLD'),
  EXTENDED_EXHALE_HOLD: getPhaseInfo('EXTENDED_EXHALE_HOLD'),
  SET_COMPLETE: getPhaseInfo('SET_COMPLETE'),
  SESSION_COMPLETE: getPhaseInfo('SESSION_COMPLETE'),
  PAUSED: getPhaseInfo('PAUSED'),
};
