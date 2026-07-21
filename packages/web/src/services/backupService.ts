import type {
  AssessmentResult,
  BackupEnvelopeShape,
  BreathingConfig,
  Session,
  SoundTheme,
  UserPreferences,
} from '@breath-in-flow/shared';
import {
  AppConfig,
  AssessmentResultSchema,
  BACKUP_FORMAT_VERSION,
  BackupEnvelopeShapeSchema,
  BreathingConfigSchema,
  MAX_BACKUP_BYTES,
  SessionSchema,
} from '@breath-in-flow/shared';
import type { HrvMeasurement, HrvStorageSnapshot } from '@/composables/useHrvStorage';
import type { PracticeStorageSnapshot } from '@/composables/useStorage';

// ---------------------------------------------------------------------------
// Dependency-injection surface
// ---------------------------------------------------------------------------

// Every persistence backend the backup coordinator touches is injected so the
// UI can wire the real composables while tests can drive each failure mode
// (export throws, write throws, read-back drift, rollback throws) deterministically.
export interface BackupRepositories {
  practice: {
    exportState(): PracticeStorageSnapshot;
    replaceState(value: PracticeStorageSnapshot): void;
  };
  hrv: {
    exportState(): Promise<HrvStorageSnapshot>;
    replaceState(value: HrvStorageSnapshot): Promise<void>;
    // The HRV store owns measurement validation; the coordinator never touches
    // raw IndexedDB records, it validates through this repository-provided parser.
    parseMeasurement(value: unknown): HrvMeasurement | null;
  };
  preferences: {
    exportState(): UserPreferences | null;
    replaceState(value: UserPreferences | null): void;
  };
  lastConfig: {
    read(): BreathingConfig | null;
    replace(value: BreathingConfig | null): void;
  };
}

// ---------------------------------------------------------------------------
// Public value types
// ---------------------------------------------------------------------------

export interface BackupSummary {
  formatVersion: number;
  appVersion: string;
  exportedAt: string;
  soundTheme: SoundTheme;
  counts: {
    preferences: number;
    configs: number;
    sessions: number;
    lastConfig: number;
    measurements: number;
    assessments: number;
  };
}

export interface CreatedBackup {
  envelope: BackupEnvelopeShape;
  json: string;
  summary: BackupSummary;
}

// The fully validated, Date-restored payload ready to be written by restoreBackup.
export interface ParsedBackup {
  envelope: BackupEnvelopeShape;
  data: EnvelopeData;
}

interface EnvelopeData {
  preferences: UserPreferences | null;
  configs: BreathingConfig[];
  sessions: Session[];
  soundTheme: SoundTheme;
  lastConfig: BreathingConfig | null;
  measurements: HrvMeasurement[];
  assessments: AssessmentResult[];
}

// The restore pipeline is a strict linear progression; the stage names let the
// UI report exactly where a restore stopped and whether the original state
// survived. 'rollback' is terminal: it always signals possible inconsistency.
export type BackupRestoreStage = 'validate' | 'snapshot' | 'write' | 'verify' | 'rollback';

export class BackupRestoreError extends Error {
  readonly stage: BackupRestoreStage;
  readonly reason?: unknown;

  constructor(stage: BackupRestoreStage, message: string, reason?: unknown) {
    super(message);
    this.name = 'BackupRestoreError';
    this.stage = stage;
    this.reason = reason;
  }
}

// ---------------------------------------------------------------------------
// Normalization helpers (pure)
// ---------------------------------------------------------------------------

// Date fields that live inside practice/config/session/assessment records and
// must be re-hydrated to Date instances before nested schema validation.
const DATE_FIELDS = ['startedAt', 'completedAt', 'createdAt', 'updatedAt'] as const;

// Serialized backups carry dates as ISO strings; restore them in place so the
// nested schemas (which require z.date()) accept the record.
function restoreDates(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(restoreDates);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      DATE_FIELDS.includes(key as (typeof DATE_FIELDS)[number]) && typeof nested === 'string'
        ? new Date(nested)
        : restoreDates(nested),
    ])
  );
}

// Produces a canonical form for comparison: object keys are sorted and Date
// instances become ISO strings, but ARRAY ORDER IS PRESERVED. Preserving order
// is deliberate — session/measurement ordering is meaningful, so a reordering
// bug must surface as a mismatch rather than be normalized away. No fields are
// dropped, so silent data loss cannot hide behind normalization either.
function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])])
    );
  }
  return value;
}

// Exposes only the data payload (not the volatile metadata timestamp) so two
// backups of identical state compare equal.
export function normalizeExport(envelope: BackupEnvelopeShape): unknown {
  return canonicalize(envelope.data);
}

function canonicalEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

// ---------------------------------------------------------------------------
// Nested record validation (pure) — each rejection is a 'validate' failure.
// ---------------------------------------------------------------------------

function validateConfig(raw: unknown): BreathingConfig {
  const parsed = BreathingConfigSchema.safeParse(restoreDates(raw));
  if (!parsed.success) {
    throw new BackupRestoreError(
      'validate',
      'Backup contains an invalid breathing config.',
      parsed.error
    );
  }
  return parsed.data;
}

function validateSession(raw: unknown): Session {
  const parsed = SessionSchema.safeParse(restoreDates(raw));
  if (!parsed.success) {
    throw new BackupRestoreError('validate', 'Backup contains an invalid session.', parsed.error);
  }
  return parsed.data;
}

function validateAssessment(raw: unknown): AssessmentResult {
  const parsed = AssessmentResultSchema.safeParse(restoreDates(raw));
  if (!parsed.success) {
    throw new BackupRestoreError(
      'validate',
      'Backup contains an invalid assessment.',
      parsed.error
    );
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Coordinator
// ---------------------------------------------------------------------------

export interface BackupService {
  createBackup(): Promise<CreatedBackup>;
  parseBackupText(text: string, sizeBytes?: number): ParsedBackup;
  parseBackupFile(file: Blob): Promise<ParsedBackup>;
  restoreBackup(parsed: ParsedBackup): Promise<void>;
}

export function createBackupService(repositories: BackupRepositories): BackupService {
  // Reads every store and assembles the current data payload. Used for the
  // post-write read-back check and the post-rollback confirmation.
  async function currentData(): Promise<EnvelopeData> {
    const practice = repositories.practice.exportState();
    const preferences = repositories.preferences.exportState();
    const lastConfig = repositories.lastConfig.read();
    const hrv = await repositories.hrv.exportState();
    return {
      preferences,
      configs: practice.configs,
      sessions: practice.sessions,
      soundTheme: practice.soundTheme,
      lastConfig,
      measurements: hrv.measurements,
      assessments: hrv.assessments,
    };
  }

  async function createBackup(): Promise<CreatedBackup> {
    const practice = repositories.practice.exportState();
    const preferences = repositories.preferences.exportState();
    const lastConfig = repositories.lastConfig.read();
    const hrv = await repositories.hrv.exportState();

    // Field order is the canonical export order and must stay stable so exports
    // are deterministic for identical state.
    const rawEnvelope: BackupEnvelopeShape = {
      formatVersion: BACKUP_FORMAT_VERSION,
      metadata: {
        appVersion: AppConfig.version,
        exportedAt: new Date().toISOString(),
      },
      data: {
        preferences,
        configs: practice.configs,
        sessions: practice.sessions,
        soundTheme: practice.soundTheme,
        lastConfig,
        measurements: hrv.measurements,
        assessments: hrv.assessments,
      },
    };

    // The JSON round-trip serializes Date instances to ISO strings so the
    // in-memory envelope, the JSON string, and a re-import all agree exactly.
    const json = JSON.stringify(rawEnvelope);
    const envelope = JSON.parse(json) as BackupEnvelopeShape;

    const summary: BackupSummary = {
      formatVersion: BACKUP_FORMAT_VERSION,
      appVersion: AppConfig.version,
      exportedAt: envelope.metadata.exportedAt,
      soundTheme: practice.soundTheme,
      counts: {
        preferences: preferences ? 1 : 0,
        configs: practice.configs.length,
        sessions: practice.sessions.length,
        lastConfig: lastConfig ? 1 : 0,
        measurements: hrv.measurements.length,
        assessments: hrv.assessments.length,
      },
    };

    return { envelope, json, summary };
  }

  function parseBackupText(text: string, sizeBytes?: number): ParsedBackup {
    // Enforce the byte ceiling first so an oversize payload is rejected before
    // any further work (parseBackupFile guarantees the same before it reads).
    const bytes = sizeBytes ?? byteLength(text);
    if (bytes > MAX_BACKUP_BYTES) {
      throw new BackupRestoreError('validate', 'Backup exceeds the maximum allowed size.');
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      throw new BackupRestoreError('validate', 'Backup is not valid JSON.', error);
    }

    // Strict envelope shape first: rejects unknown top-level/data fields and any
    // unsupported formatVersion, and validates preferences + soundTheme inline.
    const envelopeResult = BackupEnvelopeShapeSchema.safeParse(raw);
    if (!envelopeResult.success) {
      throw new BackupRestoreError(
        'validate',
        'Backup envelope failed schema validation.',
        envelopeResult.error
      );
    }
    const envelope = envelopeResult.data;

    // Then nested validation of the opaque (z.unknown) collections.
    const configs = envelope.data.configs.map((config) => validateConfig(config));
    const sessions = envelope.data.sessions.map((session) => validateSession(session));
    const assessments = envelope.data.assessments.map((assessment) =>
      validateAssessment(assessment)
    );
    const measurements = envelope.data.measurements.map((measurement) => {
      const parsedMeasurement = repositories.hrv.parseMeasurement(measurement);
      if (!parsedMeasurement) {
        throw new BackupRestoreError('validate', 'Backup contains an invalid measurement.');
      }
      return parsedMeasurement;
    });
    const lastConfig =
      envelope.data.lastConfig === null ? null : validateConfig(envelope.data.lastConfig);

    return {
      envelope,
      data: {
        preferences: envelope.data.preferences,
        configs,
        sessions,
        soundTheme: envelope.data.soundTheme,
        lastConfig,
        measurements,
        assessments,
      },
    };
  }

  async function parseBackupFile(file: Blob): Promise<ParsedBackup> {
    // Reject on declared size BEFORE reading a single byte of the file.
    if (file.size > MAX_BACKUP_BYTES) {
      throw new BackupRestoreError('validate', 'Backup file exceeds the maximum allowed size.');
    }
    const text = await file.text();
    return parseBackupText(text, file.size);
  }

  async function restoreBackup(parsed: ParsedBackup): Promise<void> {
    const expected = parsed.data;

    // --- SNAPSHOT: capture every store BEFORE any write. No writes have
    // happened yet, so a snapshot failure needs no rollback. ---
    let practiceSnapshot!: PracticeStorageSnapshot;
    let prefsSnapshot!: UserPreferences | null;
    let lastConfigSnapshot!: BreathingConfig | null;
    let hrvSnapshot!: HrvStorageSnapshot;
    try {
      practiceSnapshot = repositories.practice.exportState();
      prefsSnapshot = repositories.preferences.exportState();
      lastConfigSnapshot = repositories.lastConfig.read();
      hrvSnapshot = await repositories.hrv.exportState();
    } catch (error) {
      throw new BackupRestoreError(
        'snapshot',
        'Failed to capture current state before restore.',
        error
      );
    }

    const originalData: EnvelopeData = {
      preferences: prefsSnapshot,
      configs: practiceSnapshot.configs,
      sessions: practiceSnapshot.sessions,
      soundTheme: practiceSnapshot.soundTheme,
      lastConfig: lastConfigSnapshot,
      measurements: hrvSnapshot.measurements,
      assessments: hrvSnapshot.assessments,
    };

    // Undo in the reverse order writes were applied. HRV is replaced last (and
    // atomically), so it is rolled back first; practice was written first, so it
    // is restored last. Re-invoking practice.replaceState re-consistifies
    // localStorage even if an earlier partial write left refs and storage out of
    // sync (per useStorage's documented rollback contract).
    const rollback = async (): Promise<void> => {
      await repositories.hrv.replaceState({
        measurements: hrvSnapshot.measurements,
        assessments: hrvSnapshot.assessments,
      });
      repositories.lastConfig.replace(lastConfigSnapshot);
      repositories.preferences.replaceState(prefsSnapshot);
      repositories.practice.replaceState(practiceSnapshot);
    };

    // Roll back, confirm the original state is truly back, then throw. If the
    // rollback itself throws OR does not restore the original state, that is
    // reported as stage 'rollback' — never as the original stage, and never as
    // success — because the data may now be inconsistent.
    const rollbackAndThrow = async (stage: BackupRestoreStage, reason: unknown): Promise<never> => {
      try {
        await rollback();
        const afterRollback = await currentData();
        if (!canonicalEqual(afterRollback, originalData)) {
          throw new BackupRestoreError(
            'rollback',
            'Rollback did not restore the original state.',
            reason
          );
        }
      } catch (rollbackError) {
        if (rollbackError instanceof BackupRestoreError) throw rollbackError;
        throw new BackupRestoreError(
          'rollback',
          'Rollback failed; data may be inconsistent.',
          rollbackError
        );
      }
      throw new BackupRestoreError(
        stage,
        `Restore failed during the ${stage} stage; original state restored.`,
        reason
      );
    };

    // --- WRITE: practice, preferences, last-config, then the atomic HRV replace. ---
    try {
      repositories.practice.replaceState({
        configs: expected.configs,
        sessions: expected.sessions,
        soundTheme: expected.soundTheme,
      });
      repositories.preferences.replaceState(expected.preferences);
      repositories.lastConfig.replace(expected.lastConfig);
      await repositories.hrv.replaceState({
        measurements: expected.measurements,
        assessments: expected.assessments,
      });
    } catch (error) {
      return rollbackAndThrow('write', error);
    }

    // --- VERIFY: read every store back and require it to match what we wrote. ---
    let readBack: EnvelopeData;
    try {
      readBack = await currentData();
    } catch (error) {
      return rollbackAndThrow('verify', error);
    }
    if (!canonicalEqual(readBack, expected)) {
      return rollbackAndThrow(
        'verify',
        new Error('Read-back verification did not match the restored backup.')
      );
    }
  }

  return { createBackup, parseBackupText, parseBackupFile, restoreBackup };
}
