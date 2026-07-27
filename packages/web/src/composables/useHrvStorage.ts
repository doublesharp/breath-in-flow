import type {
  AssessmentResult,
  DetectionMethod,
  HRVAnalysis,
  MeasurementEligibility,
  SensorSource,
} from '@breath-in-flow/shared';
import { AssessmentResultSchema } from '@breath-in-flow/shared';
import { isProxy, toRaw } from 'vue';
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
  acquisitionSources?: Array<'ppg' | 'scg'>;
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

// A detached copy of the HRV database contents for backup/restore work.
export interface HrvStorageSnapshot {
  measurements: HrvMeasurement[];
  assessments: AssessmentResult[];
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

function toStructuredCloneSafe(value: unknown): unknown {
  const unwrapped = isProxy(value) ? toRaw(value) : value;
  if (unwrapped instanceof Date) return new Date(unwrapped.getTime());
  if (Array.isArray(unwrapped)) return unwrapped.map(toStructuredCloneSafe);
  if (!isRecord(unwrapped)) return unwrapped;

  return Object.fromEntries(
    Object.entries(unwrapped).map(([key, nestedValue]) => [key, toStructuredCloneSafe(nestedValue)])
  );
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

function sanitizeAnalysis(analysis: HRVAnalysis): HRVAnalysis {
  return {
    timeDomain: {
      meanRR: analysis.timeDomain.meanRR,
      sdnn: analysis.timeDomain.sdnn,
      rmssd: analysis.timeDomain.rmssd,
      pnn50: analysis.timeDomain.pnn50,
      meanHR: analysis.timeDomain.meanHR,
      minHR: analysis.timeDomain.minHR,
      maxHR: analysis.timeDomain.maxHR,
      hrRange: analysis.timeDomain.hrRange,
    },
    frequencyDomain: analysis.frequencyDomain.available
      ? {
          available: true,
          value: {
            lfPowerNorm: analysis.frequencyDomain.value.lfPowerNorm,
            hfPowerNorm: analysis.frequencyDomain.value.hfPowerNorm,
            lfHfRatio: analysis.frequencyDomain.value.lfHfRatio,
            lfPeak: analysis.frequencyDomain.value.lfPeak,
            hfPeak: analysis.frequencyDomain.value.hfPeak,
            spectrum: analysis.frequencyDomain.value.spectrum.map((point) => ({
              frequency: point.frequency,
              power: point.power,
            })),
          },
        }
      : { available: false, reason: analysis.frequencyDomain.reason },
    poincare: analysis.poincare.available
      ? {
          available: true,
          value: {
            points: analysis.poincare.value.points.map((point) => ({
              previousInterval: point.previousInterval,
              nextInterval: point.nextInterval,
            })),
          },
        }
      : { available: false, reason: analysis.poincare.reason },
    resonance: analysis.resonance.available
      ? {
          available: true,
          value: {
            peakToTroughAmplitude: analysis.resonance.value.peakToTroughAmplitude,
            waveformSmoothness: analysis.resonance.value.waveformSmoothness,
            phaseSynchrony: analysis.resonance.value.phaseSynchrony,
            lfPeakCount: analysis.resonance.value.lfPeakCount,
            lfPeakAmplitude: analysis.resonance.value.lfPeakAmplitude,
          },
        }
      : { available: false, reason: analysis.resonance.reason },
    quality: {
      totalSamples: analysis.quality.totalSamples,
      artifactsDetected: analysis.quality.artifactsDetected,
      artifactPercentage: analysis.quality.artifactPercentage,
      meanSignalQuality: analysis.quality.meanSignalQuality,
    },
    raw: {
      rrIntervals: [...analysis.raw.rrIntervals],
      timestamps: [...analysis.raw.timestamps],
      instantaneousHR: [...analysis.raw.instantaneousHR],
    },
  };
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
  const acquisitionSources = value.acquisitionSources;
  const acquisitionSourcesAreValid =
    acquisitionSources === undefined ||
    (Array.isArray(acquisitionSources) &&
      acquisitionSources.length > 0 &&
      acquisitionSources.every((source) => source === 'ppg' || source === 'scg') &&
      new Set(acquisitionSources).size === acquisitionSources.length);
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
    'insufficient-coverage',
    'sample-gap-too-long',
    'sensor-error',
  ];
  const eligibilityWarnings = [
    'elevated-artifacts',
    'limited-coverage',
    'short-recording-sdnn',
  ];
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
      ['coveragePercentage', 'maximumGapSeconds'].every(
        (key) =>
          eligibility[key] === undefined ||
          (typeof eligibility[key] === 'number' && Number.isFinite(eligibility[key]))
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
      provenance.detectionMethods.every((method) => method === 'peak-detected'));

  if (
    typeof value.id !== 'string' ||
    !measurementTypes.includes(value.type as HrvMeasurement['type']) ||
    !sensorModes.includes(value.sensorMode as HrvMeasurement['sensorMode']) ||
    !acquisitionSourcesAreValid ||
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

  const measurement: HrvMeasurement = {
    id: value.id,
    type: value.type as HrvMeasurement['type'],
    startedAt,
    completedAt,
    durationSeconds: value.durationSeconds,
    sensorMode: value.sensorMode as HrvMeasurement['sensorMode'],
    analysis: sanitizeAnalysis(analysis),
  };

  if (Array.isArray(acquisitionSources)) {
    measurement.acquisitionSources = [
      ...acquisitionSources,
    ] as HrvMeasurement['acquisitionSources'];
  }
  if (typeof value.breathingRateBPM === 'number') {
    measurement.breathingRateBPM = value.breathingRateBPM;
  }
  if (typeof value.assessmentId === 'string') measurement.assessmentId = value.assessmentId;
  if (typeof value.notes === 'string') measurement.notes = value.notes;
  if (Array.isArray(value.tags)) measurement.tags = [...value.tags] as string[];
  if (typeof value.algorithmVersion === 'number') {
    measurement.algorithmVersion = value.algorithmVersion;
  }
  if (isRecord(eligibility)) {
    measurement.eligibility = {
      eligible: eligibility.eligible as boolean,
      reasons: [...(eligibility.reasons as MeasurementEligibility['reasons'])],
      warnings: [...(eligibility.warnings as MeasurementEligibility['warnings'])],
      availableMetrics: [
        ...(eligibility.availableMetrics as MeasurementEligibility['availableMetrics']),
      ],
      artifactPercentage: eligibility.artifactPercentage as number,
      meanQuality: eligibility.meanQuality as number,
      detectedBeatCount: eligibility.detectedBeatCount as number,
      observedDurationSeconds: eligibility.observedDurationSeconds as number,
      ...(typeof eligibility.coveragePercentage === 'number'
        ? { coveragePercentage: eligibility.coveragePercentage }
        : {}),
      ...(typeof eligibility.maximumGapSeconds === 'number'
        ? { maximumGapSeconds: eligibility.maximumGapSeconds }
        : {}),
    };
  }
  if (isRecord(provenance)) {
    measurement.sampleProvenance = {
      sources: [...(provenance.sources as SensorSource[])],
      detectionMethods: [...(provenance.detectionMethods as DetectionMethod[])],
    };
  }

  return measurement;
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
  const dto = validateMeasurement(toStructuredCloneSafe(measurement));
  if (!dto) throw new TypeError('Cannot save an invalid pulse variability measurement.');

  const db = await openDB();
  try {
    const tx = db.transaction('measurements', 'readwrite');
    tx.objectStore('measurements').put(dto);
    await waitForTransaction(tx);
  } finally {
    db.close();
  }
}

async function getMeasurements(query?: MeasurementQuery): Promise<HrvMeasurement[]> {
  const db = await openDB();
  try {
    const tx = db.transaction('measurements', 'readonly');
    const store = tx.objectStore('measurements');
    const index = store.index('completedAt');

    const results: HrvMeasurement[] = [];
    const warnings = createStoredRecordWarningLogger('IndexedDB pulse variability measurements');
    let recordIndex = 0;

    await new Promise<void>((resolve, reject) => {
      let keyRange: IDBKeyRange | null = null;
      if (query?.after && query?.before) {
        keyRange = IDBKeyRange.bound(query.after, query.before);
      } else if (query?.after) {
        keyRange = IDBKeyRange.lowerBound(query.after);
      } else if (query?.before) {
        keyRange = IDBKeyRange.upperBound(query.before);
      }

      const request = index.openCursor(keyRange, 'prev');

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cursor) {
          warnings.summarize();
          resolve();
          return;
        }

        const measurement = validateMeasurement(cursor.value);
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

    return results;
  } finally {
    db.close();
  }
}

async function getMeasurementById(id: string): Promise<HrvMeasurement | null> {
  const db = await openDB();
  try {
    const tx = db.transaction('measurements', 'readonly');
    const store = tx.objectStore('measurements');

    return await new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => {
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
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function deleteMeasurement(id: string): Promise<void> {
  const db = await openDB();
  try {
    const tx = db.transaction('measurements', 'readwrite');
    tx.objectStore('measurements').delete(id);
    await waitForTransaction(tx);
  } finally {
    db.close();
  }
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
  const dto = validateAssessment(toStructuredCloneSafe(result));
  if (!dto) throw new TypeError('Cannot save an invalid resonance assessment.');

  const db = await openDB();
  try {
    const tx = db.transaction('assessments', 'readwrite');
    tx.objectStore('assessments').put(dto);
    await waitForTransaction(tx);
  } finally {
    db.close();
  }
}

async function getAssessments(): Promise<AssessmentResult[]> {
  const db = await openDB();
  try {
    const tx = db.transaction('assessments', 'readonly');
    const store = tx.objectStore('assessments');
    const index = store.index('completedAt');

    const results: AssessmentResult[] = [];
    const warnings = createStoredRecordWarningLogger('IndexedDB resonance assessments');
    let recordIndex = 0;

    await new Promise<void>((resolve, reject) => {
      const request = index.openCursor(null, 'prev');

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

    return results;
  } finally {
    db.close();
  }
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
    try {
      const tx = db.transaction('assessments', 'readwrite');
      for (const assessment of assessments) {
        tx.objectStore('assessments').put(assessment);
      }
      await waitForTransaction(tx);
    } finally {
      db.close();
      db = undefined;
    }
    localStorage.removeItem(LEGACY_ASSESSMENTS_KEY);
    localStorage.setItem(ASSESSMENTS_MIGRATION_KEY, 'complete');
  } catch (error) {
    db?.close();
    console.warn('Failed to migrate assessments from localStorage:', error);
  }
}

async function exportHrvState(): Promise<HrvStorageSnapshot> {
  const measurements = await getMeasurements();
  const assessments = await getAssessments();
  return { measurements, assessments };
}

async function replaceHrvState(snapshot: HrvStorageSnapshot): Promise<void> {
  // Validate every record up front so an invalid entry rejects the whole
  // replacement before any store is touched.
  const measurements = snapshot.measurements.map((measurement) => {
    const dto = validateMeasurement(toStructuredCloneSafe(measurement));
    if (!dto) throw new TypeError('Cannot restore an invalid pulse variability measurement.');
    return dto;
  });
  const assessments = snapshot.assessments.map((assessment) => {
    const dto = validateAssessment(toStructuredCloneSafe(assessment));
    if (!dto) throw new TypeError('Cannot restore an invalid resonance assessment.');
    return dto;
  });

  const db = await openDB();
  try {
    // One transaction spanning both stores makes the replacement atomic: an
    // abort rolls both stores back rather than leaving one partially replaced.
    const tx = db.transaction(['measurements', 'assessments'], 'readwrite');
    const measurementsStore = tx.objectStore('measurements');
    const assessmentsStore = tx.objectStore('assessments');
    measurementsStore.clear();
    assessmentsStore.clear();
    for (const measurement of measurements) measurementsStore.put(measurement);
    for (const assessment of assessments) assessmentsStore.put(assessment);
    await waitForTransaction(tx);
  } finally {
    db.close();
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

    // Backup repository operations
    exportHrvState,
    replaceHrvState,
    // Validated measurement parsing for the backup coordinator (no raw DB access).
    parseMeasurement: validateMeasurement,

    // Migration
    initialize,
    migrateLegacyAssessments,
    migrateFromLocalStorage,
  };
}
