import { ref, computed } from 'vue';
import type { UserGoal, UserPreferences } from '@breath-in-flow/shared';
import { UserPreferencesSchema } from '@breath-in-flow/shared';
import { PREFERENCES_STORAGE_KEY } from '@/constants/storageKeys';

// Module-scoped singleton so every caller shares one reactive source of truth,
// matching the pattern in useStorage.
const preferences = ref<UserPreferences | null>(null);
const saveError = ref<string | null>(null);

const selectedGoal = computed<UserGoal | null>(() => preferences.value?.goal ?? null);
const needsOnboarding = computed(() => preferences.value === null);

function clonePreferences(prefs: UserPreferences): UserPreferences {
  return JSON.parse(JSON.stringify(prefs)) as UserPreferences;
}

// Any read failure — blocked storage, corrupt JSON, or a schema mismatch — is
// treated as "no preference yet" so the app falls back to onboarding.
function readPreferencesFromStorage(): UserPreferences | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to read preferences from storage:', error);
    return null;
  }
  if (!raw) return null;

  try {
    const result = UserPreferencesSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch (error) {
    console.error('Failed to parse stored preferences:', error);
    return null;
  }
}

// Validates on every write and only mutates reactive state after the value is
// safely persisted, so a quota failure leaves the previous value intact.
function writePreferences(next: UserPreferences | null): void {
  const validated = next === null ? null : UserPreferencesSchema.parse(next);
  try {
    if (validated === null) {
      localStorage.removeItem(PREFERENCES_STORAGE_KEY);
    } else {
      localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(validated));
    }
  } catch (error) {
    throw new Error(
      'Your preferences could not be saved. Check your storage settings or free up space, then try again.',
      { cause: error }
    );
  }
  preferences.value = validated;
  saveError.value = null;
}

function savePreferences(next: UserPreferences | null): boolean {
  try {
    writePreferences(next);
    return true;
  } catch (error) {
    saveError.value = (error as Error).message;
    return false;
  }
}

preferences.value = readPreferencesFromStorage();

// Re-reads storage into the singleton; used by tests to simulate an app reload.
export function reloadPreferencesForTesting(): void {
  preferences.value = readPreferencesFromStorage();
  saveError.value = null;
}

export function usePreferences() {
  function setGoal(goal: UserGoal): boolean {
    return savePreferences({ version: 1, goal });
  }

  function clearGoal(): boolean {
    return savePreferences(null);
  }

  // Returns a detached copy so the backup service can serialize without
  // exposing the live reactive object.
  function exportPreferences(): UserPreferences | null {
    return preferences.value === null ? null : clonePreferences(preferences.value);
  }

  // Atomic replacement for backup: a rejected write leaves both storage and
  // reactive state unchanged, and must throw so the coordinator can roll back.
  function replacePreferences(next: UserPreferences | null): void {
    writePreferences(next);
  }

  return {
    preferences,
    selectedGoal,
    needsOnboarding,
    saveError,
    setGoal,
    clearGoal,
    exportPreferences,
    replacePreferences,
  };
}
