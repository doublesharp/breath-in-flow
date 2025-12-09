import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BreathingTimer,
  formatTime,
  formatTimeSimple,
  calculateTotalCycleTime,
  calculateSetTime,
} from '../src/timer';
import { BreathingConfig, DEFAULT_BREATHING_CONFIG } from '../src/schemas';

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
    vi.useRealTimers();
  });

  describe('start()', () => {
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

      expect(timer.getState().phase).toBe('EXTENDED_INHALE_HOLD');
    });
  });

  describe('second extended hold', () => {
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

      // Should start breathing cycle for second hold
      expect(timer.getState().phase).toBe('INHALE');

      vi.advanceTimersByTime(6500); // Complete cycle

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
});

describe('formatTime', () => {
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
