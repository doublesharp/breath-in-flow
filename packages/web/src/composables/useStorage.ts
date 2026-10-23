import { ref, computed, isProxy, toRaw, type Ref } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import type {
  BreathingConfig,
  CreateBreathingConfig,
  Session,
  SessionCheckIn,
  SessionSet,
  ExtendedHoldRecord,
  SoundTheme,
} from '@breath-in-flow/shared';
import {
  BreathingConfigSchema,
  DEFAULT_BREATHING_CONFIG,
  SessionCheckInSchema,
  SessionSchema,
  SoundThemeSchema,
} from '@breath-in-flow/shared';
import { assertUniqueRecordIds, validateStoredArray } from '@/utils/storedRecordValidation';
import {
  CONFIGS_STORAGE_KEY,
  SESSIONS_STORAGE_KEY,
  SOUND_THEME_STORAGE_KEY,
} from '@/constants/storageKeys';

// A detached, non-reactive copy of practice state for backup/restore work.
export interface PracticeStorageSnapshot {
  configs: BreathingConfig[];
  sessions: Session[];
  soundTheme: SoundTheme;
}

export class PracticeStorageError extends Error {
  constructor(operation: string, options?: ErrorOptions) {
    super(`${operation} could not be saved. Your previous data is still intact.`, options);
    this.name = 'PracticeStorageError';
  }
}

// Simple in-memory storage for now (can be replaced with IndexedDB or API calls)
const configs = ref<BreathingConfig[]>([]);
const sessions = ref<Session[]>([]);
const soundTheme = ref<SoundTheme>('wood');

const STORAGE_DATE_FIELDS = ['startedAt', 'completedAt', 'createdAt', 'updatedAt'] as const;

function loadValueFromStorage(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch (e) {
    console.error(`Failed to load ${key} from storage:`, e);
    return undefined;
  }
}

function loadStringFromStorage(key: string): string | undefined {
  return loadValueFromStorage(key);
}

function restoreDateFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(restoreDateFields);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      STORAGE_DATE_FIELDS.includes(key as (typeof STORAGE_DATE_FIELDS)[number]) && nestedValue
        ? new Date(nestedValue as string)
        : restoreDateFields(nestedValue),
    ])
  );
}

// Load from localStorage on init
function loadFromStorage() {
  configs.value = validateStoredArray({
    key: CONFIGS_STORAGE_KEY,
    value: loadValueFromStorage(CONFIGS_STORAGE_KEY),
    schema: BreathingConfigSchema,
    normalize: restoreDateFields,
    getId: (config) => config.id,
  });

  sessions.value = validateStoredArray({
    key: SESSIONS_STORAGE_KEY,
    value: loadValueFromStorage(SESSIONS_STORAGE_KEY),
    schema: SessionSchema,
    normalize: restoreDateFields,
    getId: (session) => session.id,
  });

  const storedTheme = loadStringFromStorage(SOUND_THEME_STORAGE_KEY);
  if (storedTheme) {
    const parsedTheme = SoundThemeSchema.safeParse(storedTheme);
    soundTheme.value = parsedTheme.success ? parsedTheme.data : 'wood';
  }
}

// Writes the current practice state to localStorage. Throws on failure so
// callers that need to react to a failed write (e.g. restore) can roll back.
function persistPracticeState() {
  localStorage.setItem(CONFIGS_STORAGE_KEY, JSON.stringify(configs.value));
  localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions.value));
  localStorage.setItem(SOUND_THEME_STORAGE_KEY, soundTheme.value);
}

function persistMutation<T, Result>(
  state: Ref<T>,
  storageKey: string,
  operation: string,
  mutate: () => Result
): Result {
  const previous = detachForExport(state.value);
  const result = mutate();
  try {
    localStorage.setItem(storageKey, JSON.stringify(state.value));
    return result;
  } catch (error) {
    state.value = previous;
    throw new PracticeStorageError(operation, { cause: error });
  }
}

// Initialize storage
loadFromStorage();

function reconcileInterruptedSessions() {
  if (!sessions.value.some((session) => session.status === 'IN_PROGRESS')) return;

  const recoveredAt = new Date();
  const previous = sessions.value;
  sessions.value = sessions.value.map((session) =>
    session.status === 'IN_PROGRESS'
      ? { ...session, status: 'CANCELLED' as const, completedAt: recoveredAt }
      : session
  );
  try {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions.value));
  } catch (error) {
    sessions.value = previous;
    console.error('Failed to reconcile an interrupted breathing session:', error);
  }
}

reconcileInterruptedSessions();

// For testing: reset the storage state
export function resetStorageForTesting() {
  configs.value = [];
  sessions.value = [];
  soundTheme.value = 'wood';
}

function unwrapReactiveValue(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (value === null || typeof value !== 'object') return value;

  const source = isProxy(value) ? toRaw(value) : value;
  if (source instanceof Date) return new Date(source.getTime());

  const existing = seen.get(source);
  if (existing) return existing;

  if (Array.isArray(source)) {
    const result: unknown[] = [];
    seen.set(source, result);
    source.forEach((item) => result.push(unwrapReactiveValue(item, seen)));
    return result;
  }

  const result: Record<string | symbol, unknown> = {};
  seen.set(source, result);
  for (const key of Reflect.ownKeys(source)) {
    result[key] = unwrapReactiveValue(Reflect.get(source, key), seen);
  }
  return result;
}

// Produces a detached, non-reactive deep copy. Vue's toRaw is shallow, so
// recursively unwrap nested proxies before asking structuredClone to preserve
// Date instances and other supported platform values.
function detachForExport<T>(value: T): T {
  const source = unwrapReactiveValue(value);

  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(source) as T;
    }
  } catch (error) {
    console.warn('structuredClone failed, falling back to JSON copy', error);
  }

  return JSON.parse(JSON.stringify(source)) as T;
}

function cloneConfig(config: BreathingConfig): BreathingConfig {
  return detachForExport(config);
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
    return persistMutation(configs, CONFIGS_STORAGE_KEY, 'Breathing preset', () => {
      configs.value.push(config);
      return config;
    });
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

    return persistMutation(configs, CONFIGS_STORAGE_KEY, 'Breathing preset', () => {
      configs.value[index] = {
        ...configs.value[index],
        ...updates,
        updatedAt: new Date(),
      };
      return configs.value[index];
    });
  }

  function deleteConfig(id: string): boolean {
    const index = configs.value.findIndex((c) => c.id === id);
    if (index === -1) return false;

    persistMutation(configs, CONFIGS_STORAGE_KEY, 'Breathing preset', () => {
      configs.value.splice(index, 1);
    });
    return true;
  }

  // Session operations
  function createSession(config: BreathingConfig, checkIn?: SessionCheckIn): Session {
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
      ...(checkIn ? { checkIn: SessionCheckInSchema.parse(checkIn) } : {}),
    };
    return persistMutation(sessions, SESSIONS_STORAGE_KEY, 'Breathing session', () => {
      sessions.value.unshift(session); // Add to beginning
      return session;
    });
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

    return persistMutation(sessions, SESSIONS_STORAGE_KEY, 'Breathing session', () => {
      sessions.value[index] = {
        ...sessions.value[index],
        ...updates,
      };
      return sessions.value[index];
    });
  }

  function addSetToSession(sessionId: string, set: SessionSet): Session | undefined {
    const session = getSession(sessionId);
    if (!session) return undefined;

    return persistMutation(sessions, SESSIONS_STORAGE_KEY, 'Breathing session', () => {
      session.sets.push(set);
      session.completedSets = session.sets.filter((s) => s.completedAt).length;
      return session;
    });
  }

  function addExtendedHoldToSet(
    sessionId: string,
    setIndex: number,
    hold: ExtendedHoldRecord
  ): Session | undefined {
    const session = getSession(sessionId);
    if (!session || !session.sets[setIndex]) return undefined;

    return persistMutation(sessions, SESSIONS_STORAGE_KEY, 'Breathing session', () => {
      session.sets[setIndex].extendedHolds.push(hold);
      return session;
    });
  }

  function completeSession(id: string): Session | undefined {
    const session = getSession(id);
    if (!session || session.status === 'COMPLETED') return session;

    return updateSession(id, {
      status: 'COMPLETED',
      completedAt: new Date(),
    });
  }

  function setSessionCheckIn(id: string, updates: Partial<SessionCheckIn>): Session | undefined {
    const session = getSession(id);
    if (!session) return undefined;
    const parsed = SessionCheckInSchema.safeParse({ ...session.checkIn, ...updates });
    if (!parsed.success) return undefined;
    return updateSession(id, { checkIn: parsed.data });
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

    persistMutation(sessions, SESSIONS_STORAGE_KEY, 'Breathing session', () => {
      sessions.value.splice(index, 1);
    });
    return true;
  }

  function deleteAllSessions(): void {
    persistMutation(sessions, SESSIONS_STORAGE_KEY, 'Breathing history', () => {
      sessions.value = [];
    });
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

  // Sound theme operations
  function getSoundTheme(): SoundTheme {
    return soundTheme.value;
  }

  function setSoundTheme(theme: SoundTheme) {
    const previous = soundTheme.value;
    soundTheme.value = theme;
    try {
      localStorage.setItem(SOUND_THEME_STORAGE_KEY, theme);
    } catch (error) {
      soundTheme.value = previous;
      throw new PracticeStorageError('Sound preference', { cause: error });
    }
  }

  // Backup repository operations
  function exportPracticeState(): PracticeStorageSnapshot {
    return {
      configs: detachForExport(configs.value),
      sessions: detachForExport(sessions.value),
      soundTheme: soundTheme.value,
    };
  }

  function replacePracticeState(snapshot: PracticeStorageSnapshot): void {
    // Validate every record and the theme before mutating any state so a single
    // invalid entry rejects the whole replacement with live state untouched.
    const parsedTheme = SoundThemeSchema.safeParse(snapshot.soundTheme);
    if (!parsedTheme.success) throw new TypeError('Cannot restore an invalid sound theme.');

    const nextConfigs: BreathingConfig[] = [];
    for (const config of snapshot.configs) {
      const parsed = BreathingConfigSchema.safeParse(restoreDateFields(config));
      if (!parsed.success) throw new TypeError('Cannot restore an invalid breathing config.');
      nextConfigs.push(parsed.data);
    }

    const nextSessions: Session[] = [];
    for (const session of snapshot.sessions) {
      const parsed = SessionSchema.safeParse(restoreDateFields(session));
      if (!parsed.success) throw new TypeError('Cannot restore an invalid session.');
      nextSessions.push(parsed.data);
    }

    assertUniqueRecordIds(nextConfigs, 'Breathing configs');
    assertUniqueRecordIds(nextSessions, 'Sessions');

    const previousConfigs = configs.value;
    const previousSessions = sessions.value;
    const previousTheme = soundTheme.value;

    configs.value = nextConfigs;
    sessions.value = nextSessions;
    soundTheme.value = parsedTheme.data;

    try {
      persistPracticeState();
    } catch (error) {
      // A failed write must not be observable: restore the prior refs.
      configs.value = previousConfigs;
      sessions.value = previousSessions;
      soundTheme.value = previousTheme;
      throw error;
    }
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
    setSessionCheckIn,
    cancelSession,
    deleteSession,
    deleteAllSessions,

    // Sound theme operations
    getSoundTheme,
    setSoundTheme,

    // Backup repository operations
    exportPracticeState,
    replacePracticeState,

    // Default
    DEFAULT_BREATHING_CONFIG,
  };
}
