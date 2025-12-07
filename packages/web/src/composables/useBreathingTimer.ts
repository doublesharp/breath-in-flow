import { ref, computed, onUnmounted } from 'vue';
import {
  BreathingConfig,
  BreathingPhase,
  TimerState,
  INITIAL_TIMER_STATE,
  PHASE_INFO,
  formatTime,
} from '@breath-in-flow/shared';

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

  const phase = computed(() => state.value.phase);
  const currentTime = computed(() => state.value.currentTime);
  const totalPhaseTime = computed(() => state.value.totalPhaseTime);
  const currentRepetition = computed(() => state.value.currentRepetition);
  const currentSet = computed(() => state.value.currentSet);
  const isRunning = computed(() => state.value.isRunning);
  const isPaused = computed(() => state.value.isPaused);
  const extendedHoldElapsed = computed(() => state.value.extendedHoldElapsed);
  const isFirstExtendedHold = computed(() => state.value.isFirstExtendedHold);

  const phaseInfo = computed(() => PHASE_INFO[state.value.phase]);
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
    intervalId = setInterval(() => tick(), 100);
  }

  function stopInterval() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function tick() {
    if (state.value.isPaused) return;

    // Handle extended hold tolerance mode (counting up)
    if (
      (state.value.phase === 'EXTENDED_INHALE_HOLD' ||
        state.value.phase === 'EXTENDED_EXHALE_HOLD') &&
      config.extendedHoldMode === 'TOLERANCE'
    ) {
      state.value = {
        ...state.value,
        extendedHoldElapsed: state.value.extendedHoldElapsed + 0.1,
        currentTime: state.value.extendedHoldElapsed + 0.1,
      };
      return;
    }

    // Countdown for timed phases
    const newTime = Math.max(0, state.value.currentTime - 0.1);
    state.value = { ...state.value, currentTime: newTime };

    if (newTime <= 0) {
      transitionToNextPhase();
    }
  }

  function transitionToNextPhase() {
    const { phase: currentPhase } = state.value;

    switch (currentPhase) {
      case 'INHALE':
        if (config.inhaleHoldTime > 0) {
          setPhase('INHALE_HOLD', config.inhaleHoldTime);
        } else {
          setPhase('EXHALE', config.exhaleTime);
        }
        break;

      case 'INHALE_HOLD':
        setPhase('EXHALE', config.exhaleTime);
        break;

      case 'EXHALE':
        if (config.exhaleHoldTime > 0) {
          setPhase('EXHALE_HOLD', config.exhaleHoldTime);
        } else {
          handleRepetitionEnd();
        }
        break;

      case 'EXHALE_HOLD':
        handleRepetitionEnd();
        break;

      case 'EXTENDED_INHALE_HOLD':
      case 'EXTENDED_EXHALE_HOLD':
        const holdType = currentPhase === 'EXTENDED_INHALE_HOLD' ? 'INHALE' : 'EXHALE';
        options.onExtendedHoldEnd?.(config.extendedHoldDuration, holdType, state.value);
        handlePostExtendedHold();
        break;
    }
  }

  function handleRepetitionEnd() {
    options.onRepetitionComplete?.(state.value.currentRepetition, state.value);

    if (config.extendedHoldEnabled && state.value.currentRepetition >= config.repetitions) {
      startExtendedHold();
      return;
    }

    if (state.value.currentRepetition >= config.repetitions) {
      completeSet();
      return;
    }

    state.value = {
      ...state.value,
      currentRepetition: state.value.currentRepetition + 1,
    };
    setPhase('INHALE', config.inhaleTime);
  }

  function startExtendedHold() {
    const holdType = state.value.isFirstExtendedHold
      ? config.extendedHoldType
      : config.secondExtendedHoldType;

    state.value = { ...state.value, extendedHoldElapsed: 0 };
    options.onExtendedHoldStart?.(holdType, state.value);

    if (holdType === 'INHALE') {
      if (config.extendedHoldMode === 'TIMED') {
        setPhase('EXTENDED_INHALE_HOLD', config.extendedHoldDuration);
      } else {
        setPhase('EXTENDED_INHALE_HOLD', 0);
      }
    } else {
      if (config.extendedHoldMode === 'TIMED') {
        setPhase('EXTENDED_EXHALE_HOLD', config.extendedHoldDuration);
      } else {
        setPhase('EXTENDED_EXHALE_HOLD', 0);
      }
    }
  }

  function handlePostExtendedHold() {
    if (state.value.isFirstExtendedHold && config.secondExtendedHoldEnabled) {
      state.value = {
        ...state.value,
        isFirstExtendedHold: false,
        currentRepetition: 1,
      };
      setPhase('INHALE', config.inhaleTime);
      return;
    }

    completeSet();
  }

  function completeSet() {
    options.onSetComplete?.(state.value.currentSet, state.value);

    if (config.targetSets > 0 && state.value.currentSet >= config.targetSets) {
      completeSession();
      return;
    }

    setPhase('SET_COMPLETE', 0);
    stopInterval();
  }

  function completeSession() {
    stopInterval();
    state.value = { ...state.value, isRunning: false };
    setPhase('SESSION_COMPLETE', 0);
    options.onSessionComplete?.(state.value);
  }

  function setPhase(newPhase: BreathingPhase, duration: number) {
    state.value = {
      ...state.value,
      phase: newPhase,
      currentTime: duration,
      totalPhaseTime: duration,
    };
    options.onPhaseChange?.(newPhase, state.value);
  }

  // Public API
  function start() {
    if (state.value.isRunning) return;

    state.value = {
      ...INITIAL_TIMER_STATE,
      phase: 'INHALE',
      currentTime: config.inhaleTime,
      totalPhaseTime: config.inhaleTime,
      currentRepetition: 1,
      currentSet: 1,
      isRunning: true,
      isPaused: false,
    };

    options.onPhaseChange?.('INHALE', state.value);
    startInterval();
  }

  function pause() {
    if (!state.value.isRunning || state.value.isPaused) return;

    pausedPhase.value = state.value.phase;
    state.value = { ...state.value, isPaused: true, phase: 'PAUSED' };
    stopInterval();
    options.onPhaseChange?.('PAUSED', state.value);
  }

  function resume() {
    if (!state.value.isPaused || !pausedPhase.value) return;

    state.value = { ...state.value, isPaused: false, phase: pausedPhase.value };
    pausedPhase.value = null;
    startInterval();
    options.onPhaseChange?.(state.value.phase, state.value);
  }

  function stop() {
    stopInterval();
    state.value = { ...INITIAL_TIMER_STATE };
    pausedPhase.value = null;
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
    const duration = state.value.extendedHoldElapsed;

    options.onExtendedHoldEnd?.(duration, holdType, state.value);
    handlePostExtendedHold();
  }

  function nextSet() {
    if (state.value.phase !== 'SET_COMPLETE') return;

    state.value = {
      ...state.value,
      currentSet: state.value.currentSet + 1,
      currentRepetition: 1,
      isFirstExtendedHold: true,
      extendedHoldElapsed: 0,
    };

    setPhase('INHALE', config.inhaleTime);
    startInterval();
  }

  function skipPhase() {
    if (!state.value.isRunning || state.value.isPaused) return;
    state.value = { ...state.value, currentTime: 0 };
    tick();
  }

  onUnmounted(() => {
    stopInterval();
  });

  return {
    // State
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
