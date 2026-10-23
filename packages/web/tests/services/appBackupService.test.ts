// Uses a real IndexedDB so the round-trip exercises the actual composables the UI
// wires, proving the export/replace pairs are structurally symmetric (what a
// restore writes, an export reads back identically) and a legitimate backup
// verifies cleanly instead of false-failing at the 'verify' stage.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { createDefaultBackupService } from '../../src/services/appBackupService';
import { useStorage, resetStorageForTesting } from '../../src/composables/useStorage';
import { usePreferences } from '../../src/composables/usePreferences';
import { useHrvStorage } from '../../src/composables/useHrvStorage';
import {
  CONFIGS_STORAGE_KEY,
  SESSIONS_STORAGE_KEY,
  SOUND_THEME_STORAGE_KEY,
  PREFERENCES_STORAGE_KEY,
  LAST_CONFIG_STORAGE_KEY,
} from '../../src/constants/storageKeys';
import { DEFAULT_BREATHING_CONFIG, type AssessmentResult } from '@breath-in-flow/shared';

function storeLegacyAssessment(): AssessmentResult {
  const assessment: AssessmentResult = {
    id: crypto.randomUUID(),
    trials: [
      { rate: 6, inhaleTime: 5, exhaleTime: 5, repetitions: 5, comfortRating: 4, symptoms: [] },
    ],
    selectedRate: 6,
    completedAt: new Date('2026-01-01T00:00:00.000Z'),
    config: { warmupDurationSeconds: 120, warmupRate: 6, restDurationSeconds: 120 },
  };
  localStorage.setItem('breath-in-flow-assessments', JSON.stringify([assessment]));
  return assessment;
}

function deleteHrvDatabase(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('breath-in-flow-hrv');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

describe('appBackupService integration (real repositories)', () => {
  beforeEach(async () => {
    localStorage.clear();
    resetStorageForTesting();
    usePreferences().clearGoal();
    await deleteHrvDatabase();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await deleteHrvDatabase();
  });

  it('exports legacy assessments before the Lab has initialized', async () => {
    const legacy = storeLegacyAssessment();
    const created = await createDefaultBackupService().createBackup();

    expect(created.summary.counts.assessments).toBe(1);
    expect(created.envelope.data.assessments[0]).toMatchObject({ id: legacy.id });
    expect(localStorage.getItem('breath-in-flow-assessments')).toBeNull();
  });

  it('does not resurrect legacy assessments after restoring before visiting the Lab', async () => {
    const service = createDefaultBackupService();
    const emptyBackup = service.parseBackupText((await service.createBackup()).json);
    storeLegacyAssessment();

    await service.restoreBackup(emptyBackup);
    await useHrvStorage().initialize();

    expect(await useHrvStorage().getAssessments()).toEqual([]);
  });

  it('rejects export and restore snapshot if legacy migration cannot finish', async () => {
    const service = createDefaultBackupService();
    const emptyBackup = service.parseBackupText((await service.createBackup()).json);
    const storage = useStorage();
    storage.createConfig({ ...DEFAULT_BREATHING_CONFIG, name: 'Keep preset' });
    usePreferences().setGoal('RELAX');
    const previous = storage.exportPracticeState();
    const legacy = storeLegacyAssessment();
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new Error('IndexedDB write blocked');
    });
    onTestFinished(() => put.mockRestore());

    await expect(service.createBackup()).rejects.toThrow(/migrat/i);
    await expect(service.restoreBackup(emptyBackup)).rejects.toMatchObject({ stage: 'snapshot' });
    expect(storage.exportPracticeState()).toEqual(previous);
    expect(usePreferences().selectedGoal.value).toBe('RELAX');
    expect(JSON.parse(localStorage.getItem('breath-in-flow-assessments')!)[0].id).toBe(legacy.id);

    put.mockRestore();
    expect((await service.createBackup()).summary.counts.assessments).toBe(1);
  });

  it('round-trips a backup through the real stores and verifies cleanly', async () => {
    const storage = useStorage();
    const prefs = usePreferences();

    // Seed real state across every store the coordinator touches.
    prefs.setGoal('BUILD_CONSISTENCY');
    storage.createConfig({ ...DEFAULT_BREATHING_CONFIG, name: 'Morning Set' });
    storage.setSoundTheme('water');
    localStorage.setItem(
      LAST_CONFIG_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_BREATHING_CONFIG, name: 'Last Used' })
    );

    const service = createDefaultBackupService();
    const created = await service.createBackup();

    expect(created.summary.counts.configs).toBe(1);
    expect(created.summary.counts.lastConfig).toBe(1);

    const parsed = service.parseBackupText(created.json);

    // restoreBackup throws (stage 'verify') if the read-back does not match what
    // was written; a clean resolve is the symmetry guarantee we care about.
    await expect(service.restoreBackup(parsed)).resolves.toBeUndefined();

    expect(prefs.selectedGoal.value).toBe('BUILD_CONSISTENCY');
    expect(storage.getSoundTheme()).toBe('water');
    expect(storage.getAllConfigs()).toHaveLength(1);
  });

  it('preserves all real stores when the atomic HRV replacement keeps failing', async () => {
    const service = createDefaultBackupService();
    const emptyBackup = service.parseBackupText((await service.createBackup()).json);
    const storage = useStorage();
    const config = storage.createConfig({ ...DEFAULT_BREATHING_CONFIG, name: 'Original preset' });
    const session = storage.createSession(config);
    storage.completeSession(session.id!);
    storage.setSoundTheme('water');
    usePreferences().setGoal('RELAX');
    localStorage.setItem(LAST_CONFIG_STORAGE_KEY, JSON.stringify(config));
    const legacy = storeLegacyAssessment();
    await useHrvStorage().initialize();
    const original = storage.exportPracticeState();
    const keys = [
      CONFIGS_STORAGE_KEY,
      SESSIONS_STORAGE_KEY,
      SOUND_THEME_STORAGE_KEY,
      PREFERENCES_STORAGE_KEY,
      LAST_CONFIG_STORAGE_KEY,
    ];
    const readDurable = () =>
      keys.map((key) => {
        const value = localStorage.getItem(key);
        return key === SOUND_THEME_STORAGE_KEY || value === null ? value : JSON.parse(value);
      });
    const durable = readDurable();
    const clear = vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(() => {
      throw new Error('IndexedDB replacement blocked');
    });
    onTestFinished(() => clear.mockRestore());

    await expect(service.restoreBackup(emptyBackup)).rejects.toMatchObject({ stage: 'write' });

    expect(clear).toHaveBeenCalledTimes(1);
    expect(readDurable()).toEqual(durable);
    expect(storage.exportPracticeState()).toEqual(original);
    expect(usePreferences().selectedGoal.value).toBe('RELAX');
    expect(await useHrvStorage().getAssessments()).toEqual([legacy]);
    expect(await useHrvStorage().getMeasurements()).toEqual([]);
  });

  it('reads no last config when localStorage.getItem throws', async () => {
    localStorage.setItem(LAST_CONFIG_STORAGE_KEY, JSON.stringify(DEFAULT_BREATHING_CONFIG));
    const original = localStorage.getItem.bind(localStorage);
    const getItem = vi.spyOn(localStorage, 'getItem').mockImplementation((key: string) => {
      if (key === LAST_CONFIG_STORAGE_KEY) throw new Error('storage blocked');
      return original(key);
    });
    onTestFinished(() => getItem.mockRestore());

    const created = await createDefaultBackupService().createBackup();

    expect(created.summary.counts.lastConfig).toBe(0);
    expect(created.envelope.data.lastConfig).toBeNull();
    expect(getItem).toHaveBeenCalledWith(LAST_CONFIG_STORAGE_KEY);
  });

  it('reads no last config when the stored value is not valid JSON', async () => {
    localStorage.setItem(LAST_CONFIG_STORAGE_KEY, '{ not json');

    const created = await createDefaultBackupService().createBackup();

    expect(created.summary.counts.lastConfig).toBe(0);
    expect(created.envelope.data.lastConfig).toBeNull();
  });

  it('reads no last config when the stored value fails schema validation', async () => {
    localStorage.setItem(LAST_CONFIG_STORAGE_KEY, JSON.stringify({ not: 'a config' }));

    const created = await createDefaultBackupService().createBackup();

    expect(created.summary.counts.lastConfig).toBe(0);
    expect(created.envelope.data.lastConfig).toBeNull();
  });

  it('removes the stored last config when a restore carries none', async () => {
    // Build a backup while no last config exists, so the parsed payload's
    // lastConfig is null and restoring it exercises the removal branch.
    const service = createDefaultBackupService();
    const created = await service.createBackup();
    expect(created.summary.counts.lastConfig).toBe(0);

    // A stale last config is present at restore time and must be cleared.
    localStorage.setItem(
      LAST_CONFIG_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_BREATHING_CONFIG, name: 'Stale' })
    );

    const parsed = service.parseBackupText(created.json);
    await expect(service.restoreBackup(parsed)).resolves.toBeUndefined();

    expect(localStorage.getItem(LAST_CONFIG_STORAGE_KEY)).toBeNull();
  });
});
