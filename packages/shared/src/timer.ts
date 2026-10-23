import {
  BreathingConfig,
  BreathingConfigSchema,
  BreathingPhase,
  TimerState,
  INITIAL_TIMER_STATE,
} from './schemas';

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
  private phaseStartTime = 0;
  private pausedElapsedMs = 0;

  constructor(config: BreathingConfig, callbacks: BreathingTimerCallbacks = {}) {
    this.config = BreathingConfigSchema.parse(config);
    this.state = { ...INITIAL_TIMER_STATE };
    this.callbacks = callbacks;
  }

  getState(): TimerState {
    return { ...this.state };
  }

  updateConfig(config: BreathingConfig): void {
    this.config = BreathingConfigSchema.parse(config);
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

    this.setPhase('INHALE', this.config.inhaleTime);
    this.startInterval();
  }

  pause(): void {
    if (!this.state.isRunning || this.state.isPaused) return;

    const now = performance.now();
    if (this.hasActivePhase()) this.updateTime(now);
    this.pausedElapsedMs = Math.max(0, now - this.phaseStartTime);
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
    this.phaseStartTime = performance.now() - this.pausedElapsedMs;
    if (this.hasActivePhase()) this.startInterval();
    this.callbacks.onPhaseChange?.(this.state.phase, this.state);
  }

  stop(): void {
    this.stopInterval();
    this.state = { ...INITIAL_TIMER_STATE };
    this.pausedPhase = null;
    this.phaseStartTime = 0;
    this.pausedElapsedMs = 0;
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

    this.updateTime(performance.now());
    const holdType = this.state.phase === 'EXTENDED_INHALE_HOLD' ? 'INHALE' : 'EXHALE';
    const duration = this.state.extendedHoldElapsed;

    this.callbacks.onExtendedHoldEnd?.(duration, holdType, this.state);

    this.handlePostExtendedHold();
  }

  // Skip to next phase (useful for testing or user control)
  skipPhase(): void {
    if (!this.state.isRunning || this.state.isPaused) return;
    if (this.isExtendedHoldPhase()) {
      this.endExtendedHold();
      return;
    }
    this.state.currentTime = 0;
    this.transitionToNextPhase();
  }

  // Advance to next set manually or skip a configured rest period
  nextSet(): void {
    if (this.state.phase !== 'SET_COMPLETE' && this.state.phase !== 'SET_REST') return;
    this.startNextSet();
  }

  private startInterval(): void {
    if (this.intervalId !== null || !this.hasActivePhase()) return;
    this.intervalId = setInterval(() => this.tick(), 100); // 100ms for smooth countdown
  }

  private stopInterval(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private hasActivePhase(): boolean {
    return this.state.isRunning && !this.state.isPaused && this.state.phase !== 'SET_COMPLETE';
  }

  private isExtendedHoldPhase(): boolean {
    return (
      this.state.phase === 'EXTENDED_INHALE_HOLD' || this.state.phase === 'EXTENDED_EXHALE_HOLD'
    );
  }

  private isToleranceHold(): boolean {
    return (
      this.isExtendedHoldPhase() &&
      (this.state.isFirstExtendedHold
        ? this.config.extendedHoldMode
        : this.config.secondExtendedHoldMode) === 'TOLERANCE'
    );
  }

  private updateTime(now: number): void {
    const elapsed = Math.max(0, (now - this.phaseStartTime) / 1000);
    const tolerance = this.isToleranceHold();
    this.state.currentTime = tolerance ? elapsed : Math.max(0, this.state.totalPhaseTime - elapsed);
    if (this.isExtendedHoldPhase()) {
      this.state.extendedHoldElapsed = tolerance
        ? elapsed
        : Math.min(this.state.totalPhaseTime, elapsed);
    }
  }

  private tick(): void {
    const now = performance.now();
    while (this.hasActivePhase()) {
      this.updateTime(now);
      this.callbacks.onTick?.(this.state);
      if (!this.hasActivePhase() || this.isToleranceHold() || this.state.currentTime > 0) return;
      // Carry deadlines forward instead of accumulating interval delay in every phase.
      this.transitionToNextPhase(this.phaseStartTime + this.state.totalPhaseTime * 1000);
    }
  }

  private transitionToNextPhase(startedAt = performance.now()): void {
    const { phase } = this.state;

    if (this.state.isRecoveryBreath && phase === 'INHALE') {
      this.state.isRecoveryBreath = false;
      this.startExtendedHold(startedAt);
      return;
    }
    if (this.state.isRecoveryExhale && phase === 'EXHALE') {
      this.state.isRecoveryExhale = false;
      this.startExtendedHold(startedAt);
      return;
    }

    switch (phase) {
      case 'INHALE':
        if (this.config.inhaleHoldTime > 0) {
          this.setPhase('INHALE_HOLD', this.config.inhaleHoldTime, startedAt);
        } else {
          this.setPhase('EXHALE', this.config.exhaleTime, startedAt);
        }
        break;

      case 'INHALE_HOLD':
        this.setPhase('EXHALE', this.config.exhaleTime, startedAt);
        break;

      case 'EXHALE':
        if (this.config.exhaleHoldTime > 0) {
          this.setPhase('EXHALE_HOLD', this.config.exhaleHoldTime, startedAt);
        } else {
          this.handleRepetitionEnd(startedAt);
        }
        break;

      case 'EXHALE_HOLD':
        this.handleRepetitionEnd(startedAt);
        break;

      case 'EXTENDED_INHALE_HOLD':
      case 'EXTENDED_EXHALE_HOLD':
        // Timed mode complete
        const holdType = phase === 'EXTENDED_INHALE_HOLD' ? 'INHALE' : 'EXHALE';
        this.callbacks.onExtendedHoldEnd?.(this.state.extendedHoldElapsed, holdType, this.state);
        this.handlePostExtendedHold(startedAt);
        break;

      case 'SET_COMPLETE':
        // Wait for user to start next set or auto-continue
        break;

      case 'SET_REST':
        this.startNextSet(startedAt);
        break;

      default:
        break;
    }
  }

  private handleRepetitionEnd(startedAt: number): void {
    this.callbacks.onRepetitionComplete?.(this.state.currentRepetition, this.state);

    // Check if we need to do extended hold
    if (
      this.config.extendedHoldEnabled &&
      this.state.currentRepetition >= this.config.repetitions
    ) {
      this.startExtendedHold(startedAt);
      return;
    }

    // Check if we've completed all repetitions
    if (this.state.currentRepetition >= this.config.repetitions) {
      this.completeSet(startedAt);
      return;
    }

    // Start next repetition
    this.state.currentRepetition++;
    this.setPhase('INHALE', this.config.inhaleTime, startedAt);
  }

  private startExtendedHold(startedAt: number): void {
    const holdType = this.state.isFirstExtendedHold
      ? this.config.extendedHoldType
      : this.config.secondExtendedHoldType;

    const mode = this.state.isFirstExtendedHold
      ? this.config.extendedHoldMode
      : this.config.secondExtendedHoldMode;
    const duration = this.state.isFirstExtendedHold
      ? this.config.extendedHoldDuration
      : this.config.secondExtendedHoldDuration;
    this.state.extendedHoldElapsed = 0;

    if (holdType === 'INHALE' && this.state.phase !== 'INHALE') {
      this.state.isRecoveryBreath = true;
      this.setPhase('INHALE', this.config.inhaleTime, startedAt);
      return;
    }
    this.setPhase(
      holdType === 'INHALE' ? 'EXTENDED_INHALE_HOLD' : 'EXTENDED_EXHALE_HOLD',
      mode === 'TIMED' ? duration : 0,
      startedAt
    );
    this.callbacks.onExtendedHoldStart?.(holdType, this.state);
  }

  private handlePostExtendedHold(startedAt = performance.now()): void {
    // Check if we need a second extended hold
    if (this.state.isFirstExtendedHold && this.config.secondExtendedHoldEnabled) {
      this.state.isFirstExtendedHold = false;

      if (this.config.secondExtendedHoldType === 'INHALE') {
        this.state.isRecoveryBreath = true;
        this.setPhase('INHALE', this.config.inhaleTime, startedAt);
      } else if (this.state.phase === 'EXTENDED_INHALE_HOLD') {
        this.state.isRecoveryExhale = true;
        this.setPhase('EXHALE', this.config.exhaleTime, startedAt);
      } else {
        this.startExtendedHold(startedAt);
      }
      return;
    }

    this.completeSet(startedAt);
  }

  private completeSet(startedAt: number): void {
    this.callbacks.onSetComplete?.(this.state.currentSet, this.state);

    // Check if session is complete
    if (this.config.targetSets > 0 && this.state.currentSet >= this.config.targetSets) {
      this.completeSession(startedAt);
      return;
    }

    if (this.config.restBetweenSetsSeconds > 0) {
      this.setPhase('SET_REST', this.config.restBetweenSetsSeconds, startedAt);
    } else {
      this.setPhase('SET_COMPLETE', 0, startedAt);
      this.stopInterval();
    }
  }

  private startNextSet(startedAt = performance.now()): void {
    this.state.currentSet++;
    this.state.currentRepetition = 1;
    this.state.isFirstExtendedHold = true;
    this.state.extendedHoldElapsed = 0;

    this.setPhase('INHALE', this.config.inhaleTime, startedAt);
    this.startInterval();
  }

  private completeSession(startedAt: number): void {
    this.stopInterval();
    this.state.isRunning = false;
    this.setPhase('SESSION_COMPLETE', 0, startedAt);
    this.callbacks.onSessionComplete?.(this.state);
  }

  private setPhase(phase: BreathingPhase, duration: number, startedAt = performance.now()): void {
    this.state.phase = phase;
    this.state.currentTime = duration;
    this.state.totalPhaseTime = duration;
    this.phaseStartTime = startedAt;
    this.callbacks.onPhaseChange?.(phase, this.state);
  }

  destroy(): void {
    this.stopInterval();
  }
}

// Utility functions
export function formatTime(seconds: number): string {
  const roundedSeconds = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(roundedSeconds / 60);
  const secs = roundedSeconds % 60;

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

  if (config.extendedHoldEnabled) {
    if (config.extendedHoldType === 'INHALE') totalTime += config.inhaleTime;
    if (config.extendedHoldMode === 'TIMED') totalTime += config.extendedHoldDuration;

    if (config.secondExtendedHoldEnabled) {
      if (config.secondExtendedHoldType === 'INHALE') totalTime += config.inhaleTime;
      else if (config.extendedHoldType === 'INHALE') totalTime += config.exhaleTime;
      if (config.secondExtendedHoldMode === 'TIMED') totalTime += config.secondExtendedHoldDuration;
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
