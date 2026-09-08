import { ref, computed, onUnmounted, getCurrentInstance } from 'vue';
import {
  BreathingConfig,
  BreathingPhase,
  TimerState,
  INITIAL_TIMER_STATE,
  getPhaseInfo,
  formatTime,
} from '@breath-in-flow/shared';
import { soundService } from '../services/soundService';

export interface UseBreathingTimerOptions {
  onPhaseChange?: (phase: BreathingPhase, state: TimerState) => void;
  onRepetitionComplete?: (repetition: number, state: TimerState) => void;
  onSetComplete?: (set: number, state: TimerState) => void;
  onSessionComplete?: (state: TimerState) => void;
  onExtendedHoldStart?: (type: 'INHALE' | 'EXHALE', state: TimerState) => void;
  onExtendedHoldEnd?: (duration: number, type: 'INHALE' | 'EXHALE', state: TimerState) => void;
}

export function useBreathingTimer(config: BreathingConfig, options: UseBreathingTimerOptions = {}) {
  const state = ref<TimerState>({ ...INITIAL_TIMER_STATE });
  const pausedPhase = ref<BreathingPhase | null>(null);
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let phaseStartTime = 0; // Timestamp when current phase started
  let pausedTimeRemaining = 0; // Time remaining when paused
  let lastSoundedSecond = -1; // Track last second we played a sound for

  const phase = computed(() => state.value.phase);
  const currentTime = computed(() => state.value.currentTime);
  const totalPhaseTime = computed(() => state.value.totalPhaseTime);
  const currentRepetition = computed(() => state.value.currentRepetition);
  const currentSet = computed(() => state.value.currentSet);
  const isRunning = computed(() => state.value.isRunning);
  const isPaused = computed(() => state.value.isPaused);
  const extendedHoldElapsed = computed(() => state.value.extendedHoldElapsed);
  const isFirstExtendedHold = computed(() => state.value.isFirstExtendedHold);
  const isRecoveryBreath = computed(() => state.value.isRecoveryBreath);
  const isRecoveryExhale = computed(() => state.value.isRecoveryExhale);

  const phaseInfo = computed(() => getPhaseInfo(state.value.phase, config));
  const displayTime = computed(() => formatTime(state.value.currentTime));
  const progress = computed(() => {
    if (state.value.totalPhaseTime === 0) return 0;
    return 1 - state.value.currentTime / state.value.totalPhaseTime;
  });

  // Visual scale for breathing circle (0.6 to 1.0)
  const breathingScale = computed(() => {
    const { phase: currentPhase, currentTime: time, totalPhaseTime: total } = state.value;

    if (currentPhase === 'INHALE') {
      // Sine easing for smoother inhale
      const progress = 1 - time / total;
      const eased = (1 - Math.cos(progress * Math.PI)) / 2;
      return 0.6 + eased * 0.4;
    } else if (currentPhase === 'EXHALE') {
      // Sine easing for smoother exhale
      const progress = 1 - time / total;
      const eased = (1 - Math.cos(progress * Math.PI)) / 2;
      return 1.0 - eased * 0.4;
    } else if (currentPhase === 'INHALE_HOLD' || currentPhase === 'EXTENDED_INHALE_HOLD') {
      return 1.0;
    } else if (currentPhase === 'EXHALE_HOLD' || currentPhase === 'EXTENDED_EXHALE_HOLD') {
      return 0.6;
    }
    return 0.8;
  });

  function startInterval() {
    if (intervalId) return;
    intervalId = setInterval(() => tick(), 100); // 10fps - sufficient for breathing timer without excessive CPU usage
  }

  function stopInterval() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function getExtendedHoldMode(isFirst: boolean) {
    return isFirst ? config.extendedHoldMode : config.secondExtendedHoldMode;
  }

  function isToleranceExtendedHold(phase: BreathingPhase, isFirst: boolean) {
    if (phase !== 'EXTENDED_INHALE_HOLD' && phase !== 'EXTENDED_EXHALE_HOLD') return false;
    return getExtendedHoldMode(isFirst) === 'TOLERANCE';
  }

  function isExtendedHoldPhase(phase: BreathingPhase) {
    return phase === 'EXTENDED_INHALE_HOLD' || phase === 'EXTENDED_EXHALE_HOLD';
  }

  function hasActivePhase() {
    return state.value.isRunning && !state.value.isPaused && state.value.phase !== 'SET_COMPLETE';
  }

  function getCurrentExtendedHoldElapsed(): number {
    if (!isExtendedHoldPhase(state.value.phase)) return state.value.extendedHoldElapsed;
    if (isToleranceExtendedHold(state.value.phase, state.value.isFirstExtendedHold)) {
      return state.value.extendedHoldElapsed;
    }

    const elapsed = phaseStartTime > 0 ? (performance.now() - phaseStartTime) / 1000 : 0;
    return Math.min(state.value.totalPhaseTime, Math.max(0, elapsed));
  }

  function updateTime(now: number) {
    const elapsed = Math.max(0, (now - phaseStartTime) / 1000);
    const tolerance = isToleranceExtendedHold(state.value.phase, state.value.isFirstExtendedHold);
    const currentTime = tolerance ? elapsed : Math.max(0, state.value.totalPhaseTime - elapsed);
    const extendedHoldElapsed = isExtendedHoldPhase(state.value.phase)
      ? tolerance
        ? elapsed
        : Math.min(state.value.totalPhaseTime, elapsed)
      : state.value.extendedHoldElapsed;
    if (
      currentTime !== state.value.currentTime ||
      extendedHoldElapsed !== state.value.extendedHoldElapsed
    ) {
      state.value = { ...state.value, currentTime, extendedHoldElapsed };
    }
  }

  function tick() {
    const now = performance.now();
    while (hasActivePhase()) {
      updateTime(now);
      if (isToleranceExtendedHold(state.value.phase, state.value.isFirstExtendedHold)) return;

      const currentSecond = Math.floor(state.value.currentTime);
      if (currentSecond !== lastSoundedSecond) {
        lastSoundedSecond = currentSecond;
        soundService.playClick();
      }

      if (state.value.currentTime > 0) return;
      // Carry the scheduled deadline forward, so fractional durations and late
      // callbacks do not add delay to every subsequent breathing phase.
      transitionToNextPhase(phaseStartTime + state.value.totalPhaseTime * 1000);
    }
  }

  function transitionToNextPhase(startedAt = performance.now()) {
    const { phase: currentPhase } = state.value;

    // Handle recovery breath transition
    if (state.value.isRecoveryBreath && currentPhase === 'INHALE') {
      state.value = { ...state.value, isRecoveryBreath: false };
      startExtendedHold(startedAt);
      return;
    }

    // Handle recovery exhale transition
    if (state.value.isRecoveryExhale && currentPhase === 'EXHALE') {
      state.value = { ...state.value, isRecoveryExhale: false };
      startExtendedHold(startedAt);
      return;
    }

    switch (currentPhase) {
      case 'INHALE':
        if (config.inhaleHoldTime > 0) {
          setPhase('INHALE_HOLD', config.inhaleHoldTime, startedAt);
        } else {
          setPhase('EXHALE', config.exhaleTime, startedAt);
        }
        break;

      case 'INHALE_HOLD':
        setPhase('EXHALE', config.exhaleTime, startedAt);
        break;

      case 'EXHALE':
        if (config.exhaleHoldTime > 0) {
          setPhase('EXHALE_HOLD', config.exhaleHoldTime, startedAt);
        } else {
          handleRepetitionEnd(startedAt);
        }
        break;

      case 'EXHALE_HOLD':
        handleRepetitionEnd(startedAt);
        break;

      case 'EXTENDED_INHALE_HOLD':
      case 'EXTENDED_EXHALE_HOLD':
        const holdType = currentPhase === 'EXTENDED_INHALE_HOLD' ? 'INHALE' : 'EXHALE';
        // Always pass the actual elapsed time, which is accurate for both TIMED and TOLERANCE modes
        const actualDuration = getCurrentExtendedHoldElapsed();

        options.onExtendedHoldEnd?.(actualDuration, holdType, state.value);
        handlePostExtendedHold(startedAt);
        break;

      case 'SET_REST':
        startNextSet(startedAt);
        break;
    }
  }

  function handleRepetitionEnd(startedAt = performance.now()) {
    options.onRepetitionComplete?.(state.value.currentRepetition, state.value);

    if (config.extendedHoldEnabled && state.value.currentRepetition >= config.repetitions) {
      startExtendedHold(startedAt);
      return;
    }

    if (state.value.currentRepetition >= config.repetitions) {
      completeSet(startedAt);
      return;
    }

    state.value = {
      ...state.value,
      currentRepetition: state.value.currentRepetition + 1,
    };
    setPhase('INHALE', config.inhaleTime, startedAt);
  }

  function startExtendedHold(startedAt = performance.now()) {
    const isFirst = state.value.isFirstExtendedHold;
    const holdType = isFirst ? config.extendedHoldType : config.secondExtendedHoldType;
    const holdMode = isFirst ? config.extendedHoldMode : config.secondExtendedHoldMode;
    const holdDuration = isFirst ? config.extendedHoldDuration : config.secondExtendedHoldDuration;
    const currentPhase = state.value.phase;

    state.value = { ...state.value, extendedHoldElapsed: 0 };

    const enterExtendedHold = (phase: 'EXTENDED_INHALE_HOLD' | 'EXTENDED_EXHALE_HOLD') => {
      setPhase(phase, holdMode === 'TIMED' ? holdDuration : 0, startedAt);
      options.onExtendedHoldStart?.(holdType, state.value);
    };

    if (holdType === 'INHALE') {
      if (currentPhase !== 'INHALE') {
        state.value = { ...state.value, isRecoveryBreath: true };
        setPhase('INHALE', config.inhaleTime, startedAt);
        return;
      }
      enterExtendedHold('EXTENDED_INHALE_HOLD');
    } else {
      enterExtendedHold('EXTENDED_EXHALE_HOLD');
    }
  }

  function handlePostExtendedHold(startedAt = performance.now()) {
    if (state.value.isFirstExtendedHold && config.secondExtendedHoldEnabled) {
      state.value = {
        ...state.value,
        isFirstExtendedHold: false,
      };

      // If second hold is INHALE type (Recovery Breath), we need to inhale first
      if (config.secondExtendedHoldType === 'INHALE') {
        state.value = { ...state.value, isRecoveryBreath: true };
        setPhase('INHALE', config.inhaleTime, startedAt);
      } else {
        // If second hold is EXHALE type and we just finished an INHALE hold, add a recovery exhale.
        const justFinishedInhaleHold = state.value.phase === 'EXTENDED_INHALE_HOLD';
        if (justFinishedInhaleHold && config.secondExtendedHoldType === 'EXHALE') {
          state.value = { ...state.value, isRecoveryExhale: true };
          setPhase('EXHALE', config.exhaleTime, startedAt);
        } else {
          startExtendedHold(startedAt);
        }
      }
      return;
    }

    completeSet(startedAt);
  }

  function completeSet(startedAt = performance.now()) {
    options.onSetComplete?.(state.value.currentSet, state.value);

    if (config.targetSets > 0 && state.value.currentSet >= config.targetSets) {
      completeSession(startedAt);
      return;
    }

    if (config.restBetweenSetsSeconds > 0) {
      setPhase('SET_REST', config.restBetweenSetsSeconds, startedAt);
    } else {
      setPhase('SET_COMPLETE', 0, startedAt);
      stopInterval();
    }
  }

  function completeSession(startedAt = performance.now()) {
    stopInterval();
    state.value = { ...state.value, isRunning: false };
    setPhase('SESSION_COMPLETE', 0, startedAt);
    options.onSessionComplete?.(state.value);
  }

  function setPhase(newPhase: BreathingPhase, duration: number, startedAt = performance.now()) {
    state.value = {
      ...state.value,
      phase: newPhase,
      currentTime: duration,
      totalPhaseTime: duration,
    };

    // Set timestamp AFTER updating state
    phaseStartTime = startedAt;
    // Initialize lastSoundedSecond to prevent immediate tick
    lastSoundedSecond = Math.floor(duration);

    options.onPhaseChange?.(newPhase, state.value);
  }

  // Public API
  function start() {
    if (state.value.isRunning) return;

    soundService.setEnabled(config.soundEnabled);

    // Initialize state
    state.value = {
      ...INITIAL_TIMER_STATE,
      currentRepetition: 1,
      currentSet: 1,
      isRunning: true,
      isPaused: false,
    };

    // Use setPhase to properly initialize phaseStartTime
    setPhase('INHALE', config.inhaleTime);

    // Start interval - it will handle all ticks automatically
    startInterval();
  }

  function pause() {
    if (!state.value.isRunning || state.value.isPaused) return;

    pausedPhase.value = state.value.phase;
    pausedTimeRemaining = state.value.currentTime;
    state.value = { ...state.value, isPaused: true, phase: 'PAUSED' };
    stopInterval();
    options.onPhaseChange?.('PAUSED', state.value);
  }

  function resume() {
    if (!state.value.isPaused || !pausedPhase.value) return;

    state.value = { ...state.value, isPaused: false, phase: pausedPhase.value };
    pausedPhase.value = null;

    // Adjust phase start time to account for pause duration
    const wasToleranceHold = isToleranceExtendedHold(
      state.value.phase,
      state.value.isFirstExtendedHold
    );
    // Ensure non-negative time remaining
    const safeTimeRemaining = Math.max(0, pausedTimeRemaining);
    phaseStartTime = wasToleranceHold
      ? performance.now() - safeTimeRemaining * 1000
      : performance.now() - (state.value.totalPhaseTime - safeTimeRemaining) * 1000;

    startInterval();
    options.onPhaseChange?.(state.value.phase, state.value);
  }

  function stop() {
    stopInterval();
    state.value = { ...INITIAL_TIMER_STATE };
    pausedPhase.value = null;
    phaseStartTime = 0;
    pausedTimeRemaining = 0;
    lastSoundedSecond = -1;
    options.onPhaseChange?.('IDLE', state.value);
  }

  function endExtendedHold() {
    if (
      state.value.phase !== 'EXTENDED_INHALE_HOLD' &&
      state.value.phase !== 'EXTENDED_EXHALE_HOLD'
    ) {
      return;
    }

    const holdType = state.value.phase === 'EXTENDED_INHALE_HOLD' ? 'INHALE' : 'EXHALE';
    const duration = getCurrentExtendedHoldElapsed();

    options.onExtendedHoldEnd?.(duration, holdType, state.value);
    handlePostExtendedHold();
  }

  function startNextSet(startedAt = performance.now()) {
    state.value = {
      ...state.value,
      currentSet: state.value.currentSet + 1,
      currentRepetition: 1,
      isFirstExtendedHold: true,
      extendedHoldElapsed: 0,
    };

    setPhase('INHALE', config.inhaleTime, startedAt);
    startInterval();
  }

  function nextSet() {
    if (state.value.phase !== 'SET_COMPLETE' && state.value.phase !== 'SET_REST') return;
    startNextSet();
  }

  function skipPhase() {
    if (!state.value.isRunning || state.value.isPaused) return;
    if (isToleranceExtendedHold(state.value.phase, state.value.isFirstExtendedHold)) {
      endExtendedHold();
      return;
    }

    state.value = { ...state.value, currentTime: 0 };
    transitionToNextPhase();
  }

  // Only register onUnmounted if called from a component's setup()
  if (getCurrentInstance()) {
    onUnmounted(() => {
      stopInterval();
    });
  }

  return {
    // State - Note: Exposed as mutable for testing purposes, but should be treated as readonly in production code
    state,
    phase,
    currentTime,
    totalPhaseTime,
    currentRepetition,
    currentSet,
    isRunning,
    isPaused,
    extendedHoldElapsed,
    isFirstExtendedHold,
    isRecoveryBreath,
    isRecoveryExhale,

    // Computed
    phaseInfo,
    displayTime,
    progress,
    breathingScale,

    // Actions
    start,
    pause,
    resume,
    stop,
    endExtendedHold,
    nextSet,
    skipPhase,
  };
}
