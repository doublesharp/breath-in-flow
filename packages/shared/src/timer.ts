import { BreathingConfig, BreathingPhase, TimerState, INITIAL_TIMER_STATE } from './schemas';

export interface BreathingTimerCallbacks {
  onPhaseChange?: (phase: BreathingPhase, state: TimerState) => void;
  onTick?: (state: TimerState) => void;
  onRepetitionComplete?: (repetition: number, state: TimerState) => void;
  onSetComplete?: (set: number, state: TimerState) => void;
  onSessionComplete?: (state: TimerState) => void;
  onExtendedHoldStart?: (type: 'INHALE' | 'EXHALE', state: TimerState) => void;
  onExtendedHoldEnd?: (duration: number, type: 'INHALE' | 'EXHALE', state: TimerState) => void;
}

export class BreathingTimer {
  private config: BreathingConfig;
  private state: TimerState;
  private callbacks: BreathingTimerCallbacks;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private pausedPhase: BreathingPhase | null = null;

  constructor(config: BreathingConfig, callbacks: BreathingTimerCallbacks = {}) {
    this.config = config;
    this.state = { ...INITIAL_TIMER_STATE };
    this.callbacks = callbacks;
  }

  getState(): TimerState {
    return { ...this.state };
  }

  updateConfig(config: BreathingConfig): void {
    this.config = config;
  }

  start(): void {
    if (this.state.isRunning) return;

    this.state = {
      ...INITIAL_TIMER_STATE,
      phase: 'INHALE',
      currentTime: this.config.inhaleTime,
      totalPhaseTime: this.config.inhaleTime,
      currentRepetition: 1,
      currentSet: 1,
      isRunning: true,
      isPaused: false,
    };

    this.callbacks.onPhaseChange?.('INHALE', this.state);
    this.startInterval();
  }

  pause(): void {
    if (!this.state.isRunning || this.state.isPaused) return;

    this.pausedPhase = this.state.phase;
    this.state.isPaused = true;
    this.state.phase = 'PAUSED';
    this.stopInterval();
    this.callbacks.onPhaseChange?.('PAUSED', this.state);
  }

  resume(): void {
    if (!this.state.isPaused || !this.pausedPhase) return;

    this.state.isPaused = false;
    this.state.phase = this.pausedPhase;
    this.pausedPhase = null;
    this.startInterval();
    this.callbacks.onPhaseChange?.(this.state.phase, this.state);
  }

  stop(): void {
    this.stopInterval();
    this.state = { ...INITIAL_TIMER_STATE };
    this.pausedPhase = null;
    this.callbacks.onPhaseChange?.('IDLE', this.state);
  }

  // For tolerance mode - user indicates they can't hold anymore
  endExtendedHold(): void {
    if (
      this.state.phase !== 'EXTENDED_INHALE_HOLD' &&
      this.state.phase !== 'EXTENDED_EXHALE_HOLD'
    ) {
      return;
    }

    const holdType = this.state.phase === 'EXTENDED_INHALE_HOLD' ? 'INHALE' : 'EXHALE';
    const duration = this.state.extendedHoldElapsed;

    this.callbacks.onExtendedHoldEnd?.(duration, holdType, this.state);

    this.handlePostExtendedHold();
  }

  // Skip to next phase (useful for testing or user control)
  skipPhase(): void {
    if (!this.state.isRunning || this.state.isPaused) return;
    this.state.currentTime = 0;
    this.tick();
  }

  // Advance to next set manually or skip a configured rest period
  nextSet(): void {
    if (this.state.phase !== 'SET_COMPLETE' && this.state.phase !== 'SET_REST') return;
    this.startNextSet();
  }

  private startInterval(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.tick(), 100); // 100ms for smooth countdown
  }

  private stopInterval(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private tick(): void {
    if (this.state.isPaused) return;

    // Handle extended hold tolerance mode (counting up)
    if (
      (this.state.phase === 'EXTENDED_INHALE_HOLD' ||
        this.state.phase === 'EXTENDED_EXHALE_HOLD') &&
      this.config.extendedHoldMode === 'TOLERANCE'
    ) {
      this.state.extendedHoldElapsed += 0.1;
      this.state.currentTime = this.state.extendedHoldElapsed;
      this.callbacks.onTick?.(this.state);
      return;
    }

    // Countdown for timed phases
    this.state.currentTime = Math.max(0, this.state.currentTime - 0.1);
    this.callbacks.onTick?.(this.state);

    // Phase transition when timer reaches 0
    if (this.state.currentTime <= 0) {
      this.transitionToNextPhase();
    }
  }

  private transitionToNextPhase(): void {
    const { phase } = this.state;

    switch (phase) {
      case 'INHALE':
        if (this.config.inhaleHoldTime > 0) {
          this.setPhase('INHALE_HOLD', this.config.inhaleHoldTime);
        } else {
          this.setPhase('EXHALE', this.config.exhaleTime);
        }
        break;

      case 'INHALE_HOLD':
        this.setPhase('EXHALE', this.config.exhaleTime);
        break;

      case 'EXHALE':
        if (this.config.exhaleHoldTime > 0) {
          this.setPhase('EXHALE_HOLD', this.config.exhaleHoldTime);
        } else {
          this.handleRepetitionEnd();
        }
        break;

      case 'EXHALE_HOLD':
        this.handleRepetitionEnd();
        break;

      case 'EXTENDED_INHALE_HOLD':
      case 'EXTENDED_EXHALE_HOLD':
        // Timed mode complete
        const holdType = phase === 'EXTENDED_INHALE_HOLD' ? 'INHALE' : 'EXHALE';
        this.callbacks.onExtendedHoldEnd?.(this.config.extendedHoldDuration, holdType, this.state);
        this.handlePostExtendedHold();
        break;

      case 'SET_COMPLETE':
        // Wait for user to start next set or auto-continue
        break;

      case 'SET_REST':
        this.startNextSet();
        break;

      default:
        break;
    }
  }

  private handleRepetitionEnd(): void {
    this.callbacks.onRepetitionComplete?.(this.state.currentRepetition, this.state);

    // Check if we need to do extended hold
    if (
      this.config.extendedHoldEnabled &&
      this.state.currentRepetition >= this.config.repetitions
    ) {
      this.startExtendedHold();
      return;
    }

    // Check if we've completed all repetitions
    if (this.state.currentRepetition >= this.config.repetitions) {
      this.completeSet();
      return;
    }

    // Start next repetition
    this.state.currentRepetition++;
    this.setPhase('INHALE', this.config.inhaleTime);
  }

  private startExtendedHold(): void {
    const holdType = this.state.isFirstExtendedHold
      ? this.config.extendedHoldType
      : this.config.secondExtendedHoldType;

    // First prepare with appropriate breath
    if (holdType === 'INHALE') {
      // Need to inhale first, then hold
      this.state.extendedHoldElapsed = 0;
      this.callbacks.onExtendedHoldStart?.('INHALE', this.state);

      if (this.config.extendedHoldMode === 'TIMED') {
        this.setPhase('EXTENDED_INHALE_HOLD', this.config.extendedHoldDuration);
      } else {
        this.setPhase('EXTENDED_INHALE_HOLD', 0);
      }
    } else {
      // Already exhaled, just hold
      this.state.extendedHoldElapsed = 0;
      this.callbacks.onExtendedHoldStart?.('EXHALE', this.state);

      if (this.config.extendedHoldMode === 'TIMED') {
        this.setPhase('EXTENDED_EXHALE_HOLD', this.config.extendedHoldDuration);
      } else {
        this.setPhase('EXTENDED_EXHALE_HOLD', 0);
      }
    }
  }

  private handlePostExtendedHold(): void {
    // Check if we need a second extended hold
    if (this.state.isFirstExtendedHold && this.config.secondExtendedHoldEnabled) {
      this.state.isFirstExtendedHold = false;

      // Do breathing cycle to prepare for second hold
      this.state.currentRepetition = 1;
      this.setPhase('INHALE', this.config.inhaleTime);
      return;
    }

    this.completeSet();
  }

  private completeSet(): void {
    this.callbacks.onSetComplete?.(this.state.currentSet, this.state);

    // Check if session is complete
    if (this.config.targetSets > 0 && this.state.currentSet >= this.config.targetSets) {
      this.completeSession();
      return;
    }

    if (this.config.restBetweenSetsSeconds > 0) {
      this.setPhase('SET_REST', this.config.restBetweenSetsSeconds);
    } else {
      this.setPhase('SET_COMPLETE', 0);
      this.stopInterval();
    }
  }

  private startNextSet(): void {
    this.state.currentSet++;
    this.state.currentRepetition = 1;
    this.state.isFirstExtendedHold = true;
    this.state.extendedHoldElapsed = 0;

    this.setPhase('INHALE', this.config.inhaleTime);
    this.startInterval();
  }

  private completeSession(): void {
    this.stopInterval();
    this.state.isRunning = false;
    this.setPhase('SESSION_COMPLETE', 0);
    this.callbacks.onSessionComplete?.(this.state);
  }

  private setPhase(phase: BreathingPhase, duration: number): void {
    this.state.phase = phase;
    this.state.currentTime = duration;
    this.state.totalPhaseTime = duration;
    this.callbacks.onPhaseChange?.(phase, this.state);
  }

  destroy(): void {
    this.stopInterval();
  }
}

// Utility functions
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.max(0, Math.ceil(seconds % 60));

  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  return `${secs}`;
}

export function formatTimeSimple(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  return `${secs}s`;
}

export function calculateTotalCycleTime(config: BreathingConfig): number {
  return config.inhaleTime + config.inhaleHoldTime + config.exhaleTime + config.exhaleHoldTime;
}

export function calculateSetTime(config: BreathingConfig): number {
  const cycleTime = calculateTotalCycleTime(config);
  let totalTime = cycleTime * config.repetitions;

  if (config.extendedHoldEnabled && config.extendedHoldMode === 'TIMED') {
    totalTime += config.extendedHoldDuration;

    if (config.secondExtendedHoldEnabled) {
      // Add another cycle + extended hold
      totalTime += cycleTime * config.repetitions + config.extendedHoldDuration;
    }
  }

  return totalTime;
}

export function calculateSessionTime(config: BreathingConfig): number {
  const setTime = calculateSetTime(config);
  const setCount = config.targetSets > 0 ? config.targetSets : 1;
  const restCount = Math.max(0, setCount - 1);

  return setTime * setCount + config.restBetweenSetsSeconds * restCount;
}
