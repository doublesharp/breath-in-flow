// Configuration
export { AppConfig } from './config.js';

// Schemas and types
export {
  SoundThemeSchema,
  BreathingPhaseSchema,
  ExtendedHoldTypeSchema,
  ExtendedHoldModeSchema,
  BreathingConfigSchema,
  CreateBreathingConfigSchema,
  ExtendedHoldRecordSchema,
  SessionSetSchema,
  SessionStatusSchema,
  SessionSchema,
  CreateSessionSchema,
  TimerStateSchema,
  DEFAULT_BREATHING_CONFIG,
  INITIAL_TIMER_STATE,
  PHASE_INFO,
  getPhaseInfo,
  ASSESSMENT_TRIALS,
  AssessmentSymptomSchema,
  HrAmplitudeSchema,
  WaveformSmoothnessSchema,
  AssessmentTrialSchema,
  AssessmentConfigSchema,
  AssessmentResultSchema,
} from './schemas.js';

export type {
  SoundTheme,
  BreathingPhase,
  ExtendedHoldType,
  ExtendedHoldMode,
  BreathingConfig,
  CreateBreathingConfig,
  ExtendedHoldRecord,
  SessionSet,
  SessionStatus,
  Session,
  CreateSession,
  TimerState,
  PhaseInfo,
  AssessmentSymptom,
  HrAmplitude,
  WaveformSmoothness,
  AssessmentTrial,
  AssessmentConfig,
  AssessmentResult,
} from './schemas.js';

// Timer
export {
  BreathingTimer,
  formatTime,
  formatTimeSimple,
  calculateTotalCycleTime,
  calculateSetTime,
  calculateSessionTime,
} from './timer.js';

export type { BreathingTimerCallbacks } from './timer.js';

// DSP utilities
export * from './dsp/index.js';

// HRV Analysis Engine
export * from './hrv/index.js';
