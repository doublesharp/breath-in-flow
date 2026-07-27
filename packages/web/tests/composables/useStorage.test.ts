import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  useStorage,
  resetStorageForTesting,
  type PracticeStorageSnapshot,
} from '../../src/composables/useStorage';
import type {
  BreathingConfig,
  CreateBreathingConfig,
  SessionSet,
  ExtendedHoldRecord,
} from '@breath-in-flow/shared';
import { DEFAULT_BREATHING_CONFIG } from '@breath-in-flow/shared';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
});

// Helper function to create a valid test config input
function createTestConfigInput(
  overrides: Partial<CreateBreathingConfig> = {}
): CreateBreathingConfig {
  return {
    name: 'Test Config',
    inhaleTime: 4,
    exhaleTime: 6,
    inhaleHoldTime: 2,
    exhaleHoldTime: 0,
    repetitions: 5,
    targetSets: 3,
    restBetweenSetsSeconds: 0,
    extendedHoldEnabled: false,
    extendedHoldType: 'EXHALE',
    extendedHoldMode: 'TOLERANCE',
    extendedHoldDuration: 30,
    secondExtendedHoldEnabled: false,
    secondExtendedHoldType: 'INHALE',
    secondExtendedHoldMode: 'TIMED',
    secondExtendedHoldDuration: 30,
    soundEnabled: false,
    soundTheme: 'wood',
    ttsEnabled: false,
    ...overrides,
  };
}

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

describe('useStorage', () => {
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    resetStorageForTesting();
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLocalStorage,
    });
    vi.restoreAllMocks();
  });

  describe('Configuration Operations', () => {
    it('creates in-memory state that should not leak into the next test', () => {
      const storage = useStorage();

      storage.createConfig(createTestConfigInput({ name: 'Isolation Seed' }));

      expect(storage.getAllConfigs()).toHaveLength(1);
    });

    it('starts each test with empty in-memory configs after localStorage is cleared', () => {
      const storage = useStorage();

      expect(storage.getAllConfigs()).toHaveLength(0);
    });

    it('should create a new config', () => {
      const storage = useStorage();
      const input = createTestConfigInput();

      const config = storage.createConfig(input);

      expect(config).toBeDefined();
      expect(config.id).toBeDefined();
      expect(config.name).toBe('Test Config');
      expect(config.inhaleTime).toBe(4);
      expect(config.exhaleTime).toBe(6);
      expect(config.createdAt).toBeInstanceOf(Date);
      expect(config.updatedAt).toBeInstanceOf(Date);
    });

    it('should get a config by id', () => {
      const storage = useStorage();
      const input = createTestConfigInput({ name: 'Get Test' });

      const created = storage.createConfig(input);
      expect(created.id).toBeDefined();

      const retrieved = storage.getConfig(created.id!);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe('Get Test');
    });

    it('should return undefined for non-existent config', () => {
      const storage = useStorage();
      const retrieved = storage.getConfig('non-existent-id');

      expect(retrieved).toBeUndefined();
    });

    it('should get all configs', () => {
      const storage = useStorage();
      const baseInput = createTestConfigInput();

      // Get initial count
      const initialCount = storage.getAllConfigs().length;

      storage.createConfig({ ...baseInput, name: 'Config 1' });
      storage.createConfig({ ...baseInput, name: 'Config 2' });
      storage.createConfig({ ...baseInput, name: 'Config 3' });

      const allConfigs = storage.getAllConfigs();

      expect(allConfigs.length).toBe(initialCount + 3);
    });

    it('should update a config', () => {
      const storage = useStorage();
      const input = createTestConfigInput({ name: 'Original Name' });

      const created = storage.createConfig(input);
      expect(created.id).toBeDefined();

      const updated = storage.updateConfig(created.id!, { name: 'Updated Name', inhaleTime: 6 });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.inhaleTime).toBe(6);
      expect(updated?.exhaleTime).toBe(6); // Unchanged
    });

    it('should return undefined when updating non-existent config', () => {
      const storage = useStorage();
      const updated = storage.updateConfig('non-existent-id', { name: 'New Name' });

      expect(updated).toBeUndefined();
    });

    it('should delete a config', () => {
      const storage = useStorage();
      const input = createTestConfigInput({ name: 'To Delete' });

      const created = storage.createConfig(input);
      expect(created.id).toBeDefined();

      const deleted = storage.deleteConfig(created.id!);

      expect(deleted).toBe(true);
      expect(storage.getConfig(created.id!)).toBeUndefined();
    });

    it('should return false when deleting non-existent config', () => {
      const storage = useStorage();
      const deleted = storage.deleteConfig('non-existent-id');

      expect(deleted).toBe(false);
    });
  });

  describe('Session Operations', () => {
    let testConfig: BreathingConfig;

    beforeEach(() => {
      const storage = useStorage();
      testConfig = storage.createConfig(createTestConfigInput({ name: 'Session Test Config' }));
    });

    it('should create a new session', () => {
      const storage = useStorage();
      const session = storage.createSession(testConfig);

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.configId).toBe(testConfig.id);
      expect(session.status).toBe('IN_PROGRESS');
      expect(session.sets).toEqual([]);
      expect(session.completedSets).toBe(0);
      expect(session.startedAt).toBeInstanceOf(Date);
    });

    it('should keep session config snapshots independent from later config mutations', () => {
      const storage = useStorage();
      const session = storage.createSession(testConfig);

      testConfig.name = 'Mutated Config';
      testConfig.inhaleTime = 60;
      testConfig.soundTheme = 'chimes';

      const storedSession = storage.getSession(session.id!)!;
      expect(storedSession.configSnapshot.name).toBe('Session Test Config');
      expect(storedSession.configSnapshot.inhaleTime).toBe(4);
      expect(storedSession.configSnapshot.soundTheme).toBe('wood');
    });

    it('should get a session by id', () => {
      const storage = useStorage();
      const created = storage.createSession(testConfig);
      expect(created.id).toBeDefined();

      const retrieved = storage.getSession(created.id!);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should return undefined for non-existent session', () => {
      const storage = useStorage();
      const retrieved = storage.getSession('non-existent-id');

      expect(retrieved).toBeUndefined();
    });

    it('should get all sessions', () => {
      const storage = useStorage();
      storage.createSession(testConfig);
      storage.createSession(testConfig);

      const allSessions = storage.getAllSessions();

      expect(allSessions.length).toBeGreaterThanOrEqual(2);
    });

    it('should get recent sessions with limit', () => {
      const storage = useStorage();
      for (let i = 0; i < 15; i++) {
        storage.createSession(testConfig);
      }

      const recentSessions = storage.getRecentSessions(5);

      expect(recentSessions.length).toBe(5);
    });

    it('should update a session', () => {
      const storage = useStorage();
      const created = storage.createSession(testConfig);
      expect(created.id).toBeDefined();

      const updated = storage.updateSession(created.id!, { status: 'COMPLETED' });

      expect(updated).toBeDefined();
      expect(updated?.status).toBe('COMPLETED');
    });

    it('should add a set to session', () => {
      const storage = useStorage();
      const session = storage.createSession(testConfig);
      expect(session.id).toBeDefined();

      const set = {
        setNumber: 1,
        completedRepetitions: 5,
        startedAt: new Date(),
        completedAt: new Date(),
        extendedHolds: [],
      };

      const updated = storage.addSetToSession(session.id!, set);

      expect(updated).toBeDefined();
      expect(updated?.sets.length).toBe(1);
      expect(updated?.completedSets).toBe(1);
    });

    it('should add extended hold to set', () => {
      const storage = useStorage();
      const session = storage.createSession(testConfig);
      expect(session.id).toBeDefined();

      const set = {
        setNumber: 1,
        completedRepetitions: 5,
        startedAt: new Date(),
        completedAt: new Date(),
        extendedHolds: [],
      };
      storage.addSetToSession(session.id!, set);

      const hold = {
        type: 'EXHALE' as const,
        mode: 'TOLERANCE' as const,
        targetDuration: 0,
        actualDuration: 45,
        completedAt: new Date(),
      };

      const updated = storage.addExtendedHoldToSet(session.id!, 0, hold);

      expect(updated).toBeDefined();
      expect(updated?.sets[0].extendedHolds.length).toBe(1);
      expect(updated?.sets[0].extendedHolds[0].actualDuration).toBe(45);
    });

    it('should complete a session', () => {
      const storage = useStorage();
      const session = storage.createSession(testConfig);
      expect(session.id).toBeDefined();

      const completed = storage.completeSession(session.id!);

      expect(completed).toBeDefined();
      expect(completed?.status).toBe('COMPLETED');
      expect(completed?.completedAt).toBeInstanceOf(Date);
    });

    it('keeps the original completion timestamp when completion is requested twice', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
      const storage = useStorage();
      const session = storage.createSession(testConfig);

      const firstCompletion = storage.completeSession(session.id!);
      vi.setSystemTime(new Date('2026-07-20T12:05:00.000Z'));
      const secondCompletion = storage.completeSession(session.id!);

      expect(secondCompletion?.completedAt).toEqual(firstCompletion?.completedAt);
      expect(secondCompletion?.completedAt).toEqual(new Date('2026-07-20T12:00:00.000Z'));
    });

    it('should cancel a session', () => {
      const storage = useStorage();
      const session = storage.createSession(testConfig);
      expect(session.id).toBeDefined();

      const cancelled = storage.cancelSession(session.id!);

      expect(cancelled).toBeDefined();
      expect(cancelled?.status).toBe('CANCELLED');
      expect(cancelled?.completedAt).toBeInstanceOf(Date);
    });

    it('should delete a session', () => {
      const storage = useStorage();
      const session = storage.createSession(testConfig);
      expect(session.id).toBeDefined();

      const deleted = storage.deleteSession(session.id!);

      expect(deleted).toBe(true);
      expect(storage.getSession(session.id!)).toBeUndefined();
    });

    it('should return false when deleting non-existent session', () => {
      const storage = useStorage();
      const deleted = storage.deleteSession('non-existent-id');

      expect(deleted).toBe(false);
    });
  });

  describe('Session Check-Ins', () => {
    let testConfig: BreathingConfig;

    beforeEach(() => {
      const storage = useStorage();
      testConfig = storage.createConfig(createTestConfigInput({ name: 'Check-In Config' }));
    });

    it('merges and validates pre- and post-session check-in data', () => {
      const storage = useStorage();
      const session = storage.createSession(testConfig);

      const updated = storage.setSessionCheckIn(session.id!, { before: 2 });
      expect(updated?.checkIn).toEqual({ before: 2 });

      storage.completeSession(session.id!);
      storage.setSessionCheckIn(session.id!, { after: 4, comment: 'Felt easier' });

      expect(storage.getSession(session.id!)?.checkIn).toEqual({
        before: 2,
        after: 4,
        comment: 'Felt easier',
      });
    });

    it('returns undefined when the session does not exist', () => {
      const storage = useStorage();
      expect(storage.setSessionCheckIn('non-existent-id', { before: 3 })).toBeUndefined();
    });

    it('rejects invalid check-in data and leaves the existing check-in untouched', () => {
      const storage = useStorage();
      const session = storage.createSession(testConfig);
      storage.setSessionCheckIn(session.id!, { before: 3 });

      const invalidScore = storage.setSessionCheckIn(session.id!, {
        after: 9 as unknown as 4,
      });
      expect(invalidScore).toBeUndefined();

      const overlongComment = storage.setSessionCheckIn(session.id!, {
        comment: 'x'.repeat(501),
      });
      expect(overlongComment).toBeUndefined();

      expect(storage.getSession(session.id!)?.checkIn).toEqual({ before: 3 });
    });

    it('applies the same post-session data idempotently', () => {
      const storage = useStorage();
      const session = storage.createSession(testConfig);

      const first = storage.setSessionCheckIn(session.id!, { after: 5, comment: 'Calm' });
      const second = storage.setSessionCheckIn(session.id!, { after: 5, comment: 'Calm' });

      expect(first?.checkIn).toEqual({ after: 5, comment: 'Calm' });
      expect(second?.checkIn).toEqual(first?.checkIn);
    });
  });

  describe('Stats', () => {
    beforeEach(() => {
      resetStorageForTesting();
      localStorageMock.clear();
      vi.resetModules();
    });

    it('should calculate stats from completed sessions', () => {
      const storage = useStorage();

      const config = storage.createConfig(
        createTestConfigInput({
          name: 'Stats Test',
          extendedHoldEnabled: true,
        })
      );

      // Create and complete a session with sets and holds
      const session = storage.createSession(config);
      expect(session.id).toBeDefined();

      storage.addSetToSession(session.id!, {
        setNumber: 1,
        completedRepetitions: 5,
        startedAt: new Date(),
        completedAt: new Date(),
        extendedHolds: [
          {
            type: 'EXHALE',
            mode: 'TOLERANCE',
            targetDuration: 0,
            actualDuration: 30,
            completedAt: new Date(),
          },
          {
            type: 'EXHALE',
            mode: 'TOLERANCE',
            targetDuration: 0,
            actualDuration: 40,
            completedAt: new Date(),
          },
        ],
      });
      storage.completeSession(session.id!);

      const stats = storage.stats.value;

      expect(stats.totalSessions).toBeGreaterThanOrEqual(1);
      expect(stats.totalSets).toBeGreaterThanOrEqual(1);
      expect(stats.totalExtendedHolds).toBeGreaterThanOrEqual(2);
      expect(stats.avgHoldTime).toBeGreaterThan(0);
      expect(stats.maxHoldTime).toBe(40);
    });

    it('should calculate stats with no extended holds', () => {
      const storage = useStorage();

      const config = storage.createConfig(
        createTestConfigInput({
          name: 'No Holds Stats',
          extendedHoldEnabled: false,
        })
      );

      const session = storage.createSession(config);
      expect(session.id).toBeDefined();

      storage.addSetToSession(session.id!, {
        setNumber: 1,
        completedRepetitions: 5,
        startedAt: new Date(),
        completedAt: new Date(),
        extendedHolds: [],
      });
      storage.completeSession(session.id!);

      const stats = storage.stats.value;

      expect(stats.totalExtendedHolds).toBe(0);
      expect(stats.avgHoldTime).toBe(0);
      expect(stats.maxHoldTime).toBe(0);
    });

    it('should return zeros for empty stats', () => {
      // The stats computed property reads from sessions
      const storage = useStorage();

      expect(storage.stats.value).toBeDefined();
      expect(typeof storage.stats.value.totalSessions).toBe('number');
      expect(typeof storage.stats.value.avgHoldTime).toBe('number');
    });

    it('fuzzes stats aggregation across completed and incomplete sessions', () => {
      const rng = createRng(0x57a7526);
      const storage = useStorage();
      const config = storage.createConfig(
        createTestConfigInput({
          name: 'Stats Fuzz',
          extendedHoldEnabled: true,
        })
      );
      let expectedSessions = 0;
      let expectedSets = 0;
      let expectedHolds = 0;
      let totalHoldDuration = 0;
      let maxHoldDuration = 0;

      for (let sessionIndex = 0; sessionIndex < 14; sessionIndex++) {
        const session = storage.createSession(config);
        const willComplete = sessionIndex % 3 !== 0;
        const setCount = randomInt(rng, 1, 4);
        const sessionHolds: number[] = [];

        for (let setIndex = 0; setIndex < setCount; setIndex++) {
          const holdCount = randomInt(rng, 0, 3);
          const extendedHolds: ExtendedHoldRecord[] = Array.from({ length: holdCount }, () => {
            const actualDuration = randomInt(rng, 5, 120);
            sessionHolds.push(actualDuration);
            return {
              type: rng() < 0.5 ? 'INHALE' : 'EXHALE',
              mode: rng() < 0.5 ? 'TIMED' : 'TOLERANCE',
              targetDuration: randomInt(rng, 0, 120),
              actualDuration,
              completedAt: new Date(),
            };
          });

          storage.addSetToSession(session.id!, {
            setNumber: setIndex + 1,
            completedRepetitions: randomInt(rng, 1, config.repetitions),
            startedAt: new Date(),
            completedAt: new Date(),
            extendedHolds,
          });
        }

        if (willComplete) {
          storage.completeSession(session.id!);
          expectedSessions++;
          expectedSets += setCount;
          expectedHolds += sessionHolds.length;
          totalHoldDuration += sessionHolds.reduce((sum, duration) => sum + duration, 0);
          maxHoldDuration = Math.max(maxHoldDuration, ...sessionHolds, 0);
        }
      }

      const stats = storage.stats.value;
      expect(stats.totalSessions).toBe(expectedSessions);
      expect(stats.totalSets).toBe(expectedSets);
      expect(stats.totalExtendedHolds).toBe(expectedHolds);
      expect(stats.avgHoldTime).toBeCloseTo(
        expectedHolds > 0 ? totalHoldDuration / expectedHolds : 0,
        10
      );
      expect(stats.maxHoldTime).toBe(maxHoldDuration);
    });
  });

  describe('Default Config', () => {
    it('should export DEFAULT_BREATHING_CONFIG', () => {
      const storage = useStorage();
      expect(storage.DEFAULT_BREATHING_CONFIG).toBeDefined();
      expect(storage.DEFAULT_BREATHING_CONFIG.inhaleTime).toBe(DEFAULT_BREATHING_CONFIG.inhaleTime);
    });
  });

  describe('localStorage persistence', () => {
    it('should save configs to localStorage', () => {
      const storage = useStorage();
      storage.createConfig(createTestConfigInput({ name: 'Persist Test' }));

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'breath-in-flow-configs',
        expect.any(String)
      );
    });

    it('should save sessions to localStorage', () => {
      const storage = useStorage();
      const config = storage.createConfig(createTestConfigInput({ name: 'Session Persist Test' }));

      storage.createSession(config);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'breath-in-flow-sessions',
        expect.any(String)
      );
    });

    it('does not recreate the legacy assessment key while saving normal app state', () => {
      const storage = useStorage();
      const config = storage.createConfig(createTestConfigInput({ name: 'Boundary Test' }));

      storage.createSession(config);
      storage.setSoundTheme('water');

      expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
        'breath-in-flow-assessments',
        expect.any(String)
      );
      expect(localStorageMock.getItem('breath-in-flow-assessments')).toBeNull();
    });

    it('does not read or expose legacy assessment storage', async () => {
      localStorageMock.setItem('breath-in-flow-assessments', JSON.stringify([{ id: 'legacy' }]));
      vi.clearAllMocks();
      vi.resetModules();

      const mod = await import('../../src/composables/useStorage');
      const storage = mod.useStorage();

      expect(localStorageMock.getItem).not.toHaveBeenCalledWith('breath-in-flow-assessments');
      expect(storage).not.toHaveProperty('getAssessments');
      expect(storage).not.toHaveProperty('saveAssessment');
    });
  });

  describe('useStorage Branches - Error Handling', () => {
    it('handles localStorage.getItem throwing error', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage error');
      });

      const storage = useStorage();
      // Should have configs available (from default or fallback)
      expect(storage.configs).toBeDefined();
      // DEFAULT_BREATHING_CONFIG should be available
      expect(storage.DEFAULT_BREATHING_CONFIG).toBeDefined();
    });

    it('throws and rolls back in-memory state when a durable write fails', () => {
      const storage = useStorage();
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new DOMException('Storage full', 'QuotaExceededError');
      });

      expect(() =>
        storage.createConfig({
          name: 'Test Config',
          inhaleTime: 4,
          inhaleHoldTime: 0,
          exhaleTime: 4,
          exhaleHoldTime: 0,
          repetitions: 3,
          targetSets: 0,
          restBetweenSetsSeconds: 0,
          extendedHoldEnabled: false,
          extendedHoldType: 'EXHALE',
          extendedHoldMode: 'TOLERANCE',
          extendedHoldDuration: 30,
          secondExtendedHoldEnabled: false,
          secondExtendedHoldType: 'INHALE',
          secondExtendedHoldMode: 'TIMED',
          secondExtendedHoldDuration: 30,
          soundEnabled: false,
          soundTheme: 'wood',
          ttsEnabled: false,
        })
      ).toThrow(/could not be saved/i);
      expect(storage.getAllConfigs()).toHaveLength(0);
    });

    it('rolls back a nested session mutation when persistence fails', () => {
      const storage = useStorage();
      const config = storage.createConfig(createTestConfigInput({ name: 'Rollback Session' }));
      const session = storage.createSession(config);
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new DOMException('Storage full', 'QuotaExceededError');
      });

      expect(() =>
        storage.addSetToSession(session.id!, {
          setNumber: 1,
          completedRepetitions: 3,
          startedAt: new Date(),
          completedAt: new Date(),
          extendedHolds: [],
        })
      ).toThrow(/could not be saved/i);
      expect(storage.getSession(session.id!)).toMatchObject({
        id: session.id,
        status: 'IN_PROGRESS',
        completedSets: 0,
        sets: [],
      });
    });

    it('handles invalid JSON in localStorage', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('{invalid-json');
      const storage = useStorage();
      // useStorage should fall back to defaults if JSON parsing fails
      expect(storage.configs).toBeDefined();
      expect(storage.DEFAULT_BREATHING_CONFIG).toBeDefined();
    });
  });

  describe('useStorage loadFromStorage behavior', () => {
    it('reconciles sessions left in progress by an interrupted app process', async () => {
      vi.resetModules();
      const startedAt = new Date('2026-07-25T10:00:00.000Z');
      const configId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();
      const mockLS = {
        getItem: vi.fn((key: string) =>
          key === 'breath-in-flow-sessions'
            ? JSON.stringify([
                {
                  id: sessionId,
                  configId,
                  configSnapshot: { id: configId, ...DEFAULT_BREATHING_CONFIG },
                  status: 'IN_PROGRESS',
                  sets: [],
                  targetSets: 1,
                  completedSets: 0,
                  startedAt: startedAt.toISOString(),
                },
              ])
            : null
        ),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      };
      Object.defineProperty(globalThis, 'localStorage', { value: mockLS });

      const mod = await import('../../src/composables/useStorage');
      const recovered = mod.useStorage().getSession(sessionId);

      expect(recovered?.status).toBe('CANCELLED');
      expect(recovered?.completedAt).toBeInstanceOf(Date);
      expect(mockLS.setItem).toHaveBeenCalledWith(
        'breath-in-flow-sessions',
        expect.stringContaining('"status":"CANCELLED"')
      );
    });

    it('parses sessions from localStorage and converts date strings to Date objects', async () => {
      vi.resetModules();

      const now = new Date();
      const configId = crypto.randomUUID();
      const storedSessions = [
        {
          id: crypto.randomUUID(),
          configId,
          configSnapshot: { id: configId, name: 'C' },
          status: 'COMPLETED',
          sets: [],
          targetSets: 1,
          completedSets: 1,
          startedAt: now.toISOString(),
          completedAt: now.toISOString(),
        },
      ];

      const mockLS = {
        getItem: vi.fn((k: string) => {
          if (k === 'breath-in-flow-sessions') return JSON.stringify(storedSessions);
          return null;
        }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      };

      Object.defineProperty(globalThis, 'localStorage', {
        value: mockLS,
      });

      const mod = await import('../../src/composables/useStorage');
      const storage = mod.useStorage();

      const sessions = storage.getAllSessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0].startedAt).toBeInstanceOf(Date);
      expect(sessions[0].completedAt).toBeInstanceOf(Date);
    });

    it('backfills stored config defaults and restores config date fields', async () => {
      vi.resetModules();

      const now = new Date();
      const storedConfigs = [
        {
          id: crypto.randomUUID(),
          name: 'Stored Partial Config',
          inhaleTime: 5,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      ];

      const mockLS = {
        getItem: vi.fn((key: string) => {
          if (key === 'breath-in-flow-configs') return JSON.stringify(storedConfigs);
          return null;
        }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      };

      Object.defineProperty(globalThis, 'localStorage', {
        value: mockLS,
      });

      const mod = await import('../../src/composables/useStorage');
      const storage = mod.useStorage();

      const configs = storage.getAllConfigs();
      expect(configs).toHaveLength(1);
      expect(configs[0].inhaleTime).toBe(5);
      expect(configs[0].exhaleTime).toBe(DEFAULT_BREATHING_CONFIG.exhaleTime);
      expect(configs[0].ttsEnabled).toBe(DEFAULT_BREATHING_CONFIG.ttsEnabled);
      expect(configs[0].createdAt).toBeInstanceOf(Date);
      expect(configs[0].updatedAt).toBeInstanceOf(Date);
    });

    it('loads valid storage siblings while skipping malformed configs and sessions', async () => {
      vi.resetModules();

      const now = new Date().toISOString();
      const configId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();
      const mockLS = {
        getItem: vi.fn((key: string) => {
          if (key === 'breath-in-flow-configs') {
            return JSON.stringify([
              { id: configId, name: 'Legacy config', createdAt: now, updatedAt: now },
              { id: 42, name: 'Corrupt config' },
            ]);
          }
          if (key === 'breath-in-flow-sessions') {
            return JSON.stringify([
              {
                id: sessionId,
                configId,
                configSnapshot: { id: configId, ...DEFAULT_BREATHING_CONFIG },
                status: 'COMPLETED',
                sets: [],
                targetSets: 0,
                completedSets: 0,
                startedAt: now,
                completedAt: now,
              },
              {
                id: crypto.randomUUID(),
                configSnapshot: { ...DEFAULT_BREATHING_CONFIG },
                status: 'COMPLETED',
                sets: [],
                targetSets: 0,
                completedSets: 0,
                startedAt: 'not-a-date',
                completedAt: now,
              },
            ]);
          }
          return null;
        }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      };

      Object.defineProperty(globalThis, 'localStorage', { value: mockLS });

      const mod = await import('../../src/composables/useStorage');
      const storage = mod.useStorage();

      expect(storage.getAllConfigs()).toEqual([
        expect.objectContaining({
          id: configId,
          exhaleTime: DEFAULT_BREATHING_CONFIG.exhaleTime,
          ttsEnabled: DEFAULT_BREATHING_CONFIG.ttsEnabled,
        }),
      ]);
      expect(storage.getAllSessions()).toHaveLength(1);
      expect(storage.getAllSessions()[0].id).toBe(sessionId);
    });

    it('handles localStorage.getItem throwing (load failure) without throwing', async () => {
      vi.resetModules();

      const mockLS = {
        getItem: vi.fn(() => {
          throw new Error('fail');
        }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      };

      Object.defineProperty(globalThis, 'localStorage', {
        value: mockLS,
      });

      // Importing should not throw because loadFromStorage catches errors
      const mod = await import('../../src/composables/useStorage');
      const storage = mod.useStorage();

      expect(storage.getAllConfigs().length).toBeGreaterThanOrEqual(0);
      expect(storage.getAllSessions().length).toBeGreaterThanOrEqual(0);
    });

    it('handles invalid JSON in localStorage for configs', async () => {
      vi.resetModules();

      const mockLS = {
        getItem: vi.fn((key: string) => {
          if (key === 'breath-in-flow-configs') {
            return '{invalid json}';
          }
          return null;
        }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      };

      Object.defineProperty(globalThis, 'localStorage', {
        value: mockLS,
      });

      const mod = await import('../../src/composables/useStorage');
      const storage = mod.useStorage();

      expect(storage.getAllConfigs().length).toBeGreaterThanOrEqual(0);
    });

    it('continues loading other storage buckets when one bucket is corrupt', async () => {
      vi.resetModules();

      const now = new Date();
      const storedSessions = [
        {
          id: crypto.randomUUID(),
          configId: undefined,
          configSnapshot: { ...DEFAULT_BREATHING_CONFIG, name: 'Snapshot' },
          status: 'COMPLETED',
          sets: [],
          targetSets: 0,
          completedSets: 0,
          startedAt: now.toISOString(),
          completedAt: now.toISOString(),
        },
      ];

      const mockLS = {
        getItem: vi.fn((key: string) => {
          if (key === 'breath-in-flow-configs') return '{invalid json}';
          if (key === 'breath-in-flow-sessions') return JSON.stringify(storedSessions);
          if (key === 'breath-in-flow-sound-theme') return 'chimes';
          return null;
        }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      };

      Object.defineProperty(globalThis, 'localStorage', {
        value: mockLS,
      });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mod = await import('../../src/composables/useStorage');
      const storage = mod.useStorage();

      expect(storage.getAllSessions()).toHaveLength(1);
      expect(storage.getAllSessions()[0].startedAt).toBeInstanceOf(Date);
      expect(storage.getSoundTheme()).toBe('chimes');

      consoleErrorSpy.mockRestore();
    });

    it('handles invalid JSON in localStorage for sessions', async () => {
      vi.resetModules();

      const mockLS = {
        getItem: vi.fn((key: string) => {
          if (key === 'breath-in-flow-sessions') {
            return '{invalid json}';
          }
          return null;
        }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      };

      Object.defineProperty(globalThis, 'localStorage', {
        value: mockLS,
      });

      const mod = await import('../../src/composables/useStorage');
      const storage = mod.useStorage();

      expect(storage.getAllSessions().length).toBeGreaterThanOrEqual(0);
    });

    it('reports setItem failures and leaves no unsaved in-memory record', () => {
      const mockLS = {
        getItem: vi.fn(() => null),
        setItem: vi.fn(() => {
          throw new Error('quota exceeded');
        }),
        removeItem: vi.fn(),
        clear: vi.fn(),
      };

      Object.defineProperty(globalThis, 'localStorage', {
        value: mockLS,
      });

      // Suppress console.error for this test since we're testing error handling
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const storage = useStorage();
      const config = createTestConfigInput();

      expect(() => storage.createConfig(config)).toThrow(/could not be saved/i);
      expect(storage.getAllConfigs()).toHaveLength(0);

      consoleErrorSpy.mockRestore();
    });

    it('updateSession returns undefined when session not found', () => {
      const storage = useStorage();
      resetStorageForTesting();

      const result = storage.updateSession('nonexistent-id', { notes: 'Updated' });

      expect(result).toBeUndefined();
    });

    it('updateSession successfully updates an existing session', () => {
      const storage = useStorage();
      resetStorageForTesting();

      const config = createTestConfigInput();
      const session = storage.createSession(config);

      const updatedSession = storage.updateSession(session.id!, { notes: 'Updated notes' });

      expect(updatedSession).toBeDefined();
      expect(updatedSession?.notes).toBe('Updated notes');
    });

    it('addSetToSession returns undefined when session not found', () => {
      const storage = useStorage();
      resetStorageForTesting();

      const mockSet: SessionSet = {
        setNumber: 1,
        completedRepetitions: 5,
        extendedHolds: [],
        startedAt: new Date(),
      };

      const result = storage.addSetToSession('nonexistent-id', mockSet);

      expect(result).toBeUndefined();
    });

    it('addSetToSession successfully adds a set to session', () => {
      const storage = useStorage();
      resetStorageForTesting();

      const config = createTestConfigInput();
      const session = storage.createSession(config);

      const mockSet: SessionSet = {
        setNumber: 1,
        completedRepetitions: 5,
        extendedHolds: [],
        startedAt: new Date(),
      };

      const result = storage.addSetToSession(session.id!, mockSet);

      expect(result).toBeDefined();
      expect(result?.sets.length).toBe(1);
    });

    it('addExtendedHoldToSet returns undefined when session not found', () => {
      const storage = useStorage();
      resetStorageForTesting();

      const hold: ExtendedHoldRecord = {
        type: 'EXHALE',
        mode: 'TIMED',
        actualDuration: 30,
        completedAt: new Date(),
      };

      const result = storage.addExtendedHoldToSet('nonexistent-id', 0, hold);

      expect(result).toBeUndefined();
    });

    it('addExtendedHoldToSet returns undefined when set index not found', () => {
      const storage = useStorage();
      resetStorageForTesting();

      const config = createTestConfigInput();
      const session = storage.createSession(config);

      const hold: ExtendedHoldRecord = {
        type: 'EXHALE',
        mode: 'TIMED',
        actualDuration: 30,
        completedAt: new Date(),
      };

      const result = storage.addExtendedHoldToSet(session.id!, 99, hold); // Invalid set index

      expect(result).toBeUndefined();
    });

    it('addExtendedHoldToSet successfully adds hold to existing set', () => {
      const storage = useStorage();
      resetStorageForTesting();

      const config = createTestConfigInput();
      const session = storage.createSession(config);

      const mockSet: SessionSet = {
        setNumber: 1,
        completedRepetitions: 5,
        extendedHolds: [],
        startedAt: new Date(),
      };

      storage.addSetToSession(session.id!, mockSet);

      const hold: ExtendedHoldRecord = {
        type: 'EXHALE',
        mode: 'TIMED',
        actualDuration: 30,
        completedAt: new Date(),
      };

      const result = storage.addExtendedHoldToSet(session.id!, 0, hold);

      expect(result).toBeDefined();
      expect(result?.sets[0].extendedHolds.length).toBe(1);
    });

    it('skips sessions with null required date fields from localStorage', async () => {
      vi.resetModules();

      const mockLS = {
        getItem: vi.fn((key: string) => {
          if (key === 'breath-in-flow-sessions') {
            // Simulate stored session with null completedAt
            return JSON.stringify([
              {
                id: 's1',
                configId: 'c1',
                configSnapshot: {},
                status: 'IN_PROGRESS',
                sets: [],
                targetSets: 1,
                completedSets: 0,
                startedAt: new Date().toISOString(),
                completedAt: null, // null date field
                notes: '',
              },
            ]);
          }
          return null;
        }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      };

      Object.defineProperty(globalThis, 'localStorage', {
        value: mockLS,
      });

      const mod = await import('../../src/composables/useStorage');
      const storage = mod.useStorage();
      const sessions = storage.getAllSessions();

      expect(sessions).toEqual([]);
    });
  });

  describe('Sound Theme Operations', () => {
    beforeEach(() => {
      localStorageMock.clear();
      resetStorageForTesting();
    });

    it('should start with default theme', () => {
      const storage = useStorage();
      expect(storage.getSoundTheme()).toBe('wood');
    });

    it('should set and get sound theme', () => {
      const storage = useStorage();

      storage.setSoundTheme('water');
      expect(storage.getSoundTheme()).toBe('water');

      storage.setSoundTheme('wind');
      expect(storage.getSoundTheme()).toBe('wind');

      storage.setSoundTheme('subtle');
      expect(storage.getSoundTheme()).toBe('subtle');

      storage.setSoundTheme('chimes');
      expect(storage.getSoundTheme()).toBe('chimes');

      storage.setSoundTheme('wood');
      expect(storage.getSoundTheme()).toBe('wood');
    });

    it('should persist sound theme to localStorage', () => {
      const storage = useStorage();

      storage.setSoundTheme('water');

      expect(localStorageMock.setItem).toHaveBeenCalledWith('breath-in-flow-sound-theme', 'water');
    });

    it('should load sound theme from localStorage on init', async () => {
      localStorageMock.setItem('breath-in-flow-sound-theme', 'chimes');

      // Re-import to trigger loadFromStorage
      vi.resetModules();
      const mod = await import('../../src/composables/useStorage');
      const storage = mod.useStorage();

      expect(storage.getSoundTheme()).toBe('chimes');
    });

    it('should ignore invalid stored sound themes', async () => {
      localStorageMock.setItem('breath-in-flow-sound-theme', 'invalid-theme');

      vi.resetModules();
      const mod = await import('../../src/composables/useStorage');
      const storage = mod.useStorage();

      expect(storage.getSoundTheme()).toBe('wood');
    });

    it('should expose soundTheme as reactive ref', () => {
      const storage = useStorage();

      expect(storage.soundTheme.value).toBe('wood');

      storage.setSoundTheme('wind');
      expect(storage.soundTheme.value).toBe('wind');
    });

    it('should reset sound theme on resetStorageForTesting', () => {
      const storage = useStorage();

      storage.setSoundTheme('chimes');
      expect(storage.getSoundTheme()).toBe('chimes');

      resetStorageForTesting();
      expect(storage.getSoundTheme()).toBe('wood');
    });

    it('should handle all valid theme values', () => {
      const storage = useStorage();
      const themes: Array<'wood' | 'water' | 'wind' | 'subtle' | 'chimes'> = [
        'wood',
        'water',
        'wind',
        'subtle',
        'chimes',
      ];

      themes.forEach((theme) => {
        storage.setSoundTheme(theme);
        expect(storage.getSoundTheme()).toBe(theme);
      });
    });
  });

  describe('Snapshot repository (backup)', () => {
    beforeEach(() => {
      resetStorageForTesting();
      localStorageMock.clear();
    });

    function makeStoredConfig(overrides: Partial<BreathingConfig> = {}): BreathingConfig {
      return {
        ...createTestConfigInput(),
        id: crypto.randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      } as BreathingConfig;
    }

    function makeStoredSession(overrides: Record<string, unknown> = {}) {
      const config = makeStoredConfig();
      return {
        id: crypto.randomUUID(),
        configId: config.id,
        configSnapshot: config,
        status: 'COMPLETED',
        sets: [],
        targetSets: 1,
        completedSets: 0,
        startedAt: new Date(),
        completedAt: new Date(),
        ...overrides,
      };
    }

    it('exportPracticeState returns detached copies so mutations do not leak into live state', () => {
      const storage = useStorage();
      const config = storage.createConfig(createTestConfigInput({ name: 'Export Config' }));
      storage.createSession(config);
      storage.setSoundTheme('water');

      const snapshot = storage.exportPracticeState();
      expect(snapshot.configs).toHaveLength(1);
      expect(snapshot.sessions).toHaveLength(1);
      expect(snapshot.soundTheme).toBe('water');

      snapshot.configs[0].name = 'Mutated Export';
      snapshot.sessions[0].status = 'CANCELLED';

      expect(storage.getAllConfigs()[0].name).toBe('Export Config');
      expect(storage.getAllSessions()[0].status).toBe('IN_PROGRESS');
    });

    it('replacePracticeState swaps every record and the theme', () => {
      const storage = useStorage();
      storage.createConfig(createTestConfigInput({ name: 'Stale' }));

      const config = makeStoredConfig({ name: 'Restored' });
      const session = makeStoredSession({ configId: config.id, configSnapshot: config });
      const snapshot: PracticeStorageSnapshot = {
        configs: [config],
        sessions: [session] as PracticeStorageSnapshot['sessions'],
        soundTheme: 'chimes',
      };
      storage.replacePracticeState(snapshot);

      expect(storage.getAllConfigs()).toHaveLength(1);
      expect(storage.getAllConfigs()[0].name).toBe('Restored');
      expect(storage.getAllSessions()).toHaveLength(1);
      expect(storage.getAllSessions()[0].id).toBe(session.id);
      expect(storage.getSoundTheme()).toBe('chimes');
    });

    it('preserves Date instances after replacement', () => {
      const storage = useStorage();
      const startedAt = new Date('2026-01-02T03:04:05.000Z');
      const session = makeStoredSession({ startedAt, completedAt: startedAt });

      storage.replacePracticeState({
        configs: [session.configSnapshot as BreathingConfig],
        sessions: [session] as PracticeStorageSnapshot['sessions'],
        soundTheme: 'wood',
      });

      const stored = storage.getAllSessions()[0];
      expect(stored.startedAt).toBeInstanceOf(Date);
      expect(stored.startedAt.getTime()).toBe(startedAt.getTime());
      expect(stored.configSnapshot.createdAt).toBeInstanceOf(Date);
    });

    it('rejects the whole replacement when one record is invalid and leaves live state untouched', () => {
      const storage = useStorage();
      const original = storage.createConfig(createTestConfigInput({ name: 'Keep Me' }));
      storage.setSoundTheme('wind');

      const validConfig = makeStoredConfig();
      const invalidConfig = { ...makeStoredConfig(), name: '' }; // name.min(1) fails

      expect(() =>
        storage.replacePracticeState({
          configs: [validConfig, invalidConfig as BreathingConfig],
          sessions: [],
          soundTheme: 'water',
        })
      ).toThrow();

      expect(storage.getAllConfigs()).toEqual([original]);
      expect(storage.getSoundTheme()).toBe('wind');
    });

    it('restores previous refs and rethrows when persistence fails', () => {
      const storage = useStorage();
      const original = storage.createConfig(createTestConfigInput({ name: 'Durable' }));
      storage.setSoundTheme('subtle');

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const setItemSpy = vi.spyOn(localStorageMock, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded');
      });

      const config = makeStoredConfig({ name: 'Should Not Persist' });
      expect(() =>
        storage.replacePracticeState({
          configs: [config],
          sessions: [],
          soundTheme: 'chimes',
        })
      ).toThrow('quota exceeded');

      setItemSpy.mockRestore();
      consoleErrorSpy.mockRestore();

      expect(storage.getAllConfigs()).toEqual([original]);
      expect(storage.getSoundTheme()).toBe('subtle');
    });
  });
});
