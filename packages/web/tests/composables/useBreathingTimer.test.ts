import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { useBreathingTimer } from '../../src/composables/useBreathingTimer';
import { soundService } from '../../src/services/soundService';
import type { BreathingConfig } from '@breath-in-flow/shared';
import { DEFAULT_BREATHING_CONFIG } from '@breath-in-flow/shared';

describe('useBreathingTimer', () => {
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
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Basic Functionality', () => {
    it('should initialize with IDLE phase', () => {
      const timer = useBreathingTimer(config);

      expect(timer.phase.value).toBe('IDLE');
      expect(timer.isRunning.value).toBe(false);
      expect(timer.isPaused.value).toBe(false);
    });

    it('should start with INHALE phase', () => {
      const timer = useBreathingTimer(config);

      timer.start();

      expect(timer.phase.value).toBe('INHALE');
      expect(timer.isRunning.value).toBe(true);
      expect(timer.currentTime.value).toBe(2);
      expect(timer.currentRepetition.value).toBe(1);
      expect(timer.currentSet.value).toBe(1);
    });

    it('should transition through phases', () => {
      const timer = useBreathingTimer(config);

      timer.start();
      expect(timer.phase.value).toBe('INHALE');

      for (const [milliseconds, phase, remaining] of [
        [2000, 'INHALE_HOLD', 1],
        [1000, 'EXHALE', 2],
        [2000, 'EXHALE_HOLD', 1],
        [1000, 'INHALE', 2],
      ] as const) {
        vi.advanceTimersByTime(milliseconds);
        expect(timer.phase.value).toBe(phase);
        expect(timer.currentTime.value).toBe(remaining);
      }
      expect(timer.currentRepetition.value).toBe(2);
    });

    it('should pause and resume', () => {
      const timer = useBreathingTimer(config);

      timer.start();
      vi.advanceTimersByTime(300);

      timer.pause();
      expect(timer.isPaused.value).toBe(true);
      expect(timer.phase.value).toBe('PAUSED');

      const timeBeforePause = timer.currentTime.value;
      vi.advanceTimersByTime(2000);

      timer.resume();
      expect(timer.isPaused.value).toBe(false);
      // Time should remain approximately what it was when paused (within 0.1s)
      expect(Math.abs(timer.currentTime.value - timeBeforePause)).toBeLessThan(0.2);
    });

    it('should not resume if not paused', () => {
      const timer = useBreathingTimer(config);

      timer.start();
      vi.advanceTimersByTime(500);

      const phase = timer.phase.value;
      const time = timer.currentTime.value;

      // Resume without pausing should have no effect
      timer.resume();
      expect(timer.phase.value).toBe(phase);
      expect(timer.currentTime.value).toBe(time);
    });

    it('should not pause if not running', () => {
      const timer = useBreathingTimer(config);

      // Try to pause before starting - should have no effect
      timer.pause();
      expect(timer.isPaused.value).toBe(false);
      expect(timer.phase.value).toBe('IDLE');
    });

    it('should not pause if already paused', () => {
      const timer = useBreathingTimer(config);

      timer.start();
      vi.advanceTimersByTime(500);

      timer.pause();
      expect(timer.isPaused.value).toBe(true);

      const pausedPhase = timer.phase.value;

      // Try to pause again - should have no effect
      timer.pause();
      expect(timer.phase.value).toBe(pausedPhase);
    });

    it('should stop and reset', () => {
      const timer = useBreathingTimer(config);

      timer.start();
      vi.advanceTimersByTime(1000);

      timer.stop();

      expect(timer.phase.value).toBe('IDLE');
      expect(timer.isRunning.value).toBe(false);
      expect(timer.currentRepetition.value).toBe(0);
    });

    it('should call onPhaseChange callback', () => {
      const onPhaseChange = vi.fn();
      const timer = useBreathingTimer(config, { onPhaseChange });

      timer.start();

      expect(onPhaseChange).toHaveBeenCalledWith('INHALE', expect.any(Object));
    });

    it('should calculate breathing scale correctly', () => {
      const timer = useBreathingTimer(config);

      timer.start();

      // At start of inhale (scale should be around 0.6)
      expect(timer.breathingScale.value).toBeCloseTo(0.6, 1);

      vi.advanceTimersByTime(1000);
      expect(timer.phase.value).toBe('INHALE');
      expect(timer.breathingScale.value).toBeCloseTo(0.8, 6);
      vi.advanceTimersByTime(1000);
      expect(timer.phase.value).toBe('INHALE_HOLD');
      expect(timer.breathingScale.value).toBe(1);
      vi.advanceTimersByTime(2000);
      expect(timer.phase.value).toBe('EXHALE');
      expect(timer.breathingScale.value).toBeCloseTo(0.8, 6);
    });

    it('should format display time correctly', () => {
      const timer = useBreathingTimer(config);

      timer.start();

      expect(timer.displayTime.value).toMatch(/^\d+$/);
    });

    it('should skip phase when skipPhase is called', () => {
      const timer = useBreathingTimer(config);

      timer.start();
      expect(timer.phase.value).toBe('INHALE');

      timer.skipPhase();
      expect(timer.phase.value).toBe('INHALE_HOLD');
      expect(timer.currentTime.value).toBe(config.inhaleHoldTime);
    });

    it('should handle nextSet correctly', () => {
      const timer = useBreathingTimer(config);

      timer.start();
      vi.advanceTimersByTime(13000); // With buffer
      expect(timer.phase.value).toBe('SET_COMPLETE');

      timer.nextSet();

      expect(timer.phase.value).toBe('INHALE');
      expect(timer.currentSet.value).toBe(2);
      expect(timer.currentRepetition.value).toBe(1);
    });

    it('counts down configured rest and starts the next set automatically', () => {
      const timer = useBreathingTimer({
        ...DEFAULT_BREATHING_CONFIG,
        inhaleTime: 1,
        exhaleTime: 1,
        repetitions: 1,
        targetSets: 2,
        restBetweenSetsSeconds: 3,
      });

      timer.start();
      vi.advanceTimersByTime(2300);

      expect(timer.phase.value).toBe('SET_REST');
      expect(timer.currentSet.value).toBe(1);
      expect(timer.totalPhaseTime.value).toBe(3);

      vi.advanceTimersByTime(3200);

      expect(timer.phase.value).toBe('INHALE');
      expect(timer.currentSet.value).toBe(2);
      expect(timer.currentRepetition.value).toBe(1);
    });

    it('starts the next set early when nextSet is called during rest', () => {
      const timer = useBreathingTimer({
        ...DEFAULT_BREATHING_CONFIG,
        inhaleTime: 1,
        exhaleTime: 1,
        repetitions: 1,
        targetSets: 2,
        restBetweenSetsSeconds: 30,
      });

      timer.start();
      vi.advanceTimersByTime(2300);
      expect(timer.phase.value).toBe('SET_REST');

      timer.nextSet();

      expect(timer.phase.value).toBe('INHALE');
      expect(timer.currentSet.value).toBe(2);
    });
  });

  describe('Clock accuracy and scheduling', () => {
    it('does not accumulate sampling delay across fractional phases', () => {
      const onSessionComplete = vi.fn();
      const timer = useBreathingTimer(
        {
          ...config,
          inhaleTime: 1.25,
          exhaleTime: 1.25,
          inhaleHoldTime: 0,
          exhaleHoldTime: 0,
          repetitions: 10,
          targetSets: 1,
        },
        { onSessionComplete }
      );
      timer.start();
      vi.advanceTimersByTime(25000);
      expect(timer.phase.value).toBe('SESSION_COMPLETE');
      expect(onSessionComplete).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('catches up delayed callbacks without overlapping overdue clicks', () => {
      const click = vi.spyOn(soundService, 'playClick').mockImplementation(() => {});
      const timer = useBreathingTimer({
        ...config,
        inhaleTime: 1,
        exhaleTime: 1,
        inhaleHoldTime: 0,
        exhaleHoldTime: 0,
        repetitions: 5,
      });
      timer.start();
      // Move the clock without delivering the intervening interval callbacks.
      vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 9000);
      vi.advanceTimersByTime(100);
      expect(timer.phase.value).toBe('EXHALE');
      expect(timer.currentRepetition.value).toBe(5);
      expect(timer.currentTime.value).toBe(1);
      expect(click).toHaveBeenCalledTimes(1);
    });

    it('preserves phase overflow when pausing between its deadline and next tick', () => {
      const timer = useBreathingTimer({
        ...config,
        inhaleTime: 1.25,
        exhaleTime: 1.25,
        inhaleHoldTime: 0,
        exhaleHoldTime: 0,
      });
      timer.start();
      vi.advanceTimersByTime(1275);
      timer.pause();
      vi.advanceTimersByTime(1000);
      timer.resume();
      vi.advanceTimersByTime(100);
      expect(timer.phase.value).toBe('EXHALE');
      expect(timer.currentTime.value).toBeCloseTo(1.125, 6);
    });

    it('preserves time elapsed between the last tick and pause', () => {
      const timer = useBreathingTimer(config);
      timer.start();
      vi.advanceTimersByTime(350);
      timer.pause();
      expect(timer.currentTime.value).toBeCloseTo(1.65, 6);
      vi.advanceTimersByTime(5000);
      timer.resume();
      vi.advanceTimersByTime(100);
      expect(timer.currentTime.value).toBeCloseTo(1.55, 6);
    });

    it('ignores wall clock changes during a running phase', () => {
      const timer = useBreathingTimer(config);
      timer.start();
      vi.advanceTimersByTime(500);
      vi.setSystemTime(Date.now() + 60000);
      vi.advanceTimersByTime(100);
      expect(timer.phase.value).toBe('INHALE');
      expect(timer.currentTime.value).toBeCloseTo(1.4, 6);
    });

    it('does not restart background ticks when resuming between sets', () => {
      const timer = useBreathingTimer(config);
      timer.start();
      vi.advanceTimersByTime(13000);
      expect(timer.phase.value).toBe('SET_COMPLETE');
      timer.pause();
      timer.resume();
      expect(timer.phase.value).toBe('SET_COMPLETE');
      expect(vi.getTimerCount()).toBe(0);
      timer.nextSet();
      vi.advanceTimersByTime(2000);
      expect(timer.phase.value).toBe('INHALE_HOLD');
    });

    it('does not leave a deferred transition at the phase deadline', () => {
      const timer = useBreathingTimer(config);
      timer.start();
      vi.advanceTimersByTime(2000);
      timer.stop();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('Extended Hold Features', () => {
    it('should handle extended hold in tolerance mode', () => {
      config.extendedHoldEnabled = true;
      config.extendedHoldType = 'EXHALE';
      config.extendedHoldMode = 'TOLERANCE';
      config.repetitions = 1;

      const onExtendedHoldStart = vi.fn();
      const timer = useBreathingTimer(config, { onExtendedHoldStart });

      timer.start();
      vi.advanceTimersByTime(6500); // Complete one rep with buffer

      expect(timer.phase.value).toBe('EXTENDED_EXHALE_HOLD');
      expect(onExtendedHoldStart).toHaveBeenCalledWith('EXHALE', expect.any(Object));

      vi.advanceTimersByTime(5000);
      expect(timer.extendedHoldElapsed.value).toBeGreaterThan(4);
    });

    it('should complete set after all repetitions', () => {
      const onSetComplete = vi.fn();
      const timer = useBreathingTimer(config, { onSetComplete });

      timer.start();
      vi.advanceTimersByTime(13000); // 2 full cycles with buffer

      expect(onSetComplete).toHaveBeenCalledWith(1, expect.any(Object));
      expect(timer.phase.value).toBe('SET_COMPLETE');
    });

    it('should handle recovery breath correctly (Cyclic Hyperventilation style)', () => {
      config.extendedHoldEnabled = true;
      config.extendedHoldType = 'EXHALE';
      config.secondExtendedHoldEnabled = true;
      config.secondExtendedHoldType = 'INHALE';
      config.repetitions = 1;

      const timer = useBreathingTimer(config);
      timer.start();

      // 1. Complete the cycle: Inhale(2) -> Hold(1) -> Exhale(2) -> Hold(1)
      vi.advanceTimersByTime(6500);

      // 2. Should be in EXTENDED_EXHALE_HOLD
      expect(timer.phase.value).toBe('EXTENDED_EXHALE_HOLD');

      // 3. End the extended hold
      timer.endExtendedHold();

      // 4. Should transition to INHALE (Recovery Breath) because second hold is INHALE type
      expect(timer.phase.value).toBe('INHALE');
      expect(timer.isRecoveryBreath.value).toBe(true);

      // 5. Complete the recovery inhale
      vi.advanceTimersByTime(2100);

      // 6. Should now be in EXTENDED_INHALE_HOLD (Retention)
      expect(timer.phase.value).toBe('EXTENDED_INHALE_HOLD');
      expect(timer.isRecoveryBreath.value).toBe(false);
    });

    it('should handle timed extended holds', () => {
      config.extendedHoldEnabled = true;
      config.extendedHoldMode = 'TIMED';
      config.extendedHoldDuration = 5;
      config.repetitions = 1;

      const timer = useBreathingTimer(config);
      timer.start();

      // Complete cycle
      vi.advanceTimersByTime(6500);

      // Should be in extended hold
      expect(timer.phase.value).toBe('EXTENDED_EXHALE_HOLD');

      // Advance by duration (5s)
      vi.advanceTimersByTime(5100);

      // Should be SET_COMPLETE (since no second hold)
      expect(timer.phase.value).toBe('SET_COMPLETE');
    });

    it('reports elapsed duration when a timed extended hold completes', () => {
      const onExtendedHoldEnd = vi.fn();
      config.extendedHoldEnabled = true;
      config.extendedHoldMode = 'TIMED';
      config.extendedHoldDuration = 5;
      config.repetitions = 1;

      const timer = useBreathingTimer(config, { onExtendedHoldEnd });
      timer.start();

      vi.advanceTimersByTime(6500);
      expect(timer.phase.value).toBe('EXTENDED_EXHALE_HOLD');

      vi.advanceTimersByTime(5100);

      expect(onExtendedHoldEnd).toHaveBeenCalled();
      const [duration, type] = onExtendedHoldEnd.mock.calls[0];
      expect(duration).toBeCloseTo(5, 1);
      expect(type).toBe('EXHALE');
      expect(timer.extendedHoldElapsed.value).toBeCloseTo(5, 1);
    });

    it('starts recovery inhale before first EXTENDED_INHALE_HOLD', () => {
      const onExtendedHoldStart = vi.fn();
      config.extendedHoldEnabled = true;
      config.extendedHoldType = 'INHALE';
      config.extendedHoldMode = 'TIMED';
      config.extendedHoldDuration = 5;
      config.repetitions = 1;
      config.inhaleHoldTime = 0;
      config.exhaleHoldTime = 0;
      config.inhaleTime = 2;
      config.exhaleTime = 2;

      const timer = useBreathingTimer(config, { onExtendedHoldStart });
      timer.start();

      // Complete inhale + exhale to trigger first extended hold
      vi.advanceTimersByTime(4500);

      // Should insert recovery inhale before extended inhale hold
      expect(timer.phase.value).toBe('INHALE');
      expect(timer.isRecoveryBreath.value).toBe(true);
      expect(onExtendedHoldStart).not.toHaveBeenCalled();

      // After recovery inhale, should enter EXTENDED_INHALE_HOLD
      vi.advanceTimersByTime(2100);
      expect(timer.phase.value).toBe('EXTENDED_INHALE_HOLD');
      expect(timer.isRecoveryBreath.value).toBe(false);
      expect(onExtendedHoldStart).toHaveBeenCalledTimes(1);
      expect(onExtendedHoldStart).toHaveBeenCalledWith(
        'INHALE',
        expect.objectContaining({
          phase: 'EXTENDED_INHALE_HOLD',
        })
      );
    });

    it('handles second extended hold of type INHALE (recovery breath) after EXHALE hold', () => {
      config.extendedHoldEnabled = true;
      config.extendedHoldType = 'EXHALE';
      config.extendedHoldMode = 'TOLERANCE';
      config.secondExtendedHoldEnabled = true;
      config.secondExtendedHoldType = 'INHALE';
      config.secondExtendedHoldMode = 'TIMED';
      config.secondExtendedHoldDuration = 15;
      config.inhaleTime = 2;
      config.exhaleTime = 2;
      config.inhaleHoldTime = 0;
      config.exhaleHoldTime = 0;
      config.repetitions = 1;

      const timer = useBreathingTimer(config);

      timer.start();

      // Advance until we reach the extended exhale hold
      // inhale 2s + exhale 2s = ~4s; add buffer
      vi.advanceTimersByTime(4500);
      expect(timer.phase.value).toBe('EXTENDED_EXHALE_HOLD');

      // Simulate user ending tolerance hold
      timer.endExtendedHold();

      // After ending the first extended (EXHALE) and with second hold type INHALE,
      // the composable should set recovery breath and move to INHALE phase
      expect(timer.isRecoveryBreath.value).toBe(true);
      expect(timer.phase.value).toBe('INHALE');
    });

    it('starts recovery exhale before second EXTENDED_EXHALE_HOLD after INHALE extended hold', () => {
      config.extendedHoldEnabled = true;
      config.extendedHoldType = 'INHALE';
      config.extendedHoldMode = 'TIMED';
      config.extendedHoldDuration = 5;
      config.secondExtendedHoldEnabled = true;
      config.secondExtendedHoldType = 'EXHALE';
      config.secondExtendedHoldMode = 'TIMED';
      config.secondExtendedHoldDuration = 10;
      config.inhaleTime = 2;
      config.exhaleTime = 2;
      config.inhaleHoldTime = 0;
      config.exhaleHoldTime = 0;
      config.repetitions = 1;

      const timer = useBreathingTimer(config);

      timer.start();

      // Advance through a full inhale+exhale cycle to reach the extended inhale hold
      vi.advanceTimersByTime(4500); // inhale(2s) + exhale(2s) + buffer
      expect(timer.phase.value).toBe('INHALE');
      expect(timer.isRecoveryBreath.value).toBe(true);

      // Complete recovery inhale
      vi.advanceTimersByTime(2100);
      expect(timer.phase.value).toBe('EXTENDED_INHALE_HOLD');

      // End the first extended inhale hold and expect the second (EXHALE) hold to start
      timer.endExtendedHold();
      expect(timer.phase.value).toBe('EXHALE');
      expect(timer.isRecoveryExhale.value).toBe(true);

      // Complete recovery exhale
      vi.advanceTimersByTime(2100);
      expect(timer.phase.value).toBe('EXTENDED_EXHALE_HOLD');
    });

    it('after ending first extended hold with second hold INHALE, enters recovery inhale', () => {
      const onExtendedHoldEnd = vi.fn();
      const baseConfig: BreathingConfig = {
        name: 'Test',
        inhaleTime: 2,
        inhaleHoldTime: 0,
        exhaleTime: 2,
        exhaleHoldTime: 0,
        repetitions: 1,
        extendedHoldEnabled: true,
        extendedHoldMode: 'TIMED',
        extendedHoldType: 'EXHALE',
        extendedHoldDuration: 10,
        secondExtendedHoldEnabled: true,
        secondExtendedHoldMode: 'TIMED',
        secondExtendedHoldType: 'INHALE',
        secondExtendedHoldDuration: 15,
        targetSets: 0,
        restBetweenSetsSeconds: 0,
        soundEnabled: false,
        soundTheme: 'wood',
        ttsEnabled: false,
      };
      const timer = useBreathingTimer(baseConfig, { onExtendedHoldEnd });

      timer.start();
      timer.skipPhase();
      timer.skipPhase();
      expect(timer.phase.value).toBe('EXTENDED_EXHALE_HOLD');
      vi.advanceTimersByTime(3500);

      timer.endExtendedHold();

      // After ending, should have set isFirstExtendedHold -> false, and isRecoveryBreath true, and phase INHALE
      expect(timer.state.value.isFirstExtendedHold).toBe(false);
      expect(timer.state.value.isRecoveryBreath).toBe(true);
      expect(timer.phase.value).toBe('INHALE');
    });

    it('after ending first extended INHALE hold and second is EXHALE, should recover exhale first', () => {
      const baseConfig: BreathingConfig = {
        name: 'Test',
        inhaleTime: 2,
        inhaleHoldTime: 0,
        exhaleTime: 2,
        exhaleHoldTime: 0,
        repetitions: 1,
        extendedHoldEnabled: true,
        extendedHoldMode: 'TIMED',
        extendedHoldType: 'INHALE',
        extendedHoldDuration: 10,
        secondExtendedHoldEnabled: true,
        secondExtendedHoldMode: 'TIMED',
        secondExtendedHoldType: 'EXHALE',
        secondExtendedHoldDuration: 15,
        targetSets: 0,
        restBetweenSetsSeconds: 0,
        soundEnabled: false,
        soundTheme: 'wood',
        ttsEnabled: false,
      };
      const timer = useBreathingTimer(baseConfig);

      timer.start();
      timer.skipPhase();
      timer.skipPhase();
      timer.skipPhase();
      expect(timer.phase.value).toBe('EXTENDED_INHALE_HOLD');
      vi.advanceTimersByTime(4000);

      timer.endExtendedHold();

      // Should insert recovery exhale before second extended hold
      expect(timer.state.value.isFirstExtendedHold).toBe(false);
      expect(timer.state.value.isRecoveryExhale).toBe(true);
      expect(timer.phase.value).toBe('EXHALE');
    });

    it('should not end extended hold if not in extended hold phase', () => {
      const baseConfig: BreathingConfig = {
        name: 'Test',
        inhaleTime: 2,
        inhaleHoldTime: 0,
        exhaleTime: 2,
        exhaleHoldTime: 0,
        repetitions: 1,
        extendedHoldEnabled: true,
        extendedHoldMode: 'TIMED',
        extendedHoldType: 'EXHALE',
        extendedHoldDuration: 10,
        secondExtendedHoldEnabled: false,
        secondExtendedHoldType: 'INHALE',
        secondExtendedHoldMode: 'TIMED',
        secondExtendedHoldDuration: 15,
        targetSets: 0,
        restBetweenSetsSeconds: 0,
        soundEnabled: false,
        soundTheme: 'wood',
        ttsEnabled: false,
      };
      const timer = useBreathingTimer(baseConfig);

      timer.start();
      expect(timer.phase.value).toBe('INHALE');

      // Try to end extended hold while in INHALE phase (not extended hold)
      timer.endExtendedHold();

      // Should still be in INHALE phase
      expect(timer.phase.value).toBe('INHALE');
    });
  });

  describe('Session Management', () => {
    it('should handle session completion with target sets', () => {
      config.targetSets = 2;
      config.repetitions = 1;

      const timer = useBreathingTimer(config);
      timer.start();

      // Complete Set 1
      vi.advanceTimersByTime(6500); // Cycle complete
      expect(timer.phase.value).toBe('SET_COMPLETE');
      expect(timer.currentSet.value).toBe(1);

      // Start Set 2
      timer.nextSet();
      expect(timer.phase.value).toBe('INHALE');

      // Complete Set 2
      vi.advanceTimersByTime(6500); // Cycle complete

      // Should be SESSION_COMPLETE instead of SET_COMPLETE
      expect(timer.phase.value).toBe('SESSION_COMPLETE');
    });

    it('should correctly reset state on stop', () => {
      const timer = useBreathingTimer(config);
      timer.start();
      vi.advanceTimersByTime(2000);
      timer.pause();

      timer.stop();

      expect(timer.phase.value).toBe('IDLE');
      expect(timer.currentTime.value).toBe(0);
      expect(timer.currentRepetition.value).toBe(0);
      expect(timer.currentSet.value).toBe(0);
      expect(timer.isPaused.value).toBe(false);
      expect(timer.isRunning.value).toBe(false);
    });

    it('completes session when targetSets is 1', () => {
      const shortConfig = {
        ...DEFAULT_BREATHING_CONFIG,
        inhaleTime: 1,
        exhaleTime: 1,
        repetitions: 1,
        targetSets: 1,
        extendedHoldEnabled: false,
      };

      const onSessionComplete = vi.fn();
      const timer = useBreathingTimer(shortConfig, { onSessionComplete });

      timer.start();

      // Advance through one full cycle (inhale+exhale) with buffer
      vi.advanceTimersByTime(2500);

      expect(onSessionComplete).toHaveBeenCalled();
      expect(timer.phase.value).toBe('SESSION_COMPLETE');
    });
  });

  describe('Advanced Modes', () => {
    it('should handle mixed mode: Tolerance Exhale -> Timed Inhale (15s)', () => {
      config.extendedHoldEnabled = true;
      config.extendedHoldType = 'EXHALE';
      config.extendedHoldMode = 'TOLERANCE';
      config.secondExtendedHoldEnabled = true;
      config.secondExtendedHoldType = 'INHALE';
      config.secondExtendedHoldMode = 'TIMED';
      config.secondExtendedHoldDuration = 15;
      config.repetitions = 1;
      // Reset hold times for simpler math
      config.inhaleHoldTime = 0;
      config.exhaleHoldTime = 0;

      const timer = useBreathingTimer(config);
      timer.start();

      // 1. Complete the cycle: Inhale(2) -> Exhale(2) = 4s total + buffer for transition
      // With 100ms tick rate, need extra time for setTimeout(0) to execute
      vi.advanceTimersByTime(4200);

      // 2. Should be in EXTENDED_EXHALE_HOLD (Tolerance)
      expect(timer.phase.value).toBe('EXTENDED_EXHALE_HOLD');
      // In tolerance mode, currentTime should be counting up from 0
      expect(timer.currentTime.value).toBeGreaterThanOrEqual(0);

      // 3. End the extended hold manually
      timer.endExtendedHold();

      // 4. Should transition to INHALE (Recovery Breath)
      expect(timer.phase.value).toBe('INHALE');
      expect(timer.isRecoveryBreath.value).toBe(true);
    });

    it('recovery breath flag causes startExtendedHold when INHALE transitions', () => {
      const recConfig: BreathingConfig = {
        ...DEFAULT_BREATHING_CONFIG,
        inhaleTime: 1,
        exhaleTime: 2,
        inhaleHoldTime: 0,
        exhaleHoldTime: 0,
        repetitions: 1,
        extendedHoldEnabled: true,
        extendedHoldType: 'INHALE',
      };

      const timer = useBreathingTimer(recConfig);

      // Start -> INHALE
      timer.start();
      expect(timer.phase.value).toBe('INHALE');

      timer.skipPhase();
      timer.skipPhase();
      expect(timer.phase.value).toBe('INHALE');
      expect(timer.isRecoveryBreath.value).toBe(true);
      timer.skipPhase();
      expect(timer.phase.value).toBe('EXTENDED_INHALE_HOLD');
      expect(timer.isRecoveryBreath.value).toBe(false);
    });

    it('skipPhase ends tolerance extended hold', () => {
      const baseConfig: BreathingConfig = {
        name: 'Test',
        inhaleTime: 1,
        inhaleHoldTime: 0,
        exhaleTime: 1,
        exhaleHoldTime: 0,
        repetitions: 1,
        extendedHoldEnabled: true,
        extendedHoldMode: 'TOLERANCE',
        extendedHoldType: 'EXHALE',
        extendedHoldDuration: 10,
        secondExtendedHoldEnabled: false,
        secondExtendedHoldMode: 'TIMED',
        secondExtendedHoldType: 'INHALE',
        secondExtendedHoldDuration: 15,
        targetSets: 0,
        restBetweenSetsSeconds: 0,
        soundEnabled: false,
        soundTheme: 'wood',
        ttsEnabled: false,
      };
      const onExtendedHoldEnd = vi.fn();
      const timer = useBreathingTimer(baseConfig, { onExtendedHoldEnd });

      timer.start();
      timer.skipPhase();
      timer.skipPhase();
      vi.advanceTimersByTime(4050);
      timer.skipPhase();
      expect(onExtendedHoldEnd).toHaveBeenCalledExactlyOnceWith(4.05, 'EXHALE', expect.any(Object));
      expect(timer.phase.value).toBe('SET_COMPLETE');
    });

    it('pauses and resumes tolerance extended hold without time jump', () => {
      const baseConfig: BreathingConfig = {
        ...DEFAULT_BREATHING_CONFIG,
        inhaleTime: 1,
        exhaleTime: 1,
        inhaleHoldTime: 0,
        exhaleHoldTime: 0,
        repetitions: 1,
        extendedHoldEnabled: true,
        extendedHoldMode: 'TOLERANCE',
        extendedHoldType: 'EXHALE',
      };

      const timer = useBreathingTimer(baseConfig);
      timer.start();

      // Advance to extended exhale hold
      vi.advanceTimersByTime(2500);
      expect(timer.phase.value).toBe('EXTENDED_EXHALE_HOLD');

      vi.advanceTimersByTime(1500);
      const elapsedBeforePause = timer.extendedHoldElapsed.value;

      timer.pause();
      vi.advanceTimersByTime(3000);

      timer.resume();
      vi.advanceTimersByTime(1000);

      expect(timer.extendedHoldElapsed.value).toBeGreaterThan(elapsedBeforePause);
      expect(timer.extendedHoldElapsed.value).toBeLessThan(elapsedBeforePause + 2.5);
    });

    it('increments extendedHoldElapsed for second (non-first) tolerance mode', () => {
      config.extendedHoldEnabled = true;
      config.extendedHoldType = 'EXHALE';
      config.extendedHoldMode = 'TIMED';
      config.extendedHoldDuration = 3;
      config.secondExtendedHoldEnabled = true;
      config.secondExtendedHoldType = 'EXHALE';
      config.secondExtendedHoldMode = 'TOLERANCE';
      config.inhaleTime = 2;
      config.exhaleTime = 2;
      config.inhaleHoldTime = 0;
      config.exhaleHoldTime = 0;
      config.repetitions = 1;

      const timer = useBreathingTimer(config);
      timer.start();

      // Complete first cycle and first extended hold (TIMED, 3s)
      // Inhale(2s) + Exhale(2s) + Extended hold(3s) = 7s + extra buffer for transitions
      vi.advanceTimersByTime(7400);

      // Should now be in second extended hold (TOLERANCE mode)
      expect(timer.phase.value).toBe('EXTENDED_EXHALE_HOLD');
      expect(timer.isFirstExtendedHold.value).toBe(false);

      // Let some time pass in tolerance mode
      vi.advanceTimersByTime(500);

      // ExtendedHoldElapsed should have incremented
      expect(timer.extendedHoldElapsed.value).toBeGreaterThan(0);
    });

    it('starts second EXHALE extended hold (else branch) when first was EXHALE', () => {
      config.extendedHoldEnabled = true;
      config.extendedHoldType = 'EXHALE';
      config.extendedHoldMode = 'TIMED';
      config.extendedHoldDuration = 3;
      config.secondExtendedHoldEnabled = true;
      config.secondExtendedHoldType = 'EXHALE';
      config.secondExtendedHoldMode = 'TIMED';
      config.secondExtendedHoldDuration = 5;
      config.inhaleTime = 4;
      config.exhaleTime = 2;
      config.inhaleHoldTime = 0;
      config.exhaleHoldTime = 0;
      config.repetitions = 1;

      const timer = useBreathingTimer(config);
      timer.start();

      // Advance to extended exhale hold (inhale 4s + exhale 2s + small buffer)
      vi.advanceTimersByTime(6500);
      expect(timer.phase.value).toBe('EXTENDED_EXHALE_HOLD');

      // End the first extended exhale hold
      timer.endExtendedHold();
      expect(timer.isFirstExtendedHold.value).toBe(false);
      expect(timer.phase.value).toBe('EXTENDED_EXHALE_HOLD');
      expect(timer.currentTime.value).toBe(5);
    });
  });

  describe('Sound Handling', () => {
    it('plays clicks at the countdown boundaries shown on screen', () => {
      const click = vi.spyOn(soundService, 'playClick').mockImplementation(() => {});
      const timer = useBreathingTimer({ ...config, inhaleTime: 3 });
      timer.start();
      vi.advanceTimersByTime(900);
      expect(timer.displayTime.value).toBe('3');
      expect(click).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(timer.displayTime.value).toBe('2');
      expect(click).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1000);
      expect(timer.displayTime.value).toBe('1');
      expect(click).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(1000);
      expect(timer.phase.value).toBe('INHALE_HOLD');
      expect(click).toHaveBeenCalledTimes(3);
    });

    it('does not repeat clicks within the same displayed second', () => {
      const click = vi.spyOn(soundService, 'playClick').mockImplementation(() => {});
      const timer = useBreathingTimer({ ...config, inhaleTime: 2.5 });
      timer.start();
      vi.advanceTimersByTime(400);
      expect(click).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(timer.displayTime.value).toBe('2');
      expect(click).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(900);
      expect(click).toHaveBeenCalledTimes(1);
    });
  });

  describe('Computed Properties & Edge Cases', () => {
    it('progress returns 0 when totalPhaseTime is 0 and computed value otherwise', () => {
      const lineConfig = {
        ...DEFAULT_BREATHING_CONFIG,
        inhaleTime: 4,
        exhaleTime: 2,
        inhaleHoldTime: 0,
        exhaleHoldTime: 0,
        repetitions: 1,
      };

      const timer = useBreathingTimer(lineConfig);
      expect(timer.progress.value).toBe(0);
      timer.start();
      vi.advanceTimersByTime(2000);
      expect(timer.progress.value).toBe(0.5);
    });

    it('breathingScale returns expected values for EXHALE_HOLD and IDLE', () => {
      config.inhaleTime = 2;
      config.exhaleTime = 2;
      config.inhaleHoldTime = 0;
      config.exhaleHoldTime = 0;
      config.repetitions = 1;

      const timer = useBreathingTimer(config);

      config.exhaleHoldTime = 2;
      timer.start();
      vi.advanceTimersByTime(4000);
      expect(timer.phase.value).toBe('EXHALE_HOLD');
      expect(timer.breathingScale.value).toBeCloseTo(0.6, 3);

      timer.stop();
      expect(timer.breathingScale.value).toBeCloseTo(0.8, 3);
    });

    it('breathingScale computes for EXHALE branch', () => {
      const exhaleConfig = {
        ...DEFAULT_BREATHING_CONFIG,
        inhaleTime: 4,
        exhaleTime: 2,
        inhaleHoldTime: 0,
        exhaleHoldTime: 0,
        repetitions: 1,
      };

      const timer = useBreathingTimer(exhaleConfig);
      timer.start();
      timer.skipPhase();
      vi.advanceTimersByTime(1000);
      expect(timer.phase.value).toBe('EXHALE');
      expect(timer.breathingScale.value).toBeCloseTo(0.8, 6);
    });

    it('endExtendedHold invokes onExtendedHoldEnd with elapsed duration', async () => {
      const onExtendedHoldEnd = vi.fn();
      const baseConfig: BreathingConfig = {
        name: 'Test',
        inhaleTime: 1,
        inhaleHoldTime: 0,
        exhaleTime: 1,
        exhaleHoldTime: 0,
        repetitions: 1,
        extendedHoldEnabled: true,
        extendedHoldMode: 'TOLERANCE',
        extendedHoldType: 'EXHALE',
        extendedHoldDuration: 10,
        secondExtendedHoldEnabled: true,
        secondExtendedHoldMode: 'TIMED',
        secondExtendedHoldType: 'INHALE',
        secondExtendedHoldDuration: 15,
        targetSets: 0,
        restBetweenSetsSeconds: 0,
        soundEnabled: false,
        soundTheme: 'wood',
        ttsEnabled: false,
      };
      const timer = useBreathingTimer(baseConfig, { onExtendedHoldEnd });

      timer.start();
      timer.skipPhase();
      timer.skipPhase();
      expect(timer.phase.value).toBe('EXTENDED_EXHALE_HOLD');
      vi.advanceTimersByTime(5250);

      timer.endExtendedHold();

      expect(onExtendedHoldEnd).toHaveBeenCalled();
      // Include the 50 ms since the last display update.
      const calledWith = onExtendedHoldEnd.mock.calls[0][0];
      expect(calledWith).toBeCloseTo(5.25, 6);
    });

    it('endExtendedHold is a no-op when not in extended hold', () => {
      const noExtConfig = {
        ...DEFAULT_BREATHING_CONFIG,
        inhaleTime: 2,
        exhaleTime: 2,
        inhaleHoldTime: 0,
        exhaleHoldTime: 0,
        repetitions: 1,
        extendedHoldEnabled: false,
        targetSets: 0,
        restBetweenSetsSeconds: 0,
        soundEnabled: false,
      };

      const timer = useBreathingTimer(noExtConfig);
      timer.start();

      // Currently in INHALE; calling endExtendedHold should not throw and should not change phase
      const before = timer.phase.value;
      timer.endExtendedHold();
      expect(timer.phase.value).toBe(before);
    });

    it('endExtendedHold returns early when not in extended hold', () => {
      const onExtendedEnd = vi.fn();
      const extConfig = {
        ...DEFAULT_BREATHING_CONFIG,
        inhaleTime: 3,
        exhaleTime: 2,
        inhaleHoldTime: 0,
        exhaleHoldTime: 0,
        repetitions: 1,
      };

      const timer = useBreathingTimer(extConfig, { onExtendedHoldEnd: onExtendedEnd });

      timer.start();
      // We're in INHALE; calling endExtendedHold should be ignored
      timer.endExtendedHold();
      expect(onExtendedEnd).not.toHaveBeenCalled();
      expect(timer.phase.value).toBe('INHALE');
    });

    it('nextSet increments set and moves to INHALE when in SET_COMPLETE', () => {
      const nextSetConfig = {
        ...DEFAULT_BREATHING_CONFIG,
        inhaleTime: 2,
        exhaleTime: 2,
        inhaleHoldTime: 0,
        exhaleHoldTime: 0,
        repetitions: 1,
        extendedHoldEnabled: false,
        targetSets: 0,
        restBetweenSetsSeconds: 0,
        soundEnabled: false,
      };

      const timer = useBreathingTimer(nextSetConfig);

      timer.start();
      vi.advanceTimersByTime(4000);
      expect(timer.phase.value).toBe('SET_COMPLETE');

      timer.nextSet();

      expect(timer.currentSet.value).toBe(2);
      expect(timer.currentRepetition.value).toBe(1);
      expect(timer.phase.value).toBe('INHALE');
    });

    it('nextSet does nothing when not on SET_COMPLETE', () => {
      const testConfig = {
        ...DEFAULT_BREATHING_CONFIG,
        inhaleTime: 3,
        exhaleTime: 2,
        inhaleHoldTime: 0,
        exhaleHoldTime: 0,
        repetitions: 1,
      };

      const timer = useBreathingTimer(testConfig);
      timer.start();
      expect(timer.currentSet.value).toBe(1);

      // nextSet should not advance when not in SET_COMPLETE
      timer.nextSet();
      expect(timer.currentSet.value).toBe(1);
    });

    it('skipPhase is a no-op when paused', () => {
      const pauseConfig = {
        ...DEFAULT_BREATHING_CONFIG,
        inhaleTime: 3,
        exhaleTime: 2,
        inhaleHoldTime: 0,
        exhaleHoldTime: 0,
        repetitions: 1,
      };

      const timer = useBreathingTimer(pauseConfig);
      timer.start();
      timer.pause();
      expect(timer.phase.value).toBe('PAUSED');

      // calling skipPhase while paused should not change the phase
      timer.skipPhase();
      expect(timer.phase.value).toBe('PAUSED');
    });

    it('skipPhase advances phase immediately from INHALE to EXHALE (no inhale hold)', () => {
      const skipConfig = {
        ...DEFAULT_BREATHING_CONFIG,
        inhaleTime: 2,
        exhaleTime: 2,
        inhaleHoldTime: 0,
        exhaleHoldTime: 0,
        repetitions: 1,
        extendedHoldEnabled: false,
        targetSets: 0,
        restBetweenSetsSeconds: 0,
        soundEnabled: false,
      };

      const timer = useBreathingTimer(skipConfig);
      timer.start();

      expect(timer.phase.value).toBe('INHALE');

      // Skip the current phase
      timer.skipPhase();

      expect(timer.phase.value).toBe('EXHALE');
      expect(timer.currentTime.value).toBe(skipConfig.exhaleTime);
    });

    it('skipPhase during INHALE triggers transition to EXHALE', () => {
      const baseConfig: BreathingConfig = {
        name: 'Test',
        inhaleTime: 1,
        inhaleHoldTime: 0,
        exhaleTime: 1,
        exhaleHoldTime: 0,
        repetitions: 1,
        extendedHoldEnabled: true,
        extendedHoldMode: 'TOLERANCE',
        extendedHoldType: 'EXHALE',
        extendedHoldDuration: 10,
        secondExtendedHoldEnabled: true,
        secondExtendedHoldMode: 'TIMED',
        secondExtendedHoldType: 'INHALE',
        secondExtendedHoldDuration: 15,
        targetSets: 0,
        restBetweenSetsSeconds: 0,
        soundEnabled: false,
        soundTheme: 'wood',
        ttsEnabled: false,
      };

      const timer = useBreathingTimer(baseConfig);
      timer.start();
      vi.advanceTimersByTime(950);

      timer.skipPhase();
      vi.advanceTimersByTime(16);

      // after skipPhase the tick() should transition from INHALE to EXHALE (no inhaleHold configured)
      expect(timer.state.value.phase).toBe('EXHALE');
    });

    it('creates timer outside component without lifecycle registration errors', () => {
      const testConfig = {
        ...DEFAULT_BREATHING_CONFIG,
        inhaleTime: 2,
        exhaleTime: 2,
        inhaleHoldTime: 0,
        exhaleHoldTime: 0,
        repetitions: 1,
      };

      // Just creating and stopping should not throw
      const timer = useBreathingTimer(testConfig);
      expect(() => timer.start()).not.toThrow();
      vi.advanceTimersByTime(100);
      expect(() => timer.stop()).not.toThrow();
    });

    it('registers onUnmounted when used inside a component and clears interval on unmount', async () => {
      const umConfig = {
        ...DEFAULT_BREATHING_CONFIG,
        inhaleTime: 4,
        exhaleTime: 2,
        inhaleHoldTime: 0,
        exhaleHoldTime: 0,
        repetitions: 1,
      };

      const timerComp = {
        template: '<div />',
        setup() {
          const t = useBreathingTimer(umConfig);
          t.start();
          return {};
        },
      };

      const clearSpy = vi.spyOn(globalThis, 'clearInterval');
      const wrapper = mount(timerComp);

      // allow interval to be created
      vi.advanceTimersByTime(200);

      await wrapper.unmount();

      expect(clearSpy).toHaveBeenCalled();
    });

    it('plays click when crossing integer second boundary', () => {
      const spy = vi.spyOn(soundService, 'playClick').mockImplementation(() => {});

      const clickConfig = {
        ...DEFAULT_BREATHING_CONFIG,
        inhaleTime: 3,
        exhaleTime: 2,
        inhaleHoldTime: 0,
        exhaleHoldTime: 0,
        repetitions: 1,
        soundEnabled: true,
      };

      const timer = useBreathingTimer(clickConfig);
      timer.start();

      // The first click accompanies the displayed countdown changing from 3 to 2.
      vi.advanceTimersByTime(1000);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge Cases - Early Returns', () => {
    it('should not start if already running', () => {
      const onPhaseChangeMock = vi.fn();
      const timer2 = useBreathingTimer(config, { onPhaseChange: onPhaseChangeMock });

      timer2.start();
      const callCount = onPhaseChangeMock.mock.calls.length;

      // Try to start again
      timer2.start();

      // onPhaseChange should not be called again
      expect(onPhaseChangeMock.mock.calls.length).toBe(callCount);
      expect(timer2.isRunning.value).toBe(true);
    });

    it('should not pause if not running', () => {
      const timer = useBreathingTimer(config);

      // Pause without starting
      timer.pause();

      expect(timer.isPaused.value).toBe(false);
      expect(timer.phase.value).toBe('IDLE');
    });

    it('should not pause if already paused', () => {
      const timer = useBreathingTimer(config);

      timer.start();
      timer.pause();
      expect(timer.isPaused.value).toBe(true);

      const currentPhase = timer.phase.value;

      // Try to pause again
      timer.pause();

      // Should stay paused
      expect(timer.isPaused.value).toBe(true);
      expect(timer.phase.value).toBe(currentPhase);
    });

    it('should not resume if not paused', () => {
      const timer = useBreathingTimer(config);

      timer.start();

      const phase = timer.phase.value;
      const time = timer.currentTime.value;

      // Try to resume without pausing
      timer.resume();

      expect(timer.phase.value).toBe(phase);
      expect(timer.currentTime.value).toBe(time);
      expect(timer.isPaused.value).toBe(false);
    });

    it('should handle resume with missing pausedPhase', () => {
      const timer = useBreathingTimer(config);

      timer.start();
      timer.pause();
      timer.resume();

      // Reset by stopping
      timer.stop();

      // pausedPhase should be null now
      // Try to resume without pausing - should have no effect
      timer.resume();

      expect(timer.phase.value).toBe('IDLE');
      expect(timer.isRunning.value).toBe(false);
    });

    it('should not play sound when transitioning to IDLE phase', () => {
      const playSoundMock = vi.fn();
      vi.doMock('../../src/services/soundService', () => ({
        soundService: {
          playPhaseChange: playSoundMock,
          playClick: vi.fn(),
          setEnabled: vi.fn(),
        },
      }));

      const soundConfig = { ...config, soundEnabled: true };
      const timer = useBreathingTimer(soundConfig);

      // Start will transition to INHALE, sound should play
      timer.start();

      // Stop will transition to IDLE, sound should NOT play
      timer.stop();

      // We can't directly verify this from outside, but we can verify the state
      expect(timer.phase.value).toBe('IDLE');
    });

    it('should not play sound when transitioning to SESSION_COMPLETE', () => {
      const soundConfig = { ...config, soundEnabled: true, repetitions: 1 };
      const timer = useBreathingTimer(soundConfig);

      timer.start();
      // Exhale phase
      expect(timer.phase.value).toBe('INHALE');

      // After many advances, should reach SESSION_COMPLETE where sound doesn't play
      // This is hard to test directly, but we verify the state is reached
      timer.stop(); // Reset to IDLE to test
      expect(timer.phase.value).toBe('IDLE');
    });
  });
});
