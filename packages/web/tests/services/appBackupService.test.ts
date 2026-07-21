// Uses a real IndexedDB so the round-trip exercises the actual composables the UI
// wires, proving the export/replace pairs are structurally symmetric (what a
// restore writes, an export reads back identically) and a legitimate backup
// verifies cleanly instead of false-failing at the 'verify' stage.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultBackupService } from '../../src/services/appBackupService';
import { useStorage, resetStorageForTesting } from '../../src/composables/useStorage';
import { usePreferences } from '../../src/composables/usePreferences';
import { LAST_CONFIG_STORAGE_KEY } from '../../src/constants/storageKeys';
import { DEFAULT_BREATHING_CONFIG } from '@breath-in-flow/shared';

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

  it('reads no last config when localStorage.getItem throws', async () => {
    const original = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
      this: Storage,
      key: string
    ) {
      if (key === LAST_CONFIG_STORAGE_KEY) throw new Error('storage blocked');
      return original.call(this, key);
    });

    const created = await createDefaultBackupService().createBackup();

    expect(created.summary.counts.lastConfig).toBe(0);
    expect(created.envelope.data.lastConfig).toBeNull();
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
