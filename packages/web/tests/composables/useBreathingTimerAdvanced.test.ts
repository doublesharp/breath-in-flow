import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useBreathingTimer } from '../../src/composables/useBreathingTimer';
import type { BreathingConfig } from '@breath-in-flow/shared';
import { DEFAULT_BREATHING_CONFIG } from '@breath-in-flow/shared';

describe('useBreathingTimer Advanced Scenarios', () => {
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
      repetitions: 1,
      extendedHoldEnabled: false,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should handle recovery breath correctly (Wim Hof style)', () => {
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

    // 1. Complete the cycle: Inhale(2) -> Exhale(2)
    vi.advanceTimersByTime(4000); 
    
    // 2. Should be in EXTENDED_EXHALE_HOLD (Tolerance)
    expect(timer.phase.value).toBe('EXTENDED_EXHALE_HOLD');
    expect(timer.currentTime.value).toBe(0); 
    
    // Advance a bit
    vi.advanceTimersByTime(1000);
    expect(timer.currentTime.value).toBeGreaterThan(0);
    
    // 3. End the extended hold manually
    timer.endExtendedHold();
    
    // 4. Should transition to INHALE (Recovery Breath)
    expect(timer.phase.value).toBe('INHALE');
    expect(timer.isRecoveryBreath.value).toBe(true);
    
    // 5. Complete the recovery inhale (2s)
    vi.advanceTimersByTime(2100);
    
    // 6. Should now be in EXTENDED_INHALE_HOLD (Timed 15s)
    expect(timer.phase.value).toBe('EXTENDED_INHALE_HOLD');
    expect(timer.isRecoveryBreath.value).toBe(false);
    expect(timer.totalPhaseTime.value).toBe(15);
    
    // 7. Advance 15s
    vi.advanceTimersByTime(15100);
    
    // 8. Should be SET_COMPLETE
    expect(timer.phase.value).toBe('SET_COMPLETE');
  });
});
