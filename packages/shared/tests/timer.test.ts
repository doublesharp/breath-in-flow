import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BreathingTimer,
  formatTime,
  formatTimeSimple,
  calculateTotalCycleTime,
  calculateSetTime,
  calculateSessionTime,
} from '../src/timer';
import { BreathingConfig, DEFAULT_BREATHING_CONFIG } from '../src/schemas';

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

describe('BreathingTimer', () => {
  let timer: BreathingTimer;
  let config: BreathingConfig;

  beforeEach(() => {
    vi.useFakeTimers();
    config = {
      ...DEFAULT_BREATHING_CONFIG,
      name: 'Test Config',
      inhaleTime: 2,
      inhaleHoldTime: 1,
      exhaleTime: 2,
      exhaleHoldTime: 1,
      repetitions: 2,
    };
    timer = new BreathingTimer(config);
  });

  afterEach(() => {
    timer.destroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('clock accuracy', () => {
    it('changes phases at their scheduled deadlines without extra buffer time', () => {
      timer.start();
      for (const [milliseconds, phase, remaining] of [
        [2000, 'INHALE_HOLD', 1],
        [1000, 'EXHALE', 2],
        [2000, 'EXHALE_HOLD', 1],
        [1000, 'INHALE', 2],
      ] as const) {
        vi.advanceTimersByTime(milliseconds);
        expect(timer.getState()).toMatchObject({ phase, currentTime: remaining });
      }
      expect(timer.getState().currentRepetition).toBe(2);
    });

    it('does not accumulate sampling delay over fractional phases', () => {
      timer = new BreathingTimer({
        ...DEFAULT_BREATHING_CONFIG,
        inhaleTime: 1.25,
        exhaleTime: 1.25,
        repetitions: 10,
        targetSets: 1,
      });
      timer.start();
      vi.advanceTimersByTime(25_000);
      expect(timer.getState()).toMatchObject({ phase: 'SESSION_COMPLETE', isRunning: false });
      expect(vi.getTimerCount()).toBe(0);
    });

    it('uses elapsed time when a callback is delayed across several phases', () => {
      const now = vi.spyOn(performance, 'now').mockReturnValue(0);
      timer = new BreathingTimer({
        ...DEFAULT_BREATHING_CONFIG,
        inhaleTime: 1,
        exhaleTime: 1,
        repetitions: 3,
      });
      timer.start();
      now.mockReturnValue(5000);
      vi.advanceTimersByTime(100);
      expect(timer.getState()).toMatchObject({
        phase: 'EXHALE',
        currentRepetition: 3,
        currentTime: 1,
      });
    });

    it('preserves elapsed time between the last sampled tick and a pause', () => {
      timer.start();
      vi.advanceTimersByTime(250);
      timer.pause();
      expect(timer.getState().currentTime).toBe(1.75);
      vi.advanceTimersByTime(5000);
      timer.resume();
      vi.advanceTimersByTime(100);
      expect(timer.getState().currentTime).toBeCloseTo(1.65, 10);
    });

    it('keeps the timer stopped when resuming a manual rest between sets', () => {
      timer.start();
      vi.advanceTimersByTime(13_000);
      expect(timer.getState().phase).toBe('SET_COMPLETE');
      timer.pause();
      timer.resume();
      expect(timer.getState().phase).toBe('SET_COMPLETE');
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('start()', () => {
    it('rejects invalid durations before scheduling a timer', () => {
      expect(() => new BreathingTimer({ ...config, inhaleTime: 0, exhaleTime: 0 })).toThrow();
      expect(() => timer.updateConfig({ ...config, inhaleTime: NaN })).toThrow();
      expect(vi.getTimerCount()).toBe(0);
    });
    it('should initialize state and start with INHALE phase', () => {
      timer.start();
      const state = timer.getState();

      expect(state.phase).toBe('INHALE');
      expect(state.currentTime).toBe(2);
      expect(state.totalPhaseTime).toBe(2);
      expect(state.currentRepetition).toBe(1);
      expect(state.currentSet).toBe(1);
      expect(state.isRunning).toBe(true);
      expect(state.isPaused).toBe(false);
    });

    it('should call onPhaseChange callback', () => {
      const onPhaseChange = vi.fn();
      timer = new BreathingTimer(config, { onPhaseChange });

      timer.start();

      expect(onPhaseChange).toHaveBeenCalledWith('INHALE', expect.any(Object));
    });

    it('should not restart if already running', () => {
      timer.start();
      vi.advanceTimersByTime(500);

      timer.start(); // Try to start again
      const state = timer.getState();

      expect(state.currentTime).toBeLessThan(2); // Should continue, not reset
    });
  });

  describe('pause() and resume()', () => {
    it('should pause the timer', () => {
      timer.start();
      vi.advanceTimersByTime(500);

      timer.pause();
      const stateAfterPause = timer.getState();

      expect(stateAfterPause.isPaused).toBe(true);
      expect(stateAfterPause.phase).toBe('PAUSED');
    });

    it('should resume from paused state', () => {
      timer.start();
      vi.advanceTimersByTime(500);
      const timeBeforePause = timer.getState().currentTime;

      timer.pause();
      vi.advanceTimersByTime(1000);
      timer.resume();

      const state = timer.getState();
      expect(state.isPaused).toBe(false);
      expect(state.phase).toBe('INHALE');
      expect(state.currentTime).toBe(timeBeforePause);
    });

    it('should not advance time while paused', () => {
      timer.start();
      vi.advanceTimersByTime(500);
      const timeBeforePause = timer.getState().currentTime;

      timer.pause();
      vi.advanceTimersByTime(2000);

      timer.resume();
      expect(timer.getState().currentTime).toBe(timeBeforePause);
    });
  });

  describe('stop()', () => {
    it('should reset timer to initial state', () => {
      timer.start();
      vi.advanceTimersByTime(1000);

      timer.stop();
      const state = timer.getState();

      expect(state.phase).toBe('IDLE');
      expect(state.isRunning).toBe(false);
      expect(state.currentRepetition).toBe(0);
      expect(state.currentSet).toBe(0);
    });
  });

  describe('phase transitions', () => {
    it('should transition from INHALE to INHALE_HOLD', () => {
      timer.start();
      vi.advanceTimersByTime(2500); // 2 seconds + buffer

      expect(timer.getState().phase).toBe('INHALE_HOLD');
    });

    it('should transition from INHALE_HOLD to EXHALE', () => {
      timer.start();
      vi.advanceTimersByTime(3500); // 2s inhale + 1s hold + buffer

      expect(timer.getState().phase).toBe('EXHALE');
    });

    it('should transition from EXHALE to EXHALE_HOLD', () => {
      timer.start();
      vi.advanceTimersByTime(5500); // 2s + 1s + 2s + buffer

      expect(timer.getState().phase).toBe('EXHALE_HOLD');
    });

    it('should skip INHALE_HOLD if duration is 0', () => {
      config.inhaleHoldTime = 0;
      timer = new BreathingTimer(config);

      timer.start();
      vi.advanceTimersByTime(2500);

      expect(timer.getState().phase).toBe('EXHALE');
    });

    it('should skip EXHALE_HOLD if duration is 0', () => {
      config.exhaleHoldTime = 0;
      timer = new BreathingTimer(config);

      timer.start();
      vi.advanceTimersByTime(5500); // 2s inhale + 1s hold + 2s exhale + buffer

      // Should start next repetition
      expect(timer.getState().phase).toBe('INHALE');
      expect(timer.getState().currentRepetition).toBe(2);
    });

    it('should increment repetition after full cycle', () => {
      timer.start();
      vi.advanceTimersByTime(6500); // Full cycle: 2+1+2+1 + buffer

      const state = timer.getState();
      expect(state.currentRepetition).toBe(2);
      expect(state.phase).toBe('INHALE');
    });

    it('should complete set after all repetitions', () => {
      const onSetComplete = vi.fn();
      timer = new BreathingTimer(config, { onSetComplete });

      timer.start();
      vi.advanceTimersByTime(13000); // 2 full cycles + buffer

      expect(onSetComplete).toHaveBeenCalledWith(1, expect.any(Object));
      expect(timer.getState().phase).toBe('SET_COMPLETE');
    });
  });

  describe('repetition callbacks', () => {
    it('should call onRepetitionComplete after each rep', () => {
      const onRepetitionComplete = vi.fn();
      timer = new BreathingTimer(config, { onRepetitionComplete });

      timer.start();
      vi.advanceTimersByTime(6500); // First cycle complete + buffer

      expect(onRepetitionComplete).toHaveBeenCalledWith(1, expect.any(Object));
    });
  });

  describe('extended holds', () => {
    beforeEach(() => {
      config = {
        ...config,
        extendedHoldEnabled: true,
        extendedHoldType: 'EXHALE',
        extendedHoldMode: 'TOLERANCE',
        repetitions: 1, // Quick test
      };
      timer = new BreathingTimer(config);
    });

    it('should transition to extended hold after repetitions', () => {
      const onExtendedHoldStart = vi.fn();
      timer = new BreathingTimer(config, { onExtendedHoldStart });

      timer.start();
      vi.advanceTimersByTime(6500); // Complete 1 rep + buffer

      expect(timer.getState().phase).toBe('EXTENDED_EXHALE_HOLD');
      expect(onExtendedHoldStart).toHaveBeenCalledWith('EXHALE', expect.any(Object));
    });

    it('should count up in tolerance mode', () => {
      timer.start();
      vi.advanceTimersByTime(6500); // Get to extended hold

      const stateAtStart = timer.getState();
      expect(stateAtStart.phase).toBe('EXTENDED_EXHALE_HOLD');

      vi.advanceTimersByTime(5000); // Hold for 5 seconds

      const state = timer.getState();
      expect(state.extendedHoldElapsed).toBeGreaterThan(4);
    });

    it('should end extended hold when user calls endExtendedHold()', () => {
      const onExtendedHoldEnd = vi.fn();
      timer = new BreathingTimer(config, { onExtendedHoldEnd });

      timer.start();
      vi.advanceTimersByTime(6500); // Get to extended hold
      vi.advanceTimersByTime(5000); // Hold for 5 seconds

      timer.endExtendedHold();

      expect(onExtendedHoldEnd).toHaveBeenCalledWith(
        expect.any(Number),
        'EXHALE',
        expect.any(Object)
      );
    });

    it('should use timed mode when configured', () => {
      config.extendedHoldMode = 'TIMED';
      config.extendedHoldDuration = 5;
      timer = new BreathingTimer(config);

      const onExtendedHoldEnd = vi.fn();
      timer = new BreathingTimer(config, { onExtendedHoldEnd });

      timer.start();
      vi.advanceTimersByTime(6500); // Get to extended hold
      vi.advanceTimersByTime(5500); // Wait for timed hold to complete

      expect(onExtendedHoldEnd).toHaveBeenCalled();
    });

    it('should handle inhale extended hold type', () => {
      config.extendedHoldType = 'INHALE';
      timer = new BreathingTimer(config);

      timer.start();
      vi.advanceTimersByTime(6500);

      expect(timer.getState()).toMatchObject({ phase: 'INHALE', isRecoveryBreath: true });
      vi.advanceTimersByTime(2000);
      expect(timer.getState()).toMatchObject({
        phase: 'EXTENDED_INHALE_HOLD',
        isRecoveryBreath: false,
      });
    });

    it('should ignore endExtendedHold outside an extended hold phase', () => {
      const onExtendedHoldEnd = vi.fn();
      timer = new BreathingTimer(config, { onExtendedHoldEnd });

      timer.start();
      timer.endExtendedHold();

      expect(onExtendedHoldEnd).not.toHaveBeenCalled();
      expect(timer.getState().phase).toBe('INHALE');
    });
  });

  describe('second extended hold', () => {
    it('uses the second hold duration and mode after a tolerance hold and recovery inhale', () => {
      const onExtendedHoldEnd = vi.fn();
      const onRepetitionComplete = vi.fn();
      timer = new BreathingTimer(
        {
          ...DEFAULT_BREATHING_CONFIG,
          inhaleTime: 1,
          exhaleTime: 1,
          repetitions: 1,
          targetSets: 1,
          extendedHoldEnabled: true,
          extendedHoldType: 'EXHALE',
          extendedHoldMode: 'TOLERANCE',
          secondExtendedHoldEnabled: true,
          secondExtendedHoldType: 'INHALE',
          secondExtendedHoldMode: 'TIMED',
          secondExtendedHoldDuration: 3,
        },
        { onExtendedHoldEnd, onRepetitionComplete }
      );
      timer.start();
      vi.advanceTimersByTime(3000);
      timer.endExtendedHold();
      expect(onExtendedHoldEnd.mock.calls[0]?.slice(0, 2)).toEqual([1, 'EXHALE']);
      expect(timer.getState()).toMatchObject({ phase: 'INHALE', isRecoveryBreath: true });
      vi.advanceTimersByTime(1000);
      expect(timer.getState()).toMatchObject({
        phase: 'EXTENDED_INHALE_HOLD',
        currentTime: 3,
        isFirstExtendedHold: false,
      });
      vi.advanceTimersByTime(3000);
      expect(timer.getState().phase).toBe('SESSION_COMPLETE');
      expect(onExtendedHoldEnd.mock.calls.map(([duration, type]) => [duration, type])).toEqual([
        [1, 'EXHALE'],
        [3, 'INHALE'],
      ]);
      expect(onRepetitionComplete).toHaveBeenCalledTimes(1);
    });

    it('counts up a second tolerance hold and lets skip finish it', () => {
      const onExtendedHoldEnd = vi.fn();
      timer = new BreathingTimer(
        {
          ...DEFAULT_BREATHING_CONFIG,
          inhaleTime: 1,
          exhaleTime: 1,
          repetitions: 1,
          targetSets: 1,
          extendedHoldEnabled: true,
          extendedHoldType: 'EXHALE',
          extendedHoldMode: 'TIMED',
          extendedHoldDuration: 2,
          secondExtendedHoldEnabled: true,
          secondExtendedHoldType: 'EXHALE',
          secondExtendedHoldMode: 'TOLERANCE',
        },
        { onExtendedHoldEnd }
      );
      timer.start();
      vi.advanceTimersByTime(4500);
      expect(timer.getState()).toMatchObject({
        phase: 'EXTENDED_EXHALE_HOLD',
        currentTime: 0.5,
        isFirstExtendedHold: false,
      });
      timer.skipPhase();
      expect(timer.getState().phase).toBe('SESSION_COMPLETE');
      expect(onExtendedHoldEnd.mock.calls.map(([duration, type]) => [duration, type])).toEqual([
        [2, 'EXHALE'],
        [0.5, 'EXHALE'],
      ]);
    });

    it('records actual elapsed time when a timed hold ends between ticks', () => {
      const onExtendedHoldEnd = vi.fn();
      timer = new BreathingTimer(
        {
          ...DEFAULT_BREATHING_CONFIG,
          inhaleTime: 1,
          exhaleTime: 1,
          repetitions: 1,
          targetSets: 1,
          extendedHoldEnabled: true,
          extendedHoldType: 'EXHALE',
          extendedHoldMode: 'TIMED',
          extendedHoldDuration: 5,
        },
        { onExtendedHoldEnd }
      );
      timer.start();
      vi.advanceTimersByTime(2650);
      timer.endExtendedHold();
      expect(onExtendedHoldEnd.mock.calls[0]?.[0]).toBeCloseTo(0.65, 10);
      expect(timer.getState().phase).toBe('SESSION_COMPLETE');
    });

    it('should do second extended hold when enabled', () => {
      config = {
        ...config,
        extendedHoldEnabled: true,
        extendedHoldType: 'EXHALE',
        extendedHoldMode: 'TOLERANCE',
        secondExtendedHoldEnabled: true,
        secondExtendedHoldType: 'INHALE',
        repetitions: 1,
      };

      const onExtendedHoldStart = vi.fn();
      timer = new BreathingTimer(config, { onExtendedHoldStart });

      timer.start();
      vi.advanceTimersByTime(6500); // First extended hold

      expect(timer.getState().phase).toBe('EXTENDED_EXHALE_HOLD');
      expect(onExtendedHoldStart).toHaveBeenCalledWith('EXHALE', expect.any(Object));

      timer.endExtendedHold(); // End first hold

      // Only the recovery inhale is needed before the second hold.
      expect(timer.getState().phase).toBe('INHALE');

      vi.advanceTimersByTime(2000);

      expect(timer.getState().phase).toBe('EXTENDED_INHALE_HOLD');
    });
  });

  describe('sets', () => {
    it('should allow starting next set after set complete', () => {
      timer.start();
      vi.advanceTimersByTime(13000); // Complete first set + buffer

      expect(timer.getState().phase).toBe('SET_COMPLETE');

      timer.nextSet();

      const state = timer.getState();
      expect(state.phase).toBe('INHALE');
      expect(state.currentSet).toBe(2);
      expect(state.currentRepetition).toBe(1);
    });

    it('should complete session after target sets', () => {
      config.targetSets = 2;
      const onSessionComplete = vi.fn();
      timer = new BreathingTimer(config, { onSessionComplete });

      timer.start();
      vi.advanceTimersByTime(13000); // Complete first set
      timer.nextSet();
      vi.advanceTimersByTime(13000); // Complete second set

      expect(onSessionComplete).toHaveBeenCalled();
      expect(timer.getState().phase).toBe('SESSION_COMPLETE');
    });

    it('should ignore nextSet unless a set is complete', () => {
      timer.start();
      timer.nextSet();

      const state = timer.getState();
      expect(state.phase).toBe('INHALE');
      expect(state.currentSet).toBe(1);
    });

    it('counts down configured rest and starts the next set automatically', () => {
      config = {
        ...DEFAULT_BREATHING_CONFIG,
        inhaleTime: 1,
        exhaleTime: 1,
        repetitions: 1,
        targetSets: 2,
        restBetweenSetsSeconds: 3,
      };
      timer = new BreathingTimer(config);

      timer.start();
      vi.advanceTimersByTime(2200);

      expect(timer.getState()).toMatchObject({
        phase: 'SET_REST',
        currentSet: 1,
        totalPhaseTime: 3,
      });

      vi.advanceTimersByTime(3100);

      expect(timer.getState()).toMatchObject({
        phase: 'INHALE',
        currentSet: 2,
        currentRepetition: 1,
      });
    });

    it('allows starting the next set early during timed rest', () => {
      config = {
        ...DEFAULT_BREATHING_CONFIG,
        inhaleTime: 1,
        exhaleTime: 1,
        repetitions: 1,
        targetSets: 2,
        restBetweenSetsSeconds: 30,
      };
      timer = new BreathingTimer(config);

      timer.start();
      vi.advanceTimersByTime(2200);
      expect(timer.getState().phase).toBe('SET_REST');

      timer.nextSet();

      expect(timer.getState()).toMatchObject({
        phase: 'INHALE',
        currentSet: 2,
      });
    });

    it('does not rest after the final target set', () => {
      config = {
        ...DEFAULT_BREATHING_CONFIG,
        inhaleTime: 1,
        exhaleTime: 1,
        repetitions: 1,
        targetSets: 1,
        restBetweenSetsSeconds: 30,
      };
      timer = new BreathingTimer(config);

      timer.start();
      vi.advanceTimersByTime(2200);

      expect(timer.getState().phase).toBe('SESSION_COMPLETE');
    });
  });

  describe('skipPhase()', () => {
    it('should skip to next phase', () => {
      timer.start();
      timer.skipPhase();

      expect(timer.getState().phase).toBe('INHALE_HOLD');
    });

    it('should not skip if paused', () => {
      timer.start();
      timer.pause();
      timer.skipPhase();

      expect(timer.getState().phase).toBe('PAUSED');
    });
  });

  describe('fuzzed timer invariants', () => {
    it('walks generated valid configs to set or session completion', () => {
      const rng = createRng(0x710e2026);

      for (let i = 0; i < 60; i++) {
        timer.destroy();

        const extendedHoldEnabled = rng() < 0.6;
        config = {
          ...DEFAULT_BREATHING_CONFIG,
          name: `Timer Fuzz ${i}`,
          inhaleTime: randomInt(rng, 1, 3),
          inhaleHoldTime: randomInt(rng, 0, 2),
          exhaleTime: randomInt(rng, 1, 3),
          exhaleHoldTime: randomInt(rng, 0, 2),
          repetitions: randomInt(rng, 1, 4),
          targetSets: randomInt(rng, 0, 3),
          extendedHoldEnabled,
          extendedHoldType: rng() < 0.5 ? 'INHALE' : 'EXHALE',
          extendedHoldMode: rng() < 0.5 ? 'TIMED' : 'TOLERANCE',
          extendedHoldDuration: randomInt(rng, 1, 4),
          secondExtendedHoldEnabled: extendedHoldEnabled && rng() < 0.35,
          secondExtendedHoldType: rng() < 0.5 ? 'INHALE' : 'EXHALE',
          secondExtendedHoldMode: 'TIMED',
          secondExtendedHoldDuration: randomInt(rng, 1, 4),
        };
        timer = new BreathingTimer(config);
        timer.start();

        let steps = 0;
        for (; steps < 500; steps++) {
          const state = timer.getState();

          expect(Number.isFinite(state.currentTime)).toBe(true);
          expect(Number.isFinite(state.totalPhaseTime)).toBe(true);
          expect(Number.isFinite(state.extendedHoldElapsed)).toBe(true);
          expect(state.currentTime).toBeGreaterThanOrEqual(0);
          expect(state.totalPhaseTime).toBeGreaterThanOrEqual(0);
          expect(state.currentRepetition).toBeGreaterThanOrEqual(0);
          expect(state.currentRepetition).toBeLessThanOrEqual(config.repetitions);
          expect(state.currentSet).toBeGreaterThanOrEqual(1);
          if (config.targetSets > 0) {
            expect(state.currentSet).toBeLessThanOrEqual(config.targetSets);
          }

          if (
            (state.phase === 'EXTENDED_INHALE_HOLD' || state.phase === 'EXTENDED_EXHALE_HOLD') &&
            (state.isFirstExtendedHold
              ? config.extendedHoldMode
              : config.secondExtendedHoldMode) === 'TOLERANCE'
          ) {
            timer.endExtendedHold();
            continue;
          }

          if (state.phase === 'SET_COMPLETE') {
            if (config.targetSets > 0 && state.currentSet < config.targetSets) {
              timer.nextSet();
              continue;
            }
            break;
          }

          if (state.phase === 'SESSION_COMPLETE') {
            break;
          }

          timer.skipPhase();
        }

        expect(steps).toBeLessThan(500);

        const finalState = timer.getState();
        expect(finalState.phase).toBe(config.targetSets > 0 ? 'SESSION_COMPLETE' : 'SET_COMPLETE');
        expect(finalState.currentTime).toBe(0);
        if (config.targetSets > 0) {
          expect(finalState.isRunning).toBe(false);
          expect(finalState.currentSet).toBe(config.targetSets);
        }
      }
    });
  });
});

describe('calculateSessionTime', () => {
  it('includes rest only between finite target sets', () => {
    const config: BreathingConfig = {
      ...DEFAULT_BREATHING_CONFIG,
      inhaleTime: 3,
      inhaleHoldTime: 1,
      exhaleTime: 4,
      exhaleHoldTime: 1,
      repetitions: 10,
      targetSets: 2,
      restBetweenSetsSeconds: 60,
    };

    expect(calculateSetTime(config)).toBe(90);
    expect(calculateSessionTime(config)).toBe(240);
    expect(calculateSessionTime({ ...config, targetSets: 0 })).toBe(90);
  });
});

describe('formatTime', () => {
  it.each([
    [59.1, '1:00'],
    [59.99, '1:00'],
    [60, '1:00'],
    [119.1, '2:00'],
    [3599.9, '60:00'],
  ])('carries rounded seconds into minutes for %s', (seconds, expected) => {
    expect(formatTime(seconds)).toBe(expected);
  });

  it('should format whole seconds', () => {
    expect(formatTime(5.35)).toBe('6');
    expect(formatTime(0.15)).toBe('1');
  });

  it('should format minutes and seconds', () => {
    expect(formatTime(65.5)).toBe('1:06');
    expect(formatTime(125.0)).toBe('2:05');
  });
});

describe('formatTimeSimple', () => {
  it('should format seconds simply', () => {
    expect(formatTimeSimple(5)).toBe('5s');
    expect(formatTimeSimple(45)).toBe('45s');
  });

  it('should format minutes and seconds', () => {
    expect(formatTimeSimple(65)).toBe('1:05');
    expect(formatTimeSimple(125)).toBe('2:05');
  });
});

describe('calculateTotalCycleTime', () => {
  it('should calculate total cycle time', () => {
    const config: BreathingConfig = {
      ...DEFAULT_BREATHING_CONFIG,
      name: 'Test',
      inhaleTime: 4,
      inhaleHoldTime: 2,
      exhaleTime: 6,
      exhaleHoldTime: 2,
    };

    expect(calculateTotalCycleTime(config)).toBe(14);
  });
});

describe('calculateSetTime', () => {
  it.each([
    ['INHALE', 'EXHALE', 'TIMED', 'TIMED', 46],
    ['EXHALE', 'INHALE', 'TIMED', 'TIMED', 42],
    ['EXHALE', 'EXHALE', 'TIMED', 'TIMED', 38],
    ['INHALE', 'INHALE', 'TIMED', 'TIMED', 46],
    ['INHALE', 'EXHALE', 'TOLERANCE', 'TIMED', 36],
    ['EXHALE', 'INHALE', 'TIMED', 'TOLERANCE', 22],
  ] as const)(
    'counts scheduled phases for %s/%s holds in %s/%s mode',
    (
      extendedHoldType,
      secondExtendedHoldType,
      extendedHoldMode,
      secondExtendedHoldMode,
      expected
    ) => {
      expect(
        calculateSetTime({
          ...DEFAULT_BREATHING_CONFIG,
          repetitions: 1,
          extendedHoldEnabled: true,
          extendedHoldType,
          extendedHoldMode,
          extendedHoldDuration: 10,
          secondExtendedHoldEnabled: true,
          secondExtendedHoldType,
          secondExtendedHoldMode,
          secondExtendedHoldDuration: 20,
        })
      ).toBe(expected);
    }
  );

  it('should calculate set time without extended hold', () => {
    const config: BreathingConfig = {
      ...DEFAULT_BREATHING_CONFIG,
      name: 'Test',
      inhaleTime: 4,
      inhaleHoldTime: 0,
      exhaleTime: 4,
      exhaleHoldTime: 0,
      repetitions: 4,
      extendedHoldEnabled: false,
    };

    expect(calculateSetTime(config)).toBe(32); // 8s * 4 reps
  });

  it('should include extended hold in calculation', () => {
    const config: BreathingConfig = {
      ...DEFAULT_BREATHING_CONFIG,
      name: 'Test',
      inhaleTime: 4,
      inhaleHoldTime: 0,
      exhaleTime: 4,
      exhaleHoldTime: 0,
      repetitions: 4,
      extendedHoldEnabled: true,
      extendedHoldMode: 'TIMED',
      extendedHoldDuration: 30,
    };

    expect(calculateSetTime(config)).toBe(62); // 32 + 30
  });
});
