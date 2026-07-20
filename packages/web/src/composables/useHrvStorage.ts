import type {
  AssessmentResult,
  DetectionMethod,
  HRVAnalysis,
  MeasurementEligibility,
  SensorSource,
} from '@breath-in-flow/shared';
import { AssessmentResultSchema } from '@breath-in-flow/shared';
import { isHrvAnalysis, normalizeLegacyHrvAnalysis } from '@/utils/hrvAnalysisValidation';
import {
  createStoredRecordWarningLogger,
  validateStoredArray,
} from '@/utils/storedRecordValidation';

export interface HrvMeasurement {
  id: string;
  type: 'quick-check' | 'full-analysis' | 'morning-readiness' | 'freeform' | 'assessment-trial';
  startedAt: Date;
  completedAt: Date;
  durationSeconds: number;
  sensorMode: 'none' | 'camera' | 'accelerometer' | 'dual';
  analysis: HRVAnalysis;
  breathingRateBPM?: number;
  assessmentId?: string;
  notes?: string;
  tags?: string[];
  algorithmVersion?: number;
  eligibility?: MeasurementEligibility;
  sampleProvenance?: {
    sources: SensorSource[];
    detectionMethods: DetectionMethod[];
  };
}

interface MeasurementQuery {
  limit?: number;
  after?: Date;
  before?: Date;
  type?: HrvMeasurement['type'];
}

interface MeasurementStats {
  count: number;
  avgRmssd: number;
  avgSdnn: number;
  avgLfPowerNorm: number;
  avgMeanHR: number;
  latestDate: Date | null;
}

const DB_NAME = 'breath-in-flow-hrv';
const DB_VERSION = 1;
const LEGACY_ASSESSMENTS_KEY = 'breath-in-flow-assessments';
const ASSESSMENTS_MIGRATION_KEY = 'breath-in-flow-assessments-migration-v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function restoreDate(value: unknown): unknown {
  if (value instanceof Date) return value;
  return typeof value === 'string' ? new Date(value) : value;
}

function normalizeAssessment(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return { ...value, completedAt: restoreDate(value.completedAt) };
}

function validateAssessment(value: unknown): AssessmentResult | null {
  const parsed = AssessmentResultSchema.safeParse(normalizeAssessment(value));
  return parsed.success ? parsed.data : null;
}

function validateMeasurement(value: unknown): HrvMeasurement | null {
  if (!isRecord(value)) return null;

  const analysis = normalizeLegacyHrvAnalysis(value.analysis, {
    breathingRateBPM: value.breathingRateBPM,
  });
  if (!isHrvAnalysis(analysis)) return null;

  const startedAt = restoreDate(value.startedAt);
  const completedAt = restoreDate(value.completedAt);
  const measurementTypes: HrvMeasurement['type'][] = [
    'quick-check',
    'full-analysis',
    'morning-readiness',
    'freeform',
    'assessment-trial',
  ];
  const sensorModes: HrvMeasurement['sensorMode'][] = ['none', 'camera', 'accelerometer', 'dual'];
  const eligibilityReasons = [
    'duration-too-short',
    'insufficient-beats',
    'invalid-sample',
    'non-monotonic-timestamps',
    'implausible-interval',
    'unknown-provenance',
    'estimated-samples',
    'low-signal-quality',
    'too-many-artifacts',
    'sensor-error',
  ];
  const eligibilityWarnings = ['elevated-artifacts', 'short-recording-sdnn'];
  const metricGroups = [
    'average-pulse',
    'rmssd',
    'pnn50',
    'sdnn-short-recording',
    'sdnn',
    'frequency-domain',
    'poincare',
    'resonance-training',
  ];
  const eligibility = value.eligibility;
  const eligibilityIsValid =
    eligibility === undefined ||
    (isRecord(eligibility) &&
      typeof eligibility.eligible === 'boolean' &&
      Array.isArray(eligibility.reasons) &&
      eligibility.reasons.every((reason) => eligibilityReasons.includes(reason)) &&
      Array.isArray(eligibility.warnings) &&
      eligibility.warnings.every((warning) => eligibilityWarnings.includes(warning)) &&
      Array.isArray(eligibility.availableMetrics) &&
      eligibility.availableMetrics.every((metric) => metricGroups.includes(metric)) &&
      ['artifactPercentage', 'meanQuality', 'observedDurationSeconds'].every(
        (key) => typeof eligibility[key] === 'number' && Number.isFinite(eligibility[key])
      ) &&
      typeof eligibility.detectedBeatCount === 'number' &&
      Number.isInteger(eligibility.detectedBeatCount) &&
      eligibility.detectedBeatCount >= 0);
  const provenance = value.sampleProvenance;
  const provenanceIsValid =
    provenance === undefined ||
    (isRecord(provenance) &&
      Array.isArray(provenance.sources) &&
      provenance.sources.every((source) => ['ppg', 'scg', 'fused'].includes(source)) &&
      Array.isArray(provenance.detectionMethods) &&
      provenance.detectionMethods.every((method) =>
        ['peak-detected', 'autocorrelation-estimate'].includes(method)
      ));

  if (
    typeof value.id !== 'string' ||
    !measurementTypes.includes(value.type as HrvMeasurement['type']) ||
    !sensorModes.includes(value.sensorMode as HrvMeasurement['sensorMode']) ||
    typeof value.durationSeconds !== 'number' ||
    !Number.isFinite(value.durationSeconds) ||
    !(startedAt instanceof Date) ||
    Number.isNaN(+startedAt) ||
    !(completedAt instanceof Date) ||
    Number.isNaN(+completedAt) ||
    (value.breathingRateBPM !== undefined &&
      (typeof value.breathingRateBPM !== 'number' || !Number.isFinite(value.breathingRateBPM))) ||
    (value.assessmentId !== undefined && typeof value.assessmentId !== 'string') ||
    (value.notes !== undefined && typeof value.notes !== 'string') ||
    (value.tags !== undefined &&
      (!Array.isArray(value.tags) || !value.tags.every((tag) => typeof tag === 'string'))) ||
    (value.algorithmVersion !== undefined &&
      (typeof value.algorithmVersion !== 'number' ||
        !Number.isInteger(value.algorithmVersion) ||
        value.algorithmVersion <= 0)) ||
    !eligibilityIsValid ||
    !provenanceIsValid
  ) {
    return null;
  }

  return { ...value, analysis, startedAt, completedAt } as HrvMeasurement;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('measurements')) {
        const store = db.createObjectStore('measurements', { keyPath: 'id' });
        store.createIndex('completedAt', 'completedAt', { unique: false });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('assessmentId', 'assessmentId', { unique: false });
      }
      if (!db.objectStoreNames.contains('assessments')) {
        const store = db.createObjectStore('assessments', { keyPath: 'id' });
        store.createIndex('completedAt', 'completedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function waitForTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function saveMeasurement(measurement: HrvMeasurement): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('measurements', 'readwrite');
  tx.objectStore('measurements').put(measurement);
  await waitForTransaction(tx);
  db.close();
}

async function getMeasurements(query?: MeasurementQuery): Promise<HrvMeasurement[]> {
  const db = await openDB();
  const tx = db.transaction('measurements', 'readonly');
  const store = tx.objectStore('measurements');
  const index = store.index('completedAt');

  const results: HrvMeasurement[] = [];
  const warnings = createStoredRecordWarningLogger('IndexedDB pulse variability measurements');
  let recordIndex = 0;

  await new Promise<void>((resolve, reject) => {
    // Use IDBKeyRange for date filtering if provided
    let keyRange: IDBKeyRange | null = null;
    if (query?.after && query?.before) {
      keyRange = IDBKeyRange.bound(query.after, query.before);
    } else if (query?.after) {
      keyRange = IDBKeyRange.lowerBound(query.after);
    } else if (query?.before) {
      keyRange = IDBKeyRange.upperBound(query.before);
    }

    const request = index.openCursor(keyRange, 'prev'); // descending by completedAt

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (!cursor) {
        warnings.summarize();
        resolve();
        return;
      }

      const measurement = validateMeasurement(cursor.value);

      // Apply type filter in JavaScript
      if (measurement && (!query?.type || measurement.type === query.type)) {
        results.push(measurement);
        if (query?.limit && results.length >= query.limit) {
          warnings.summarize();
          resolve();
          return;
        }
      } else if (!measurement) {
        warnings.warn(recordIndex);
      }

      recordIndex += 1;
      cursor.continue();
    };

    request.onerror = () => reject(request.error);
  });

  db.close();
  return results;
}

async function getMeasurementById(id: string): Promise<HrvMeasurement | null> {
  const db = await openDB();
  const tx = db.transaction('measurements', 'readonly');
  const store = tx.objectStore('measurements');

  return new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => {
      db.close();
      const measurement = validateMeasurement(request.result);
      if (!measurement && request.result !== undefined) {
        const warnings = createStoredRecordWarningLogger(
          'IndexedDB pulse variability measurements'
        );
        warnings.warn(0);
        warnings.summarize();
      }
      resolve(measurement);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

async function deleteMeasurement(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('measurements', 'readwrite');
  tx.objectStore('measurements').delete(id);
  await waitForTransaction(tx);
  db.close();
}

async function getLatestMeasurement(): Promise<HrvMeasurement | null> {
  const results = await getMeasurements({ limit: 1 });
  return results[0] ?? null;
}

async function getMeasurementStats(days: number = 30): Promise<MeasurementStats> {
  const after = new Date();
  after.setDate(after.getDate() - days);

  const measurements = await getMeasurements({ after });

  if (measurements.length === 0) {
    return {
      count: 0,
      avgRmssd: 0,
      avgSdnn: 0,
      avgLfPowerNorm: 0,
      avgMeanHR: 0,
      latestDate: null,
    };
  }

  const count = measurements.length;
  const avgRmssd = measurements.reduce((sum, m) => sum + m.analysis.timeDomain.rmssd, 0) / count;
  const avgSdnn = measurements.reduce((sum, m) => sum + m.analysis.timeDomain.sdnn, 0) / count;
  const availableFrequencyValues = measurements.flatMap((measurement) =>
    measurement.analysis.frequencyDomain.available
      ? [measurement.analysis.frequencyDomain.value]
      : []
  );
  const avgLfPowerNorm =
    availableFrequencyValues.length > 0
      ? availableFrequencyValues.reduce((sum, frequency) => sum + frequency.lfPowerNorm, 0) /
        availableFrequencyValues.length
      : 0;
  const avgMeanHR = measurements.reduce((sum, m) => sum + m.analysis.timeDomain.meanHR, 0) / count;

  // measurements are sorted descending so first is latest
  const latestDate = measurements[0].completedAt;

  return { count, avgRmssd, avgSdnn, avgLfPowerNorm, avgMeanHR, latestDate };
}

async function hasAnyMeasurements(): Promise<boolean> {
  return (await getMeasurements({ limit: 1 })).length > 0;
}

async function saveAssessment(result: AssessmentResult): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('assessments', 'readwrite');
  tx.objectStore('assessments').put(result);
  await waitForTransaction(tx);
  db.close();
}

async function getAssessments(): Promise<AssessmentResult[]> {
  const db = await openDB();
  const tx = db.transaction('assessments', 'readonly');
  const store = tx.objectStore('assessments');
  const index = store.index('completedAt');

  const results: AssessmentResult[] = [];
  const warnings = createStoredRecordWarningLogger('IndexedDB resonance assessments');
  let recordIndex = 0;

  await new Promise<void>((resolve, reject) => {
    const request = index.openCursor(null, 'prev'); // descending by completedAt

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (!cursor) {
        warnings.summarize();
        resolve();
        return;
      }
      const assessment = validateAssessment(cursor.value);
      if (assessment) {
        results.push(assessment);
      } else {
        warnings.warn(recordIndex);
      }
      recordIndex += 1;
      cursor.continue();
    };

    request.onerror = () => reject(request.error);
  });

  db.close();
  return results;
}

async function getLatestAssessment(): Promise<AssessmentResult | null> {
  const results = await getAssessments();
  return results[0] ?? null;
}

async function migrateLegacyAssessments(): Promise<void> {
  if (typeof localStorage === 'undefined') return;

  let stored: string | null;
  try {
    if (localStorage.getItem(ASSESSMENTS_MIGRATION_KEY) === 'complete') return;
    stored = localStorage.getItem(LEGACY_ASSESSMENTS_KEY);
  } catch (error) {
    console.warn('Failed to access legacy resonance assessments:', error);
    return;
  }
  if (!stored) return;

  let db: IDBDatabase | undefined;
  try {
    const assessments = validateStoredArray({
      key: LEGACY_ASSESSMENTS_KEY,
      value: stored,
      schema: AssessmentResultSchema,
      normalize: normalizeAssessment,
    });
    db = await openDB();
    const tx = db.transaction('assessments', 'readwrite');
    for (const assessment of assessments) {
      tx.objectStore('assessments').put(assessment);
    }
    await waitForTransaction(tx);
    db.close();
    db = undefined;
    localStorage.removeItem(LEGACY_ASSESSMENTS_KEY);
    localStorage.setItem(ASSESSMENTS_MIGRATION_KEY, 'complete');
  } catch (error) {
    db?.close();
    console.warn('Failed to migrate assessments from localStorage:', error);
  }
}

async function initialize(): Promise<void> {
  await migrateLegacyAssessments();
}

// Kept for callers from the earlier localStorage-only implementation.
const migrateFromLocalStorage = migrateLegacyAssessments;

export function useHrvStorage() {
  return {
    // Measurements
    saveMeasurement,
    getMeasurements,
    getMeasurementById,
    deleteMeasurement,
    getLatestMeasurement,
    getMeasurementStats,
    hasAnyMeasurements,

    // Assessments (migrated from localStorage)
    saveAssessment,
    getAssessments,
    getLatestAssessment,

    // Migration
    initialize,
    migrateLegacyAssessments,
    migrateFromLocalStorage,
  };
}
