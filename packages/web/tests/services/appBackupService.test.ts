// Uses a real IndexedDB so the round-trip exercises the actual composables the UI
// wires, proving the export/replace pairs are structurally symmetric (what a
// restore writes, an export reads back identically) and a legitimate backup
// verifies cleanly instead of false-failing at the 'verify' stage.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
});
