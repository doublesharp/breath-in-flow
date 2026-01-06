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
} from './schemas.js';

// Timer
export {
  BreathingTimer,
  formatTime,
  formatTimeSimple,
  calculateTotalCycleTime,
  calculateSetTime,
} from './timer.js';

export type { BreathingTimerCallbacks } from './timer.js';
