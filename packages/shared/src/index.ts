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
} from './schemas';

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
} from './schemas';

// Timer
export {
  BreathingTimer,
  formatTime,
  formatTimeSimple,
  calculateTotalCycleTime,
  calculateSetTime,
} from './timer';

export type { BreathingTimerCallbacks } from './timer';
