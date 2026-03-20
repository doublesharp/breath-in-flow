import { ref, computed, isProxy, toRaw } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import type {
  BreathingConfig,
  CreateBreathingConfig,
  Session,
  SessionSet,
  ExtendedHoldRecord,
  SoundTheme,
  AssessmentResult,
} from '@breath-in-flow/shared';
import { DEFAULT_BREATHING_CONFIG } from '@breath-in-flow/shared';

// Simple in-memory storage for now (can be replaced with IndexedDB or API calls)
const configs = ref<BreathingConfig[]>([]);
const sessions = ref<Session[]>([]);
const soundTheme = ref<SoundTheme>('wood');
const assessments = ref<AssessmentResult[]>([]);

// Load from localStorage on init
function loadFromStorage() {
  try {
    const storedConfigs = localStorage.getItem('breath-in-flow-configs');
    if (storedConfigs) {
      configs.value = JSON.parse(storedConfigs).map((c: BreathingConfig) => ({
        ...DEFAULT_BREATHING_CONFIG,
        ...c,
      }));
    }

    const storedSessions = localStorage.getItem('breath-in-flow-sessions');
    if (storedSessions) {
      sessions.value = JSON.parse(storedSessions, (key, value) => {
        // Convert date strings back to Date objects
        if (
          key === 'startedAt' ||
          key === 'completedAt' ||
          key === 'createdAt' ||
          key === 'updatedAt'
        ) {
          return value ? new Date(value) : value;
        }
        return value;
      });
    }

    const storedTheme = localStorage.getItem('breath-in-flow-sound-theme');
    if (storedTheme) {
      soundTheme.value = storedTheme as SoundTheme;
    }

    const storedAssessments = localStorage.getItem('breath-in-flow-assessments');
    if (storedAssessments) {
      assessments.value = JSON.parse(storedAssessments, (key, value) => {
        if (key === 'completedAt') {
          return value ? new Date(value) : value;
        }
        return value;
      });
    }
  } catch (e) {
    console.error('Failed to load from storage:', e);
  }
}

function saveToStorage() {
  try {
    localStorage.setItem('breath-in-flow-configs', JSON.stringify(configs.value));
    localStorage.setItem('breath-in-flow-sessions', JSON.stringify(sessions.value));
    localStorage.setItem('breath-in-flow-sound-theme', soundTheme.value);
    localStorage.setItem('breath-in-flow-assessments', JSON.stringify(assessments.value));
  } catch (e) {
    console.error('Failed to save to storage:', e);
  }
}

// Initialize storage
loadFromStorage();

// For testing: reset the storage state
export function resetStorageForTesting() {
  configs.value = [];
  sessions.value = [];
  soundTheme.value = 'wood';
  assessments.value = [];
}

function cloneConfig(config: BreathingConfig): BreathingConfig {
  const source = isProxy(config) ? toRaw(config) : config;

  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(source);
    }
  } catch (error) {
    console.warn('structuredClone failed, falling back to JSON copy', error);
  }

  return JSON.parse(JSON.stringify(source)) as BreathingConfig;
}

export function useStorage() {
  // Config operations
  function createConfig(input: CreateBreathingConfig): BreathingConfig {
    const config: BreathingConfig = {
      ...input,
      ttsEnabled: input.ttsEnabled ?? DEFAULT_BREATHING_CONFIG.ttsEnabled,
      ttsVoice: input.ttsVoice ?? DEFAULT_BREATHING_CONFIG.ttsVoice,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    configs.value.push(config);
    saveToStorage();
    return config;
  }

  function getConfig(id: string): BreathingConfig | undefined {
    return configs.value.find((c) => c.id === id);
  }

  function getAllConfigs(): BreathingConfig[] {
    return configs.value;
  }

  function updateConfig(
    id: string,
    updates: Partial<CreateBreathingConfig>
  ): BreathingConfig | undefined {
    const index = configs.value.findIndex((c) => c.id === id);
    if (index === -1) return undefined;

    configs.value[index] = {
      ...configs.value[index],
      ...updates,
      updatedAt: new Date(),
    };
    saveToStorage();
    return configs.value[index];
  }

  function deleteConfig(id: string): boolean {
    const index = configs.value.findIndex((c) => c.id === id);
    if (index === -1) return false;

    configs.value.splice(index, 1);
    saveToStorage();
    return true;
  }

  // Session operations
  function createSession(config: BreathingConfig): Session {
    // Ensure the snapshot is an immutable, non-reactive copy of the config
    const configSnapshot = cloneConfig(config);

    const session: Session = {
      id: uuidv4(),
      configId: config.id,
      configSnapshot,
      status: 'IN_PROGRESS',
      sets: [],
      targetSets: config.targetSets,
      completedSets: 0,
      startedAt: new Date(),
    };
    sessions.value.unshift(session); // Add to beginning
    saveToStorage();
    return session;
  }

  function getSession(id: string): Session | undefined {
    return sessions.value.find((s) => s.id === id);
  }

  function getAllSessions(): Session[] {
    return sessions.value;
  }

  function getRecentSessions(limit: number = 10): Session[] {
    return sessions.value.slice(0, limit);
  }

  function updateSession(id: string, updates: Partial<Session>): Session | undefined {
    const index = sessions.value.findIndex((s) => s.id === id);
    if (index === -1) return undefined;

    sessions.value[index] = {
      ...sessions.value[index],
      ...updates,
    };
    saveToStorage();
    return sessions.value[index];
  }

  function addSetToSession(sessionId: string, set: SessionSet): Session | undefined {
    const session = getSession(sessionId);
    if (!session) return undefined;

    session.sets.push(set);
    session.completedSets = session.sets.filter((s) => s.completedAt).length;
    saveToStorage();
    return session;
  }

  function addExtendedHoldToSet(
    sessionId: string,
    setIndex: number,
    hold: ExtendedHoldRecord
  ): Session | undefined {
    const session = getSession(sessionId);
    if (!session || !session.sets[setIndex]) return undefined;

    session.sets[setIndex].extendedHolds.push(hold);
    saveToStorage();
    return session;
  }

  function completeSession(id: string): Session | undefined {
    return updateSession(id, {
      status: 'COMPLETED',
      completedAt: new Date(),
    });
  }

  function cancelSession(id: string): Session | undefined {
    return updateSession(id, {
      status: 'CANCELLED',
      completedAt: new Date(),
    });
  }

  function deleteSession(id: string): boolean {
    const index = sessions.value.findIndex((s) => s.id === id);
    if (index === -1) return false;

    sessions.value.splice(index, 1);
    saveToStorage();
    return true;
  }

  function deleteAllSessions(): void {
    sessions.value = [];
    saveToStorage();
  }

  // Stats
  const stats = computed(() => {
    const completedSessions = sessions.value.filter((s) => s.status === 'COMPLETED');
    const allHolds = completedSessions.flatMap((s) => s.sets.flatMap((set) => set.extendedHolds));

    return {
      totalSessions: completedSessions.length,
      totalSets: completedSessions.reduce((acc, s) => acc + s.sets.length, 0),
      totalExtendedHolds: allHolds.length,
      avgHoldTime:
        allHolds.length > 0
          ? allHolds.reduce((acc, h) => acc + h.actualDuration, 0) / allHolds.length
          : 0,
      maxHoldTime: allHolds.length > 0 ? Math.max(...allHolds.map((h) => h.actualDuration)) : 0,
    };
  });

  // Assessment operations
  function getAssessments(): AssessmentResult[] {
    return assessments.value;
  }

  function saveAssessment(result: AssessmentResult): void {
    assessments.value.unshift(result);
    saveToStorage();
  }

  // Sound theme operations
  function getSoundTheme(): SoundTheme {
    return soundTheme.value;
  }

  function setSoundTheme(theme: SoundTheme) {
    soundTheme.value = theme;
    saveToStorage();
  }

  return {
    // State
    configs,
    sessions,
    stats,
    soundTheme,

    // Config operations
    createConfig,
    getConfig,
    getAllConfigs,
    updateConfig,
    deleteConfig,

    // Session operations
    createSession,
    getSession,
    getAllSessions,
    getRecentSessions,
    updateSession,
    addSetToSession,
    addExtendedHoldToSet,
    completeSession,
    cancelSession,
    deleteSession,
    deleteAllSessions,

    // Assessment operations
    getAssessments,
    saveAssessment,

    // Sound theme operations
    getSoundTheme,
    setSoundTheme,

    // Default
    DEFAULT_BREATHING_CONFIG,
  };
}
