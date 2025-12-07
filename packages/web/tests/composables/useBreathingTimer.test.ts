import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useBreathingTimer } from '../../src/composables/useBreathingTimer';
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
  });

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

    vi.advanceTimersByTime(2100);
    expect(timer.phase.value).toBe('INHALE_HOLD');

    vi.advanceTimersByTime(1100);
    expect(timer.phase.value).toBe('EXHALE');

    vi.advanceTimersByTime(2100);
    expect(timer.phase.value).toBe('EXHALE_HOLD');
  });

  it('should pause and resume', () => {
    const timer = useBreathingTimer(config);

    timer.start();
    vi.advanceTimersByTime(500);

    timer.pause();
    expect(timer.isPaused.value).toBe(true);
    expect(timer.phase.value).toBe('PAUSED');

    const timeBeforePause = timer.currentTime.value;
    vi.advanceTimersByTime(2000);

    timer.resume();
    expect(timer.isPaused.value).toBe(false);
    expect(timer.phase.value).toBe('INHALE');
    expect(timer.currentTime.value).toBe(timeBeforePause);
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

  it('should calculate breathing scale correctly', () => {
    const timer = useBreathingTimer(config);

    timer.start();

    // At start of inhale (scale should be around 0.6)
    expect(timer.breathingScale.value).toBeCloseTo(0.6, 1);

    // After full inhale
    vi.advanceTimersByTime(2000);
    // Now in INHALE_HOLD, scale should be 1.0
    expect(timer.breathingScale.value).toBe(1.0);
  });

  it('should format display time correctly', () => {
    const timer = useBreathingTimer(config);

    timer.start();

    expect(timer.displayTime.value).toMatch(/^\d+\.\d$/);
  });

  it('should skip phase when skipPhase is called', () => {
    const timer = useBreathingTimer(config);

    timer.start();
    expect(timer.phase.value).toBe('INHALE');

    timer.skipPhase();
    expect(timer.phase.value).toBe('INHALE_HOLD');
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
});
