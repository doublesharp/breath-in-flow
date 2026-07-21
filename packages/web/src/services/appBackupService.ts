import type { BreathingConfig } from '@breath-in-flow/shared';
import { BreathingConfigSchema } from '@breath-in-flow/shared';
import { usePreferences } from '@/composables/usePreferences';
import { useHrvStorage } from '@/composables/useHrvStorage';
import { useStorage } from '@/composables/useStorage';
import { LAST_CONFIG_STORAGE_KEY } from '@/constants/storageKeys';
import { createBackupService, type BackupRepositories, type BackupService } from './backupService';

// The last breathing config lives under a bare localStorage key (written by
// BreathingPractice), so the backup coordinator reaches it through this small
// repository. Config metadata dates are serialized as ISO strings, so reads
// re-hydrate them before schema validation.
const LAST_CONFIG_DATE_FIELDS = ['createdAt', 'updatedAt'] as const;

function restoreConfigDates(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      LAST_CONFIG_DATE_FIELDS.includes(key as (typeof LAST_CONFIG_DATE_FIELDS)[number]) &&
      typeof nested === 'string'
        ? new Date(nested)
        : nested,
    ])
  );
}

function readLastConfig(): BreathingConfig | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(LAST_CONFIG_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = BreathingConfigSchema.safeParse(restoreConfigDates(JSON.parse(raw)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function replaceLastConfig(value: BreathingConfig | null): void {
  if (value === null) {
    localStorage.removeItem(LAST_CONFIG_STORAGE_KEY);
    return;
  }
  localStorage.setItem(LAST_CONFIG_STORAGE_KEY, JSON.stringify(value));
}

// Binds the backup coordinator to the app's real composables. Composables are
// resolved inside the repository methods so constructing the service never eagerly
// opens IndexedDB or touches storage until a backup action actually runs. The
// export/replace pairs are structurally symmetric: whatever a replace writes, the
// matching export reads back identically, so a legitimate restore verifies cleanly.
export function createDefaultBackupService(): BackupService {
  const repositories: BackupRepositories = {
    practice: {
      exportState: () => useStorage().exportPracticeState(),
      replaceState: (value) => useStorage().replacePracticeState(value),
    },
    hrv: {
      exportState: () => useHrvStorage().exportHrvState(),
      replaceState: (value) => useHrvStorage().replaceHrvState(value),
      parseMeasurement: (value) => useHrvStorage().parseMeasurement(value),
    },
    preferences: {
      exportState: () => usePreferences().exportPreferences(),
      replaceState: (value) => usePreferences().replacePreferences(value),
    },
    lastConfig: {
      read: readLastConfig,
      replace: replaceLastConfig,
    },
  };

  return createBackupService(repositories);
}
