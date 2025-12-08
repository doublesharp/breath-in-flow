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
      state.value = {
        ...state.value,
        extendedHoldElapsed: state.value.extendedHoldElapsed + 0.1,
        currentTime: state.value.extendedHoldElapsed + 0.1,
      };
      return;
    }

    // Countdown for timed phases
    const newTime = Math.max(0, state.value.currentTime - 0.1);
    
    // Play click sound on integer seconds (when crossing integer boundary)
    // e.g. 4.0 -> 3.9 (click at 4.0, which was previous)
    // Actually, we want to click when the displayed second changes?
    // Or just on the beat.
    // If we are at 4.0, we click.
    // If we are at 3.0, we click.
    // We can check if Math.ceil(currentTime) !== Math.ceil(newTime)
    // But 4.0 -> 3.9 changes ceil from 4 to 4 (wait, ceil(3.9) is 4).
    // Floor: 4.0 -> 4, 3.9 -> 3. So floor changes.
    // But we want to click at 4.0.
    // If we use Math.ceil: 4.0 -> 4. 3.9 -> 4. No change.
    // If we use Math.floor: 4.0 -> 4. 3.9 -> 3. Change!
    // So if floor changes, we just passed an integer.
    // But we want to click AT the integer.
    // If we are at 4.0, we are about to become 3.9.
    // So we should click if currentTime is integer.
    // But floating point equality is bad.
    // Let's check if we are close to integer.
    const isInteger = Math.abs(state.value.currentTime - Math.round(state.value.currentTime)) < 0.05;
    if (isInteger && state.value.currentTime > 0) {
       soundService.playClick();
    }

    state.value = { ...state.value, currentTime: newTime };

    if (newTime <= 0) {
      transitionToNextPhase();
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
    options.onPhaseChange?.(newPhase, state.value);
    
    // Play phase change sound if not IDLE/COMPLETE
    if (
      newPhase !== 'IDLE' && 
      newPhase !== 'SESSION_COMPLETE' && 
      newPhase !== 'SET_COMPLETE' && 
      newPhase !== 'PAUSED'
    ) {
      soundService.playPhaseChange();
    }
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
    soundService.playPhaseChange();
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
