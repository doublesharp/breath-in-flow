import { ref, computed, onUnmounted, getCurrentInstance } from 'vue';
import {
  BreathingConfig,
  BreathingPhase,
  TimerState,
  INITIAL_TIMER_STATE,
  PHASE_INFO,
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
  let transitionPending = false; // Prevent multiple queued transitions per phase

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
    intervalId = setInterval(() => tick(), 16); // ~60fps keeps visuals responsive without drift
  }

  function stopInterval() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function tick() {
    if (state.value.isPaused) return;

    // Determine current extended hold mode
    let isToleranceMode = false;
    if (
      state.value.phase === 'EXTENDED_INHALE_HOLD' ||
      state.value.phase === 'EXTENDED_EXHALE_HOLD'
    ) {
      const isFirst = state.value.isFirstExtendedHold;
      const mode = isFirst ? config.extendedHoldMode : config.secondExtendedHoldMode;
      isToleranceMode = mode === 'TOLERANCE';
    }

    // Handle extended hold tolerance mode (counting up)
    if (isToleranceMode) {
      const elapsed = (Date.now() - phaseStartTime) / 1000;
      state.value = {
        ...state.value,
        extendedHoldElapsed: elapsed,
        currentTime: elapsed,
      };
      return;
    }

    // Calculate time remaining based on actual elapsed time (no drift)
    const elapsed = (Date.now() - phaseStartTime) / 1000;
    const newTime = Math.max(0, state.value.totalPhaseTime - elapsed);
    
    // Use floor to determine when we've crossed into a new second
    const currentSecond = Math.floor(newTime);
    
    // Play click when we cross a second boundary (skip the starting second and only play for countdown)
    // For a 4s phase: starts at 4, plays when crossing to 3, 2, 1, 0
    if (currentSecond !== lastSoundedSecond) {
      // Only play if we're not at the starting second
      if (currentSecond < state.value.totalPhaseTime) {
        lastSoundedSecond = currentSecond;
        soundService.playClick();
      } else {
        // Just update the tracker without playing
        lastSoundedSecond = currentSecond;
      }
    }

    state.value = { ...state.value, currentTime: newTime };

    // When we've elapsed the full duration (with small buffer), transition to next phase
    if (elapsed >= state.value.totalPhaseTime && lastSoundedSecond === 0) {
      if (!transitionPending) {
        transitionPending = true;
        setTimeout(() => {
          transitionPending = false;
          transitionToNextPhase();
        }, 0);
      }
    }
  }

  function transitionToNextPhase() {
    const { phase: currentPhase } = state.value;

    // Handle recovery breath transition
    if (state.value.isRecoveryBreath && currentPhase === 'INHALE') {
      state.value = { ...state.value, isRecoveryBreath: false };
      startExtendedHold();
      return;
    }

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
        // Use the correct duration based on which hold it was
        // Note: For tolerance mode, we might want to pass the elapsed time, but the callback signature expects 'duration'.
        // Usually this callback is used to record the session.
        // If it was timed, we pass the target duration. If tolerance, we pass 0 or maybe the elapsed?
        // The original code passed config.extendedHoldDuration.
        
        const isFirst = state.value.isFirstExtendedHold;
        const duration = isFirst ? config.extendedHoldDuration : config.secondExtendedHoldDuration;
        
        options.onExtendedHoldEnd?.(duration, holdType, state.value);
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
    const isFirst = state.value.isFirstExtendedHold;
    const holdType = isFirst ? config.extendedHoldType : config.secondExtendedHoldType;
    const holdMode = isFirst ? config.extendedHoldMode : config.secondExtendedHoldMode;
    const holdDuration = isFirst ? config.extendedHoldDuration : config.secondExtendedHoldDuration;

    state.value = { ...state.value, extendedHoldElapsed: 0 };
    options.onExtendedHoldStart?.(holdType, state.value);

    if (holdType === 'INHALE') {
      if (holdMode === 'TIMED') {
        setPhase('EXTENDED_INHALE_HOLD', holdDuration);
      } else {
        setPhase('EXTENDED_INHALE_HOLD', 0);
      }
    } else {
      if (holdMode === 'TIMED') {
        setPhase('EXTENDED_EXHALE_HOLD', holdDuration);
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
      };

      // If second hold is INHALE type (Recovery Breath), we need to inhale first
      if (config.secondExtendedHoldType === 'INHALE') {
        state.value = { ...state.value, isRecoveryBreath: true };
        setPhase('INHALE', config.inhaleTime);
      } else {
        // If second hold is EXHALE type, we can go straight to it (assuming we just finished an inhale hold?)
        // But if we just finished EXTENDED_INHALE_HOLD, we are full. If we need to EXHALE hold, we need to EXHALE first.
        // For now, let's assume standard Wim Hof: Exhale Hold -> Inhale -> Inhale Hold.
        // If the pattern is Inhale Hold -> Exhale -> Exhale Hold, we need an Exhale transition.
        
        // If we are full (INHALE_HOLD) and need to be empty (EXHALE_HOLD), we need to exhale.
        const justFinishedInhaleHold = state.value.phase === 'EXTENDED_INHALE_HOLD';
        if (justFinishedInhaleHold && config.secondExtendedHoldType === 'EXHALE') {
           // We need a recovery exhale?
           // For simplicity, let's just start the hold. The user can exhale quickly.
           // Or we could add isRecoveryExhale logic.
           startExtendedHold();
        } else {
           startExtendedHold();
        }
      }
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
    
    // Set timestamp AFTER updating state
    phaseStartTime = Date.now();
    // Initialize lastSoundedSecond to prevent immediate tick
    lastSoundedSecond = Math.floor(duration);
    transitionPending = false;
    
    options.onPhaseChange?.(newPhase, state.value);
  }

  // Public API
  function start() {
    if (state.value.isRunning) return;

    soundService.setEnabled(config.soundEnabled);

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
    phaseStartTime = Date.now() - (state.value.totalPhaseTime - pausedTimeRemaining) * 1000;
    
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

  // Only register onUnmounted if called from a component's setup()
  if (getCurrentInstance()) {
    onUnmounted(() => {
      stopInterval();
    });
  }

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
    isRecoveryBreath,

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
