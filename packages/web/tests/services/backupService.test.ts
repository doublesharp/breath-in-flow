import { describe, it, expect } from 'vitest';
import type {
  AssessmentResult,
  BreathingConfig,
  Session,
  SoundTheme,
  UserPreferences,
} from '@breath-in-flow/shared';
import { MAX_BACKUP_BYTES } from '@breath-in-flow/shared';
import {
  useHrvStorage,
  type HrvMeasurement,
  type HrvStorageSnapshot,
} from '../../src/composables/useHrvStorage';
import type { PracticeStorageSnapshot } from '../../src/composables/useStorage';
import {
  BackupRestoreError,
  createBackupService,
  normalizeExport,
  type BackupRepositories,
} from '../../src/services/backupService';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const clone = <T>(value: T): T => structuredClone(value);

// The coordinator validates measurements through the real repository parser, so
// tests reuse it rather than reimplementing measurement validation.
const realParseMeasurement = useHrvStorage().parseMeasurement;

function makeConfig(overrides: Partial<BreathingConfig> = {}): BreathingConfig {
  return {
    id: crypto.randomUUID(),
    name: 'Box Breathing',
    inhaleTime: 4,
    inhaleHoldTime: 4,
    exhaleTime: 4,
    exhaleHoldTime: 4,
    repetitions: 4,
    extendedHoldEnabled: false,
    extendedHoldType: 'EXHALE',
    extendedHoldMode: 'TOLERANCE',
    extendedHoldDuration: 0,
    secondExtendedHoldEnabled: false,
    secondExtendedHoldType: 'INHALE',
    secondExtendedHoldMode: 'TIMED',
    secondExtendedHoldDuration: 15,
    targetSets: 0,
    restBetweenSetsSeconds: 0,
    soundEnabled: true,
    soundTheme: 'wood',
    ttsEnabled: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  };
}

function makeSession(): Session {
  const config = makeConfig();
  return {
    id: crypto.randomUUID(),
    configId: config.id,
    configSnapshot: config,
    status: 'COMPLETED',
    sets: [
      {
        id: crypto.randomUUID(),
        setNumber: 1,
        completedRepetitions: 4,
        extendedHolds: [
          {
            id: crypto.randomUUID(),
            type: 'EXHALE',
            mode: 'TOLERANCE',
            actualDuration: 30,
            completedAt: new Date('2026-01-03T00:00:10.000Z'),
          },
        ],
        startedAt: new Date('2026-01-03T00:00:00.000Z'),
        completedAt: new Date('2026-01-03T00:01:00.000Z'),
      },
    ],
    targetSets: 1,
    completedSets: 1,
    startedAt: new Date('2026-01-03T00:00:00.000Z'),
    completedAt: new Date('2026-01-03T00:05:00.000Z'),
  };
}

function makeMeasurement(): HrvMeasurement {
  return {
    id: crypto.randomUUID(),
    type: 'quick-check',
    startedAt: new Date('2026-02-01T08:00:00.000Z'),
    completedAt: new Date('2026-02-01T08:02:00.000Z'),
    durationSeconds: 120,
    sensorMode: 'camera',
    analysis: {
      timeDomain: {
        meanRR: 800,
        sdnn: 50,
        rmssd: 40,
        pnn50: 20,
        meanHR: 75,
        minHR: 65,
        maxHR: 85,
        hrRange: 20,
      },
      frequencyDomain: {
        available: true,
        value: {
          lfPowerNorm: 60,
          hfPowerNorm: 40,
          lfHfRatio: 1.5,
          lfPeak: 0.1,
          hfPeak: 0.25,
          spectrum: [],
        },
      },
      poincare: { available: true, value: { points: [] } },
      resonance: {
        available: true,
        value: {
          peakToTroughAmplitude: 15,
          waveformSmoothness: 0.7,
          phaseSynchrony: 0.8,
          lfPeakCount: 1,
          lfPeakAmplitude: 50,
        },
      },
      quality: {
        totalSamples: 120,
        artifactsDetected: 2,
        artifactPercentage: 1.7,
        meanSignalQuality: 0.85,
      },
      raw: { rrIntervals: [], timestamps: [], instantaneousHR: [] },
    },
  };
}

function makeAssessment(): AssessmentResult {
  return {
    id: crypto.randomUUID(),
    trials: [{ rate: 6.0, inhaleTime: 5, exhaleTime: 5, repetitions: 5, comfortRating: 4, symptoms: [] }],
    selectedRate: 6.0,
    completedAt: new Date('2026-03-01T09:00:00.000Z'),
    config: { warmupDurationSeconds: 120, warmupRate: 6.0, restDurationSeconds: 120 },
  };
}

interface SeedState {
  practice: PracticeStorageSnapshot;
  preferences: UserPreferences | null;
  lastConfig: BreathingConfig | null;
  hrv: HrvStorageSnapshot;
}

function seededState(): SeedState {
  return {
    practice: { configs: [makeConfig()], sessions: [makeSession()], soundTheme: 'wood' as SoundTheme },
    preferences: { version: 1, goal: 'RELAX' },
    lastConfig: makeConfig(),
    hrv: { measurements: [makeMeasurement()], assessments: [makeAssessment()] },
  };
}

// ---------------------------------------------------------------------------
// Repository fakes with deterministic failure injection
// ---------------------------------------------------------------------------

type ThrowMode = null | 'once' | 'always';

interface FakeControls {
  practice: { throwOnExportCall: number | null; replaceThrows: ThrowMode; corruptReplace: ThrowMode };
  preferences: { throwOnExportCall: number | null; replaceThrows: ThrowMode };
  lastConfig: { throwOnReadCall: number | null; replaceThrows: ThrowMode };
  hrv: { throwOnExportCall: number | null; replaceThrows: ThrowMode; corruptReplace: ThrowMode };
}

interface Fakes {
  repositories: BackupRepositories;
  clearAll: () => void;
  log: string[];
  ctl: FakeControls;
}

function consume(mode: ThrowMode, reset: () => void): boolean {
  if (mode === 'always') return true;
  if (mode === 'once') {
    reset();
    return true;
  }
  return false;
}

function makeFakes(seed: SeedState): Fakes {
  const log: string[] = [];

  let practiceState = clone(seed.practice);
  let prefState = clone(seed.preferences);
  let lastState = clone(seed.lastConfig);
  let hrvState = clone(seed.hrv);

  let practiceExportCalls = 0;
  let prefExportCalls = 0;
  let lastReadCalls = 0;
  let hrvExportCalls = 0;

  const ctl: FakeControls = {
    practice: { throwOnExportCall: null, replaceThrows: null, corruptReplace: null },
    preferences: { throwOnExportCall: null, replaceThrows: null },
    lastConfig: { throwOnReadCall: null, replaceThrows: null },
    hrv: { throwOnExportCall: null, replaceThrows: null, corruptReplace: null },
  };

  const repositories: BackupRepositories = {
    practice: {
      exportState() {
        practiceExportCalls += 1;
        if (ctl.practice.throwOnExportCall === practiceExportCalls) {
          throw new Error('practice export failed');
        }
        return clone(practiceState);
      },
      replaceState(value) {
        log.push('practice');
        if (consume(ctl.practice.replaceThrows, () => (ctl.practice.replaceThrows = null))) {
          throw new Error('practice replace failed');
        }
        let next = clone(value);
        if (consume(ctl.practice.corruptReplace, () => (ctl.practice.corruptReplace = null))) {
          next = { ...next, soundTheme: next.soundTheme === 'wood' ? 'water' : 'wood' };
        }
        practiceState = next;
      },
    },
    preferences: {
      exportState() {
        prefExportCalls += 1;
        if (ctl.preferences.throwOnExportCall === prefExportCalls) {
          throw new Error('preferences export failed');
        }
        return clone(prefState);
      },
      replaceState(value) {
        log.push('preferences');
        if (consume(ctl.preferences.replaceThrows, () => (ctl.preferences.replaceThrows = null))) {
          throw new Error('preferences replace failed');
        }
        prefState = clone(value);
      },
    },
    lastConfig: {
      read() {
        lastReadCalls += 1;
        if (ctl.lastConfig.throwOnReadCall === lastReadCalls) {
          throw new Error('lastConfig read failed');
        }
        return clone(lastState);
      },
      replace(value) {
        log.push('lastConfig');
        if (consume(ctl.lastConfig.replaceThrows, () => (ctl.lastConfig.replaceThrows = null))) {
          throw new Error('lastConfig replace failed');
        }
        lastState = clone(value);
      },
    },
    hrv: {
      async exportState() {
        hrvExportCalls += 1;
        if (ctl.hrv.throwOnExportCall === hrvExportCalls) {
          throw new Error('hrv export failed');
        }
        return clone(hrvState);
      },
      async replaceState(value) {
        log.push('hrv');
        if (consume(ctl.hrv.replaceThrows, () => (ctl.hrv.replaceThrows = null))) {
          throw new Error('hrv replace failed');
        }
        let next = clone(value);
        if (consume(ctl.hrv.corruptReplace, () => (ctl.hrv.corruptReplace = null))) {
          next = { measurements: [], assessments: next.assessments };
        }
        hrvState = next;
      },
      parseMeasurement: realParseMeasurement,
    },
  };

  function clearAll() {
    practiceState = { configs: [], sessions: [], soundTheme: 'wood' };
    prefState = null;
    lastState = null;
    hrvState = { measurements: [], assessments: [] };
  }

  return { repositories, clearAll, log, ctl };
}

// Builds a valid ParsedBackup from an isolated service so restore tests can be
// driven against a separate target with injected failures.
async function buildParsed(seed: SeedState) {
  const service = createBackupService(makeFakes(seed).repositories);
  const backup = await service.createBackup();
  return service.parseBackupText(backup.json);
}

async function captureError(run: () => Promise<unknown>): Promise<BackupRestoreError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof BackupRestoreError) return error;
    throw error;
  }
  throw new Error('Expected a BackupRestoreError to be thrown');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('backupService.createBackup', () => {
  it('produces a deterministic normalized export with stable fields and counts', async () => {
    const service = createBackupService(makeFakes(seededState()).repositories);

    const first = await service.createBackup();
    const second = await service.createBackup();

    // Two exports of identical state normalize to the same data payload even
    // though their metadata timestamps differ.
    expect(normalizeExport(first.envelope)).toEqual(normalizeExport(second.envelope));

    const data = normalizeExport(first.envelope) as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual([
      'assessments',
      'configs',
      'lastConfig',
      'measurements',
      'preferences',
      'sessions',
      'soundTheme',
    ]);

    expect(first.summary.formatVersion).toBe(1);
    expect(first.summary.soundTheme).toBe('wood');
    expect(first.summary.counts).toEqual({
      preferences: 1,
      configs: 1,
      sessions: 1,
      lastConfig: 1,
      measurements: 1,
      assessments: 1,
    });
  });

  it('reports empty collections when preferences and lastConfig are absent', async () => {
    const seed = seededState();
    seed.preferences = null;
    seed.lastConfig = null;
    const service = createBackupService(makeFakes(seed).repositories);

    const backup = await service.createBackup();

    expect(backup.summary.counts.preferences).toBe(0);
    expect(backup.summary.counts.lastConfig).toBe(0);
    expect(backup.envelope.data.preferences).toBeNull();
    expect(backup.envelope.data.lastConfig).toBeNull();
  });
});

describe('backupService round trip', () => {
  it('restores localStorage and IndexedDB state cleared to empty', async () => {
    const fakes = makeFakes(seededState());
    const service = createBackupService(fakes.repositories);

    const original = await service.createBackup();
    fakes.clearAll();
    await service.restoreBackup(service.parseBackupText(original.json));
    const restored = await service.createBackup();

    expect(normalizeExport(restored.envelope)).toEqual(normalizeExport(original.envelope));
  });

  it('round trips when preferences and lastConfig are null', async () => {
    const seed = seededState();
    seed.preferences = null;
    seed.lastConfig = null;
    const fakes = makeFakes(seed);
    const service = createBackupService(fakes.repositories);

    const original = await service.createBackup();
    fakes.clearAll();
    await service.restoreBackup(service.parseBackupText(original.json));
    const restored = await service.createBackup();

    expect(normalizeExport(restored.envelope)).toEqual(normalizeExport(original.envelope));
    expect(restored.envelope.data.lastConfig).toBeNull();
    expect(restored.envelope.data.preferences).toBeNull();
  });
});

describe('backupService parsing and validation', () => {
  it('rejects malformed JSON as a validate failure', () => {
    const service = createBackupService(makeFakes(seededState()).repositories);
    let error: BackupRestoreError | undefined;
    try {
      service.parseBackupText('{ not json');
    } catch (caught) {
      error = caught as BackupRestoreError;
    }
    expect(error).toBeInstanceOf(BackupRestoreError);
    expect(error?.stage).toBe('validate');
  });

  it('rejects an unknown top-level field', async () => {
    const service = createBackupService(makeFakes(seededState()).repositories);
    const base = JSON.parse((await service.createBackup()).json);
    const text = JSON.stringify({ ...base, rogue: true });
    expect(() => service.parseBackupText(text)).toThrow(BackupRestoreError);
    expect(() => service.parseBackupText(text)).toThrow(/schema validation/);
  });

  it('rejects an unknown data field', async () => {
    const service = createBackupService(makeFakes(seededState()).repositories);
    const base = JSON.parse((await service.createBackup()).json);
    const text = JSON.stringify({ ...base, data: { ...base.data, rogue: true } });
    const error = captureParse(service, text);
    expect(error.stage).toBe('validate');
  });

  it('rejects an unsupported format version', async () => {
    const service = createBackupService(makeFakes(seededState()).repositories);
    const base = JSON.parse((await service.createBackup()).json);
    const text = JSON.stringify({ ...base, formatVersion: 2 });
    expect(captureParse(service, text).stage).toBe('validate');
  });

  it('rejects an invalid nested config', async () => {
    const service = createBackupService(makeFakes(seededState()).repositories);
    const base = JSON.parse((await service.createBackup()).json);
    const text = JSON.stringify({ ...base, data: { ...base.data, configs: [{ name: '' }] } });
    expect(captureParse(service, text).stage).toBe('validate');
  });

  it('rejects an invalid nested session', async () => {
    const service = createBackupService(makeFakes(seededState()).repositories);
    const base = JSON.parse((await service.createBackup()).json);
    const text = JSON.stringify({ ...base, data: { ...base.data, sessions: [{ bogus: true }] } });
    expect(captureParse(service, text).stage).toBe('validate');
  });

  it('rejects an invalid nested measurement', async () => {
    const service = createBackupService(makeFakes(seededState()).repositories);
    const base = JSON.parse((await service.createBackup()).json);
    const text = JSON.stringify({ ...base, data: { ...base.data, measurements: [{ bogus: true }] } });
    expect(captureParse(service, text).stage).toBe('validate');
  });

  it('rejects an invalid nested assessment', async () => {
    const service = createBackupService(makeFakes(seededState()).repositories);
    const base = JSON.parse((await service.createBackup()).json);
    const text = JSON.stringify({ ...base, data: { ...base.data, assessments: [{ bogus: true }] } });
    expect(captureParse(service, text).stage).toBe('validate');
  });

  it('rejects text whose declared size exceeds the maximum', async () => {
    const service = createBackupService(makeFakes(seededState()).repositories);
    const base = (await service.createBackup()).json;
    expect(captureParse(service, base, MAX_BACKUP_BYTES + 1).stage).toBe('validate');
  });

  it('rejects an oversize file before reading its contents', async () => {
    const service = createBackupService(makeFakes(seededState()).repositories);
    let read = false;
    const file = {
      size: MAX_BACKUP_BYTES + 1,
      text: async () => {
        read = true;
        return '';
      },
    } as unknown as Blob;

    const error = await captureError(() => service.parseBackupFile(file));
    expect(error.stage).toBe('validate');
    expect(read).toBe(false);
  });

  it('parses a valid backup file', async () => {
    const service = createBackupService(makeFakes(seededState()).repositories);
    const backup = await service.createBackup();
    const file = new Blob([backup.json], { type: 'application/json' });

    const parsed = await service.parseBackupFile(file);

    expect(parsed.data.configs).toHaveLength(1);
    expect(parsed.data.measurements).toHaveLength(1);
    expect(parsed.data.sessions[0].startedAt).toBeInstanceOf(Date);
  });
});

describe('backupService restore safety', () => {
  it('performs no writes until restore is invoked', async () => {
    const fakes = makeFakes(seededState());
    const service = createBackupService(fakes.repositories);

    const backup = await service.createBackup();
    const parsed = service.parseBackupText(backup.json);
    expect(fakes.log).toEqual([]);

    await service.restoreBackup(parsed);
    expect(fakes.log).toContain('practice');
    expect(fakes.log).toContain('hrv');
  });

  it('throws stage "snapshot" and writes nothing when snapshotting fails', async () => {
    const parsed = await buildParsed(seededState());
    const fakes = makeFakes(seededState());
    fakes.ctl.practice.throwOnExportCall = 1;
    const service = createBackupService(fakes.repositories);

    const error = await captureError(() => service.restoreBackup(parsed));
    expect(error.stage).toBe('snapshot');
    expect(fakes.log).toEqual([]);
  });

  it('rolls back and throws stage "write" when a write fails', async () => {
    const parsed = await buildParsed(seededState());
    const fakes = makeFakes(seededState());
    fakes.ctl.preferences.replaceThrows = 'once';
    const service = createBackupService(fakes.repositories);

    const error = await captureError(() => service.restoreBackup(parsed));
    expect(error.stage).toBe('write');
  });

  it('rolls back and throws stage "verify" when read-back does not match', async () => {
    const parsed = await buildParsed(seededState());
    const fakes = makeFakes(seededState());
    fakes.ctl.hrv.corruptReplace = 'once';
    const service = createBackupService(fakes.repositories);

    const error = await captureError(() => service.restoreBackup(parsed));
    expect(error.stage).toBe('verify');
  });

  it('rolls back and throws stage "verify" when read-back export throws', async () => {
    const parsed = await buildParsed(seededState());
    const fakes = makeFakes(seededState());
    // Call 1 is the snapshot; call 2 is the read-back verification.
    fakes.ctl.practice.throwOnExportCall = 2;
    const service = createBackupService(fakes.repositories);

    const error = await captureError(() => service.restoreBackup(parsed));
    expect(error.stage).toBe('verify');
  });

  it('reports stage "rollback" when the rollback itself throws', async () => {
    const parsed = await buildParsed(seededState());
    const fakes = makeFakes(seededState());
    fakes.ctl.preferences.replaceThrows = 'always';
    const service = createBackupService(fakes.repositories);

    const error = await captureError(() => service.restoreBackup(parsed));
    expect(error.stage).toBe('rollback');
  });

  it('reports stage "rollback" when rollback does not restore the original state', async () => {
    const parsed = await buildParsed(seededState());
    const fakes = makeFakes(seededState());
    fakes.ctl.hrv.corruptReplace = 'always';
    const service = createBackupService(fakes.repositories);

    const error = await captureError(() => service.restoreBackup(parsed));
    expect(error.stage).toBe('rollback');
  });
});

function captureParse(
  service: ReturnType<typeof createBackupService>,
  text: string,
  sizeBytes?: number
): BackupRestoreError {
  try {
    service.parseBackupText(text, sizeBytes);
  } catch (error) {
    if (error instanceof BackupRestoreError) return error;
    throw error;
  }
  throw new Error('Expected a BackupRestoreError to be thrown');
}
