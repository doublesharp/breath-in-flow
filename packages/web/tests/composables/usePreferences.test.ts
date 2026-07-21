import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { UserPreferences } from '@breath-in-flow/shared';
import {
  usePreferences,
  reloadPreferencesForTesting,
} from '../../src/composables/usePreferences';
import { PREFERENCES_STORAGE_KEY } from '../../src/constants/storageKeys';

beforeEach(() => {
  localStorage.clear();
  reloadPreferencesForTesting();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usePreferences', () => {
  it('starts in the onboarding state with no stored goal', () => {
    const state = usePreferences();
    expect(state.needsOnboarding.value).toBe(true);
    expect(state.selectedGoal.value).toBeNull();
    expect(state.preferences.value).toBeNull();
  });

  it('persists a goal as a versioned preference and updates reactive state', () => {
    const state = usePreferences();
    state.setGoal('TRAIN_DIAPHRAGM');

    expect(state.selectedGoal.value).toBe('TRAIN_DIAPHRAGM');
    expect(state.needsOnboarding.value).toBe(false);
    expect(state.preferences.value).toEqual({ version: 1, goal: 'TRAIN_DIAPHRAGM' });
    expect(JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY)!)).toEqual({
      version: 1,
      goal: 'TRAIN_DIAPHRAGM',
    });
  });

  it('hydrates a valid stored preference on reload', () => {
    localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 1, goal: 'RELAX' })
    );
    reloadPreferencesForTesting();

    const state = usePreferences();
    expect(state.needsOnboarding.value).toBe(false);
    expect(state.selectedGoal.value).toBe('RELAX');
  });

  it('treats corrupt stored JSON as needing onboarding', () => {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, 'not-valid-json{');
    reloadPreferencesForTesting();

    expect(usePreferences().needsOnboarding.value).toBe(true);
  });

  it('treats a schema-invalid stored preference as needing onboarding', () => {
    localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 2, goal: 'RELAX', extra: true })
    );
    reloadPreferencesForTesting();

    expect(usePreferences().needsOnboarding.value).toBe(true);
  });

  it('treats a storage read failure as needing onboarding', () => {
    localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 1, goal: 'RELAX' })
    );
    const getItem = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('read blocked');
    });
    reloadPreferencesForTesting();
    expect(getItem).toHaveBeenCalled();
    getItem.mockRestore();

    expect(usePreferences().needsOnboarding.value).toBe(true);
  });

  it('leaves the previous in-memory value untouched when persistence fails', () => {
    const state = usePreferences();
    state.setGoal('RELAX');

    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });
    state.setGoal('TRAIN_DIAPHRAGM');
    setItem.mockRestore();

    expect(state.selectedGoal.value).toBe('RELAX');
    expect(JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY)!)).toEqual({
      version: 1,
      goal: 'RELAX',
    });
  });

  it('clears the goal back to the onboarding state', () => {
    const state = usePreferences();
    state.setGoal('RELAX');
    state.clearGoal();

    expect(state.needsOnboarding.value).toBe(true);
    expect(localStorage.getItem(PREFERENCES_STORAGE_KEY)).toBeNull();
  });

  it('exports a detached copy of the current preferences', () => {
    const state = usePreferences();
    expect(state.exportPreferences()).toBeNull();

    state.setGoal('RELAX');
    const exported = state.exportPreferences();
    expect(exported).toEqual({ version: 1, goal: 'RELAX' });

    exported!.goal = 'TRAIN_DIAPHRAGM';
    expect(state.selectedGoal.value).toBe('RELAX');
  });

  it('replaces preferences from a detached copy of the input', () => {
    const state = usePreferences();
    const input = { version: 1, goal: 'BUILD_CONSISTENCY' } as const;
    state.replacePreferences(input);

    expect(state.selectedGoal.value).toBe('BUILD_CONSISTENCY');
    expect(JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY)!)).toEqual({
      version: 1,
      goal: 'BUILD_CONSISTENCY',
    });

    const mutable: UserPreferences = { version: 1, goal: 'RELAX' };
    state.replacePreferences(mutable);
    mutable.goal = 'TRAIN_DIAPHRAGM';
    expect(state.selectedGoal.value).toBe('RELAX');
  });

  it('replaces preferences with null to clear stored state', () => {
    const state = usePreferences();
    state.setGoal('RELAX');
    state.replacePreferences(null);

    expect(state.needsOnboarding.value).toBe(true);
    expect(localStorage.getItem(PREFERENCES_STORAGE_KEY)).toBeNull();
  });
});
