import { describe, it, expect } from 'vitest';
import {
  CreateBreathingConfigSchema,
  DEFAULT_BREATHING_CONFIG,
  TimerStateSchema,
  INITIAL_TIMER_STATE,
} from '../src/schemas';

describe('BreathingConfigSchema', () => {
  it('should validate a valid config', () => {
    const config = {
      name: 'Test Config',
      inhaleTime: 4,
      inhaleHoldTime: 2,
      exhaleTime: 6,
      exhaleHoldTime: 2,
      repetitions: 4,
      extendedHoldEnabled: true,
      extendedHoldType: 'EXHALE' as const,
      extendedHoldMode: 'TOLERANCE' as const,
      extendedHoldDuration: 30,
      secondExtendedHoldEnabled: false,
      secondExtendedHoldType: 'INHALE' as const,
      targetSets: 3,
    };

    const result = CreateBreathingConfigSchema.parse(config);
    expect(result.name).toBe('Test Config');
    expect(result.inhaleTime).toBe(4);
    expect(result.repetitions).toBe(4);
  });

  it('should apply default values', () => {
    const config = {
      name: 'Minimal Config',
    };

    const result = CreateBreathingConfigSchema.parse(config);
    expect(result.inhaleTime).toBe(4);
    expect(result.exhaleTime).toBe(4);
    expect(result.inhaleHoldTime).toBe(0);
    expect(result.exhaleHoldTime).toBe(0);
    expect(result.repetitions).toBe(4);
    expect(result.extendedHoldEnabled).toBe(false);
    expect(result.targetSets).toBe(0);
  });

  it('should reject invalid inhale time', () => {
    const config = {
      name: 'Invalid',
      inhaleTime: 0, // Must be >= 1
    };

    expect(() => CreateBreathingConfigSchema.parse(config)).toThrow();
  });

  it('should reject inhale time > 60', () => {
    const config = {
      name: 'Invalid',
      inhaleTime: 61,
    };

    expect(() => CreateBreathingConfigSchema.parse(config)).toThrow();
  });

  it('should reject empty name', () => {
    const config = {
      name: '',
    };

    expect(() => CreateBreathingConfigSchema.parse(config)).toThrow();
  });

  it('should accept valid extended hold configuration', () => {
    const config = {
      name: 'Extended Hold Test',
      extendedHoldEnabled: true,
      extendedHoldType: 'INHALE' as const,
      extendedHoldMode: 'TIMED' as const,
      extendedHoldDuration: 60,
    };

    const result = CreateBreathingConfigSchema.parse(config);
    expect(result.extendedHoldEnabled).toBe(true);
    expect(result.extendedHoldType).toBe('INHALE');
    expect(result.extendedHoldMode).toBe('TIMED');
    expect(result.extendedHoldDuration).toBe(60);
  });
});

describe('DEFAULT_BREATHING_CONFIG', () => {
  it('should be a valid config', () => {
    const result = CreateBreathingConfigSchema.parse(DEFAULT_BREATHING_CONFIG);
    expect(result).toEqual(DEFAULT_BREATHING_CONFIG);
  });

  it('should have sensible defaults', () => {
    expect(DEFAULT_BREATHING_CONFIG.inhaleTime).toBe(4);
    expect(DEFAULT_BREATHING_CONFIG.exhaleTime).toBe(4);
    expect(DEFAULT_BREATHING_CONFIG.repetitions).toBe(4);
    expect(DEFAULT_BREATHING_CONFIG.extendedHoldEnabled).toBe(false);
  });
});

describe('TimerStateSchema', () => {
  it('should validate INITIAL_TIMER_STATE', () => {
    const result = TimerStateSchema.parse(INITIAL_TIMER_STATE);
    expect(result.phase).toBe('IDLE');
    expect(result.isRunning).toBe(false);
    expect(result.isPaused).toBe(false);
  });

  it('should validate running timer state', () => {
    const state = {
      phase: 'INHALE' as const,
      currentTime: 3.5,
      totalPhaseTime: 4,
      currentRepetition: 2,
      currentSet: 1,
      isRunning: true,
      isPaused: false,
      extendedHoldElapsed: 0,
      isFirstExtendedHold: true,
    };

    const result = TimerStateSchema.parse(state);
    expect(result.phase).toBe('INHALE');
    expect(result.currentTime).toBe(3.5);
    expect(result.currentRepetition).toBe(2);
  });

  it('should validate extended hold state', () => {
    const state = {
      phase: 'EXTENDED_EXHALE_HOLD' as const,
      currentTime: 15.3,
      totalPhaseTime: 0,
      currentRepetition: 4,
      currentSet: 1,
      isRunning: true,
      isPaused: false,
      extendedHoldStartTime: Date.now(),
      extendedHoldElapsed: 15.3,
      isFirstExtendedHold: true,
    };

    const result = TimerStateSchema.parse(state);
    expect(result.phase).toBe('EXTENDED_EXHALE_HOLD');
    expect(result.extendedHoldElapsed).toBe(15.3);
  });
});
