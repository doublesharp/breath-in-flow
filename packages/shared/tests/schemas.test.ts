import { describe, it, expect } from 'vitest';
import {
  BreathingConfigSchema,
  CreateBreathingConfigSchema,
  DEFAULT_BREATHING_CONFIG,
  getPhaseInfo,
  TimerStateSchema,
  INITIAL_TIMER_STATE,
  MeasurementRecordMetadataSchema,
  AssessmentResultSchema,
  UserGoalSchema,
  UserPreferencesSchema,
  SessionCheckInSchema,
  SessionSchema,
} from '../src/schemas';

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

describe('BreathingConfigSchema', () => {
  it.each(['repetitions', 'targetSets'])(
    'rejects fractional %s in created and persisted configurations',
    (field) => {
      const config = { ...DEFAULT_BREATHING_CONFIG, [field]: 4.5 };
      expect(BreathingConfigSchema.safeParse(config).success).toBe(false);
      expect(CreateBreathingConfigSchema.safeParse(config).success).toBe(false);
    }
  );

  it('validates persisted metadata and applies both timed-hold refinements', () => {
    const persistedConfig = {
      ...DEFAULT_BREATHING_CONFIG,
      id: crypto.randomUUID(),
      createdAt: new Date('2026-07-20T00:00:00.000Z'),
      updatedAt: new Date('2026-07-20T01:00:00.000Z'),
      extendedHoldEnabled: true,
      extendedHoldMode: 'TIMED' as const,
      extendedHoldDuration: 30,
      secondExtendedHoldEnabled: true,
      secondExtendedHoldMode: 'TIMED' as const,
      secondExtendedHoldDuration: 15,
    };

    expect(BreathingConfigSchema.parse(persistedConfig)).toEqual(persistedConfig);
    expect(
      BreathingConfigSchema.safeParse({ ...persistedConfig, extendedHoldDuration: 0 }).success
    ).toBe(false);
    expect(
      BreathingConfigSchema.safeParse({ ...persistedConfig, secondExtendedHoldDuration: 0 }).success
    ).toBe(false);
  });

  it('allows tolerance holds with no target duration in persisted configs', () => {
    const result = BreathingConfigSchema.parse({
      ...DEFAULT_BREATHING_CONFIG,
      extendedHoldEnabled: true,
      extendedHoldMode: 'TOLERANCE',
      extendedHoldDuration: 0,
      secondExtendedHoldEnabled: true,
      secondExtendedHoldMode: 'TOLERANCE',
      secondExtendedHoldDuration: 0,
    });

    expect(result.extendedHoldDuration).toBe(0);
    expect(result.secondExtendedHoldDuration).toBe(0);
  });

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
    expect(result.restBetweenSetsSeconds).toBe(0);
  });

  it('validates rest between sets from zero through ten minutes', () => {
    expect(
      CreateBreathingConfigSchema.parse({
        name: 'Timed Rest',
        restBetweenSetsSeconds: 60,
      }).restBetweenSetsSeconds
    ).toBe(60);
    expect(
      CreateBreathingConfigSchema.safeParse({
        name: 'Too Much Rest',
        restBetweenSetsSeconds: 601,
      }).success
    ).toBe(false);
    expect(
      CreateBreathingConfigSchema.safeParse({
        name: 'Negative Rest',
        restBetweenSetsSeconds: -1,
      }).success
    ).toBe(false);
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

  it('should reject timed extended holds without a positive duration', () => {
    const config = {
      name: 'Invalid timed hold',
      extendedHoldEnabled: true,
      extendedHoldMode: 'TIMED' as const,
      extendedHoldDuration: 0,
    };

    expect(CreateBreathingConfigSchema.safeParse(config).success).toBe(false);
  });

  it('should reject timed second extended holds without a positive duration', () => {
    const config = {
      name: 'Invalid second timed hold',
      secondExtendedHoldEnabled: true,
      secondExtendedHoldMode: 'TIMED' as const,
      secondExtendedHoldDuration: 0,
    };

    expect(CreateBreathingConfigSchema.safeParse(config).success).toBe(false);
  });

  it('fuzzes valid bounded config inputs', () => {
    const rng = createRng(0xb1f2026);

    for (let i = 0; i < 100; i++) {
      const extendedHoldEnabled = rng() < 0.5;
      const extendedHoldMode = rng() < 0.5 ? 'TIMED' : 'TOLERANCE';
      const secondExtendedHoldEnabled = rng() < 0.35;
      const secondExtendedHoldMode = rng() < 0.5 ? 'TIMED' : 'TOLERANCE';
      const config = {
        name: `Fuzz Config ${i}`,
        inhaleTime: randomInt(rng, 1, 60),
        inhaleHoldTime: randomInt(rng, 0, 60),
        exhaleTime: randomInt(rng, 1, 60),
        exhaleHoldTime: randomInt(rng, 0, 60),
        repetitions: randomInt(rng, 1, 100),
        extendedHoldEnabled,
        extendedHoldType: rng() < 0.5 ? ('INHALE' as const) : ('EXHALE' as const),
        extendedHoldMode,
        extendedHoldDuration:
          extendedHoldEnabled && extendedHoldMode === 'TIMED'
            ? randomInt(rng, 1, 300)
            : randomInt(rng, 0, 300),
        secondExtendedHoldEnabled,
        secondExtendedHoldType: rng() < 0.5 ? ('INHALE' as const) : ('EXHALE' as const),
        secondExtendedHoldMode,
        secondExtendedHoldDuration:
          secondExtendedHoldEnabled && secondExtendedHoldMode === 'TIMED'
            ? randomInt(rng, 1, 300)
            : randomInt(rng, 0, 300),
        targetSets: randomInt(rng, 0, 20),
        soundEnabled: rng() < 0.5,
        soundTheme: ['wood', 'water', 'wind', 'subtle', 'chimes'][randomInt(rng, 0, 4)],
        ttsEnabled: rng() < 0.5,
      };

      const result = CreateBreathingConfigSchema.safeParse(config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.inhaleTime).toBeGreaterThanOrEqual(1);
        expect(result.data.exhaleTime).toBeGreaterThanOrEqual(1);
        expect(result.data.repetitions).toBeGreaterThanOrEqual(1);
        expect(result.data.targetSets).toBeLessThanOrEqual(20);
      }
    }
  });

  it('fuzzes invalid config bounds and refinements', () => {
    const rng = createRng(0xbad2026);
    const invalidVariants: Array<Record<string, unknown>> = [
      { name: '' },
      { name: 'x'.repeat(101) },
      { inhaleTime: 0 },
      { inhaleTime: 61 },
      { inhaleHoldTime: -1 },
      { inhaleHoldTime: 61 },
      { exhaleTime: 0 },
      { exhaleTime: 61 },
      { exhaleHoldTime: -1 },
      { exhaleHoldTime: 61 },
      { repetitions: 0 },
      { repetitions: 101 },
      { targetSets: -1 },
      { targetSets: 21 },
      { restBetweenSetsSeconds: -1 },
      { restBetweenSetsSeconds: 601 },
      { soundTheme: 'invalid-theme' },
      {
        extendedHoldEnabled: true,
        extendedHoldMode: 'TIMED',
        extendedHoldDuration: 0,
      },
      {
        secondExtendedHoldEnabled: true,
        secondExtendedHoldMode: 'TIMED',
        secondExtendedHoldDuration: 0,
      },
    ];

    for (let i = 0; i < 80; i++) {
      const invalidConfig = {
        ...DEFAULT_BREATHING_CONFIG,
        name: `Invalid Fuzz ${i}`,
        ...invalidVariants[randomInt(rng, 0, invalidVariants.length - 1)],
      };

      expect(CreateBreathingConfigSchema.safeParse(invalidConfig).success).toBe(false);
    }
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
    expect(DEFAULT_BREATHING_CONFIG.restBetweenSetsSeconds).toBe(0);
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

describe('getPhaseInfo', () => {
  it.each([
    [2, 'Breathe in quickly'],
    [4, 'Breathe in steadily'],
    [6, 'Breathe in slowly'],
    [7, 'Breathe in very slowly'],
  ])('describes a %d-second inhale with the matching pace', (inhaleTime, instruction) => {
    const config = BreathingConfigSchema.parse({
      ...DEFAULT_BREATHING_CONFIG,
      inhaleTime,
    });

    expect(getPhaseInfo('INHALE', config)).toMatchObject({
      label: 'Inhale',
      instruction,
      color: 'green',
    });
  });

  it('uses exhale wording and a safe generic instruction without a config', () => {
    const config = BreathingConfigSchema.parse({
      ...DEFAULT_BREATHING_CONFIG,
      exhaleTime: 7,
    });

    expect(getPhaseInfo('EXHALE', config).instruction).toBe('Breathe out very slowly');
    expect(getPhaseInfo('EXHALE').instruction).toBe('Breathe');
  });
});

describe('MeasurementRecordMetadataSchema', () => {
  it('parses legacy records with backward-compatible metadata defaults', () => {
    expect(MeasurementRecordMetadataSchema.parse({})).toEqual({
      algorithmVersion: 1,
    });
  });

  it('validates versioned provenance metadata', () => {
    expect(
      MeasurementRecordMetadataSchema.parse({
        algorithmVersion: 2,
        sampleProvenance: {
          sources: ['ppg', 'fused'],
          detectionMethods: ['peak-detected'],
        },
      })
    ).toEqual({
      algorithmVersion: 2,
      sampleProvenance: {
        sources: ['ppg', 'fused'],
        detectionMethods: ['peak-detected'],
      },
    });
  });

  it('rejects stored provenance that explicitly contains a non-peak detection method', () => {
    expect(
      MeasurementRecordMetadataSchema.safeParse({
        algorithmVersion: 2,
        sampleProvenance: {
          sources: ['ppg'],
          detectionMethods: ['autocorrelation-estimate'],
        },
      }).success
    ).toBe(false);
    expect(MeasurementRecordMetadataSchema.safeParse({ algorithmVersion: 1 }).success).toBe(true);
  });
});

describe('AssessmentResultSchema', () => {
  function validAssessment() {
    return {
      id: crypto.randomUUID(),
      trials: [
        {
          rate: 6,
          inhaleTime: 4,
          inhaleHoldTime: 0,
          exhaleTime: 6,
          exhaleHoldTime: 0,
          repetitions: 12,
          comfortRating: 4,
          symptoms: [],
        },
      ],
      selectedRate: 6,
      completedAt: new Date(),
      config: {
        warmupDurationSeconds: 120,
        warmupRate: 6,
        restDurationSeconds: 120,
      },
    };
  }

  it('accepts a finite completed assessment with a selected completed trial', () => {
    expect(AssessmentResultSchema.safeParse(validAssessment()).success).toBe(true);
  });

  it.each([
    ['empty trials', (value: ReturnType<typeof validAssessment>) => (value.trials = [])],
    [
      'fractional comfort rating',
      (value: ReturnType<typeof validAssessment>) => (value.trials[0].comfortRating = 4.5),
    ],
    [
      'non-finite rate',
      (value: ReturnType<typeof validAssessment>) => (value.trials[0].rate = Number.NaN),
    ],
    [
      'zero inhale',
      (value: ReturnType<typeof validAssessment>) => (value.trials[0].inhaleTime = 0),
    ],
    [
      'non-finite exhale',
      (value: ReturnType<typeof validAssessment>) => (value.trials[0].exhaleTime = Infinity),
    ],
    [
      'negative inhale hold',
      (value: ReturnType<typeof validAssessment>) => (value.trials[0].inhaleHoldTime = -1),
    ],
    [
      'non-integer repetitions',
      (value: ReturnType<typeof validAssessment>) => (value.trials[0].repetitions = 12.5),
    ],
    [
      'zero repetitions',
      (value: ReturnType<typeof validAssessment>) => (value.trials[0].repetitions = 0),
    ],
    [
      'uncompleted selected trial',
      (value: ReturnType<typeof validAssessment>) => {
        delete value.trials[0].comfortRating;
      },
    ],
    [
      'unmatched selected rate',
      (value: ReturnType<typeof validAssessment>) => (value.selectedRate = 5.5),
    ],
    [
      'invalid rest duration',
      (value: ReturnType<typeof validAssessment>) => (value.config.restDurationSeconds = -1),
    ],
  ])('rejects %s', (_label, mutate) => {
    const value = validAssessment();
    mutate(value);
    expect(AssessmentResultSchema.safeParse(value).success).toBe(false);
  });
});

describe('UserPreferencesSchema', () => {
  it('parses a supported goal into a versioned preferences record', () => {
    expect(UserPreferencesSchema.parse({ version: 1, goal: 'RELAX' })).toEqual({
      version: 1,
      goal: 'RELAX',
    });
  });

  it('rejects goals outside the supported enum', () => {
    expect(UserGoalSchema.safeParse('DIAGNOSE_ME').success).toBe(false);
  });

  it('rejects unexpected preference keys', () => {
    expect(
      UserPreferencesSchema.safeParse({ version: 1, goal: 'RELAX', extra: true }).success
    ).toBe(false);
  });
});

describe('SessionCheckInSchema', () => {
  it('parses a complete before/after check-in with a trimmed comment', () => {
    expect(
      SessionCheckInSchema.parse({ before: 1, after: 5, comment: 'More comfortable' })
    ).toEqual({
      before: 1,
      after: 5,
      comment: 'More comfortable',
    });
  });

  it('accepts a check-in with only a single response', () => {
    expect(SessionCheckInSchema.safeParse({ after: 6 }).success).toBe(false);
    expect(SessionCheckInSchema.safeParse({ before: 3 }).success).toBe(true);
  });

  it('rejects an empty check-in with no responses', () => {
    expect(SessionCheckInSchema.safeParse({}).success).toBe(false);
  });

  it('rejects comments longer than the allowed maximum', () => {
    expect(SessionCheckInSchema.safeParse({ comment: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('SessionSchema check-in', () => {
  it('rejects a fractional session target set count', () => {
    expect(
      SessionSchema.safeParse({
        configSnapshot: DEFAULT_BREATHING_CONFIG,
        startedAt: new Date(),
        targetSets: 2.5,
      }).success
    ).toBe(false);
  });

  const validSession = {
    configSnapshot: DEFAULT_BREATHING_CONFIG,
    startedAt: new Date('2026-07-20T12:00:00.000Z'),
  };

  it('parses an optional check-in attached to a session', () => {
    expect(
      SessionSchema.parse({ ...validSession, checkIn: { before: 2, after: 4 } }).checkIn
    ).toEqual({
      before: 2,
      after: 4,
    });
  });

  it('parses a session without a check-in', () => {
    expect(SessionSchema.parse(validSession).checkIn).toBeUndefined();
  });
});
