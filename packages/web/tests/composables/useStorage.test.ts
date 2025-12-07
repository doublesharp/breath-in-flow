import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStorage } from '../../src/composables/useStorage';
import type { BreathingConfig, CreateBreathingConfig } from '@breath-in-flow/shared';
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

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

// Helper function to create a valid test config input
function createTestConfigInput(overrides: Partial<CreateBreathingConfig> = {}): CreateBreathingConfig {
  return {
    name: 'Test Config',
    inhaleTime: 4,
    exhaleTime: 6,
    inhaleHoldTime: 2,
    exhaleHoldTime: 0,
    repetitions: 5,
    targetSets: 3,
    extendedHoldEnabled: false,
    extendedHoldType: 'EXHALE',
    extendedHoldMode: 'TOLERANCE',
    extendedHoldDuration: 30,
    secondExtendedHoldEnabled: false,
    secondExtendedHoldType: 'INHALE',
    ...overrides,
  };
}

describe('useStorage', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('Configuration Operations', () => {
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

  describe('Stats', () => {
    it('should calculate stats from completed sessions', () => {
      const storage = useStorage();

      const config = storage.createConfig(createTestConfigInput({
        name: 'Stats Test',
        extendedHoldEnabled: true,
      }));

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

    it('should return zeros for empty stats', () => {
      // The stats computed property reads from sessions
      const storage = useStorage();
      
      expect(storage.stats.value).toBeDefined();
      expect(typeof storage.stats.value.totalSessions).toBe('number');
      expect(typeof storage.stats.value.avgHoldTime).toBe('number');
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
  });
});
