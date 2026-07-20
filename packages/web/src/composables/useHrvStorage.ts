import type {
  AssessmentResult,
  DetectionMethod,
  HRVAnalysis,
  MeasurementEligibility,
  SensorSource,
} from '@breath-in-flow/shared';
import { parseJsonWithDateFields } from '@/utils/storageSerialization';

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
  avgLfPower: number;
  avgMeanHR: number;
  latestDate: Date | null;
}

const DB_NAME = 'breath-in-flow-hrv';
const DB_VERSION = 1;
const HRV_DATE_FIELDS = ['startedAt', 'completedAt'] as const;

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
        resolve();
        return;
      }

      const measurement = cursor.value as HrvMeasurement;

      // Apply type filter in JavaScript
      if (!query?.type || measurement.type === query.type) {
        results.push(measurement);
        if (query?.limit && results.length >= query.limit) {
          resolve();
          return;
        }
      }

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
      resolve(request.result ?? null);
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
      avgLfPower: 0,
      avgMeanHR: 0,
      latestDate: null,
    };
  }

  const count = measurements.length;
  const avgRmssd = measurements.reduce((sum, m) => sum + m.analysis.timeDomain.rmssd, 0) / count;
  const avgSdnn = measurements.reduce((sum, m) => sum + m.analysis.timeDomain.sdnn, 0) / count;
  const frequencyMeasurements = measurements.filter(
    (measurement) => measurement.analysis.frequencyDomain.available !== false
  );
  const avgLfPower =
    frequencyMeasurements.length > 0
      ? frequencyMeasurements.reduce(
          (sum, measurement) => sum + measurement.analysis.frequencyDomain.lfPower,
          0
        ) / frequencyMeasurements.length
      : 0;
  const avgMeanHR = measurements.reduce((sum, m) => sum + m.analysis.timeDomain.meanHR, 0) / count;

  // measurements are sorted descending so first is latest
  const latestDate = measurements[0].completedAt;

  return { count, avgRmssd, avgSdnn, avgLfPower, avgMeanHR, latestDate };
}

async function hasAnyMeasurements(): Promise<boolean> {
  const db = await openDB();
  const tx = db.transaction('measurements', 'readonly');
  const store = tx.objectStore('measurements');

  return new Promise((resolve, reject) => {
    const request = store.count();
    request.onsuccess = () => {
      db.close();
      resolve(request.result > 0);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
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

  await new Promise<void>((resolve, reject) => {
    const request = index.openCursor(null, 'prev'); // descending by completedAt

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (!cursor) {
        resolve();
        return;
      }
      results.push(cursor.value as AssessmentResult);
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

async function migrateFromLocalStorage(): Promise<void> {
  if (typeof localStorage === 'undefined') return;

  const stored = localStorage.getItem('breath-in-flow-assessments');
  if (!stored) return;

  try {
    const assessments = parseJsonWithDateFields<AssessmentResult[]>(stored, HRV_DATE_FIELDS);
    const db = await openDB();
    const tx = db.transaction('assessments', 'readwrite');
    for (const assessment of assessments) {
      tx.objectStore('assessments').put(assessment);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    localStorage.removeItem('breath-in-flow-assessments');
  } catch (e) {
    console.warn('Failed to migrate assessments from localStorage:', e);
  }
}

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
    migrateFromLocalStorage,
  };
}
