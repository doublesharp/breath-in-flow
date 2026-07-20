import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useHrvStorage, type HrvMeasurement } from '../../src/composables/useHrvStorage';
import type { AssessmentResult } from '@breath-in-flow/shared';

function makeMeasurement(overrides: Partial<HrvMeasurement> = {}): HrvMeasurement {
  return {
    id: crypto.randomUUID(),
    type: 'quick-check',
    startedAt: new Date(),
    completedAt: new Date(),
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
      poincare: {
        available: true,
        value: { points: [] },
      },
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
    ...overrides,
  };
}

function makeAssessment(overrides: Partial<AssessmentResult> = {}): AssessmentResult {
  return {
    id: crypto.randomUUID(),
    trials: [
      {
        rate: 6.0,
        inhaleTime: 5,
        exhaleTime: 5,
        repetitions: 5,
        symptoms: [],
      },
    ],
    selectedRate: 6.0,
    completedAt: new Date(),
    config: {
      warmupDurationSeconds: 120,
      warmupRate: 6.0,
      restDurationSeconds: 120,
    },
    ...overrides,
  };
}

async function putRawRecord(storeName: 'measurements' | 'assessments', value: unknown) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('breath-in-flow-hrv', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).put(value);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}

beforeEach(async () => {
  localStorage.clear();
  // Delete database between tests for isolation
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('breath-in-flow-hrv');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
});

describe('useHrvStorage', () => {
  describe('saveMeasurement and getMeasurementById round-trip', () => {
    it('saves and retrieves a measurement by id', async () => {
      const { saveMeasurement, getMeasurementById } = useHrvStorage();
      const m = makeMeasurement();
      await saveMeasurement(m);
      const result = await getMeasurementById(m.id);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(m.id);
      expect(result!.type).toBe(m.type);
      expect(result!.durationSeconds).toBe(m.durationSeconds);
    });

    it('returns null for unknown id', async () => {
      const { getMeasurementById } = useHrvStorage();
      const result = await getMeasurementById('nonexistent-id');
      expect(result).toBeNull();
    });
  });

  describe('getMeasurements', () => {
    it('returns results sorted by completedAt descending', async () => {
      const { saveMeasurement, getMeasurements } = useHrvStorage();

      const older = makeMeasurement({ completedAt: new Date('2025-01-01T10:00:00Z') });
      const newer = makeMeasurement({ completedAt: new Date('2025-01-03T10:00:00Z') });
      const middle = makeMeasurement({ completedAt: new Date('2025-01-02T10:00:00Z') });

      await saveMeasurement(older);
      await saveMeasurement(newer);
      await saveMeasurement(middle);

      const results = await getMeasurements();
      expect(results).toHaveLength(3);
      expect(results[0].id).toBe(newer.id);
      expect(results[1].id).toBe(middle.id);
      expect(results[2].id).toBe(older.id);
    });

    it('returns all measurements when no query provided', async () => {
      const { saveMeasurement, getMeasurements } = useHrvStorage();
      await saveMeasurement(makeMeasurement());
      await saveMeasurement(makeMeasurement());

      const results = await getMeasurements();
      expect(results).toHaveLength(2);
    });
  });

  describe('getMeasurements with limit', () => {
    it('limits the number of returned results', async () => {
      const { saveMeasurement, getMeasurements } = useHrvStorage();

      for (let i = 0; i < 5; i++) {
        await saveMeasurement(makeMeasurement({ completedAt: new Date(Date.now() + i * 1000) }));
      }

      const results = await getMeasurements({ limit: 3 });
      expect(results).toHaveLength(3);
    });
  });

  describe('getMeasurements with date range filter', () => {
    it('filters by after date', async () => {
      const { saveMeasurement, getMeasurements } = useHrvStorage();

      const old = makeMeasurement({ completedAt: new Date('2025-01-01T00:00:00Z') });
      const recent = makeMeasurement({ completedAt: new Date('2025-06-01T00:00:00Z') });

      await saveMeasurement(old);
      await saveMeasurement(recent);

      const cutoff = new Date('2025-03-01T00:00:00Z');
      const results = await getMeasurements({ after: cutoff });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(recent.id);
    });

    it('filters by before date', async () => {
      const { saveMeasurement, getMeasurements } = useHrvStorage();

      const old = makeMeasurement({ completedAt: new Date('2025-01-01T00:00:00Z') });
      const recent = makeMeasurement({ completedAt: new Date('2025-06-01T00:00:00Z') });

      await saveMeasurement(old);
      await saveMeasurement(recent);

      const cutoff = new Date('2025-03-01T00:00:00Z');
      const results = await getMeasurements({ before: cutoff });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(old.id);
    });

    it('filters by after and before date range', async () => {
      const { saveMeasurement, getMeasurements } = useHrvStorage();

      const jan = makeMeasurement({ completedAt: new Date('2025-01-15T00:00:00Z') });
      const mar = makeMeasurement({ completedAt: new Date('2025-03-15T00:00:00Z') });
      const jun = makeMeasurement({ completedAt: new Date('2025-06-15T00:00:00Z') });

      await saveMeasurement(jan);
      await saveMeasurement(mar);
      await saveMeasurement(jun);

      const results = await getMeasurements({
        after: new Date('2025-02-01T00:00:00Z'),
        before: new Date('2025-05-01T00:00:00Z'),
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(mar.id);
    });
  });

  describe('getMeasurements with type filter', () => {
    it('filters by measurement type', async () => {
      const { saveMeasurement, getMeasurements } = useHrvStorage();

      const quickCheck = makeMeasurement({ type: 'quick-check' });
      const fullAnalysis = makeMeasurement({ type: 'full-analysis' });
      const morning = makeMeasurement({ type: 'morning-readiness' });

      await saveMeasurement(quickCheck);
      await saveMeasurement(fullAnalysis);
      await saveMeasurement(morning);

      const results = await getMeasurements({ type: 'quick-check' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(quickCheck.id);
    });
  });

  describe('deleteMeasurement', () => {
    it('removes the record', async () => {
      const { saveMeasurement, getMeasurementById, deleteMeasurement } = useHrvStorage();

      const m = makeMeasurement();
      await saveMeasurement(m);
      expect(await getMeasurementById(m.id)).not.toBeNull();

      await deleteMeasurement(m.id);
      expect(await getMeasurementById(m.id)).toBeNull();
    });
  });

  describe('getLatestMeasurement', () => {
    it('returns the most recent measurement', async () => {
      const { saveMeasurement, getLatestMeasurement } = useHrvStorage();

      const old = makeMeasurement({ completedAt: new Date('2025-01-01T00:00:00Z') });
      const newest = makeMeasurement({ completedAt: new Date('2025-12-31T00:00:00Z') });
      const mid = makeMeasurement({ completedAt: new Date('2025-06-01T00:00:00Z') });

      await saveMeasurement(old);
      await saveMeasurement(newest);
      await saveMeasurement(mid);

      const result = await getLatestMeasurement();
      expect(result).not.toBeNull();
      expect(result!.id).toBe(newest.id);
    });

    it('returns null when database is empty', async () => {
      const { getLatestMeasurement } = useHrvStorage();
      const result = await getLatestMeasurement();
      expect(result).toBeNull();
    });
  });

  describe('getMeasurementStats', () => {
    it('skips malformed nested analysis without hiding valid siblings or crashing stats', async () => {
      const { saveMeasurement, getMeasurements, getMeasurementStats } = useHrvStorage();
      const valid = makeMeasurement({ completedAt: new Date() });
      await saveMeasurement(valid);
      await putRawRecord('measurements', {
        ...valid,
        id: crypto.randomUUID(),
        completedAt: new Date(Date.now() + 1_000),
        analysis: {},
      });

      await expect(getMeasurementStats(30)).resolves.toEqual(expect.objectContaining({ count: 1 }));
      expect((await getMeasurements()).map((measurement) => measurement.id)).toEqual([valid.id]);
    });

    it('computes correct averages', async () => {
      const { saveMeasurement, getMeasurementStats } = useHrvStorage();

      const m1 = makeMeasurement({
        completedAt: new Date(),
        analysis: {
          ...makeMeasurement().analysis,
          timeDomain: {
            ...makeMeasurement().analysis.timeDomain,
            rmssd: 40,
            sdnn: 50,
            meanHR: 70,
          },
          frequencyDomain: {
            available: true,
            value: {
              lfPowerNorm: 30,
              hfPowerNorm: 70,
              lfHfRatio: 0.43,
              lfPeak: 0.1,
              hfPeak: 0.25,
              spectrum: [],
            },
          },
        },
      });
      const m2 = makeMeasurement({
        completedAt: new Date(),
        analysis: {
          ...makeMeasurement().analysis,
          timeDomain: {
            ...makeMeasurement().analysis.timeDomain,
            rmssd: 60,
            sdnn: 70,
            meanHR: 80,
          },
          frequencyDomain: {
            available: true,
            value: {
              lfPowerNorm: 50,
              hfPowerNorm: 50,
              lfHfRatio: 1,
              lfPeak: 0.1,
              hfPeak: 0.25,
              spectrum: [],
            },
          },
        },
      });

      await saveMeasurement(m1);
      await saveMeasurement(m2);

      const stats = await getMeasurementStats(30);
      expect(stats.count).toBe(2);
      expect(stats.avgRmssd).toBe(50); // (40+60)/2
      expect(stats.avgSdnn).toBe(60); // (50+70)/2
      expect(stats.avgMeanHR).toBe(75); // (70+80)/2
      expect(stats.avgLfPowerNorm).toBe(40); // (30+50)/2
      expect(stats.latestDate).not.toBeNull();
    });

    it('only includes measurements within the specified days range', async () => {
      const { saveMeasurement, getMeasurementStats } = useHrvStorage();

      const old = makeMeasurement({ completedAt: new Date('2020-01-01T00:00:00Z') });
      const recent = makeMeasurement({ completedAt: new Date() });

      await saveMeasurement(old);
      await saveMeasurement(recent);

      const stats = await getMeasurementStats(30);
      expect(stats.count).toBe(1);
    });

    it('does not average unavailable frequency values as real zero measurements', async () => {
      const { saveMeasurement, getMeasurementStats } = useHrvStorage();
      const available = makeMeasurement({
        analysis: {
          ...makeMeasurement().analysis,
          frequencyDomain: {
            available: true,
            value: {
              lfPowerNorm: 40,
              hfPowerNorm: 60,
              lfHfRatio: 0.67,
              lfPeak: 0.1,
              hfPeak: 0.25,
              spectrum: [],
            },
          },
        },
      });
      const unavailable = makeMeasurement({
        analysis: {
          ...makeMeasurement().analysis,
          frequencyDomain: {
            available: false,
            reason: 'protocol-not-supported',
          },
        },
      });

      await saveMeasurement(available);
      await saveMeasurement(unavailable);

      expect((await getMeasurementStats(30)).avgLfPowerNorm).toBe(40);
    });
  });

  describe('hasAnyMeasurements', () => {
    it('returns false when database is empty', async () => {
      const { hasAnyMeasurements } = useHrvStorage();
      expect(await hasAnyMeasurements()).toBe(false);
    });

    it('returns true after saving a measurement', async () => {
      const { saveMeasurement, hasAnyMeasurements } = useHrvStorage();
      await saveMeasurement(makeMeasurement());
      expect(await hasAnyMeasurements()).toBe(true);
    });

    it('does not count a malformed IndexedDB record as a usable measurement', async () => {
      const { saveMeasurement, deleteMeasurement, hasAnyMeasurements } = useHrvStorage();
      const seed = makeMeasurement();
      await saveMeasurement(seed);
      await deleteMeasurement(seed.id);
      await putRawRecord('measurements', {
        ...seed,
        id: crypto.randomUUID(),
        analysis: {},
      });

      expect(await hasAnyMeasurements()).toBe(false);
    });
  });

  describe('saveAssessment and getAssessments round-trip', () => {
    it('saves and retrieves assessments sorted by completedAt descending', async () => {
      const { saveAssessment, getAssessments } = useHrvStorage();

      const a1 = makeAssessment({ completedAt: new Date('2025-01-01T00:00:00Z') });
      const a2 = makeAssessment({ completedAt: new Date('2025-06-01T00:00:00Z') });

      await saveAssessment(a1);
      await saveAssessment(a2);

      const results = await getAssessments();
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe(a2.id); // most recent first
      expect(results[1].id).toBe(a1.id);
    });

    it('getLatestAssessment returns the most recent', async () => {
      const { saveAssessment, getLatestAssessment } = useHrvStorage();

      const a1 = makeAssessment({ completedAt: new Date('2025-01-01T00:00:00Z') });
      const a2 = makeAssessment({ completedAt: new Date('2025-06-01T00:00:00Z') });

      await saveAssessment(a1);
      await saveAssessment(a2);

      const result = await getLatestAssessment();
      expect(result).not.toBeNull();
      expect(result!.id).toBe(a2.id);
    });

    it('bounds corrupt IndexedDB assessment warnings and summarizes skipped records', async () => {
      const { saveAssessment, getAssessments } = useHrvStorage();
      const valid = makeAssessment();
      await saveAssessment(valid);
      for (let index = 0; index < 5; index += 1) {
        await putRawRecord('assessments', {
          id: crypto.randomUUID(),
          completedAt: new Date(Date.now() + index + 1),
        });
      }
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      expect(await getAssessments()).toEqual([expect.objectContaining({ id: valid.id })]);
      expect(warn).toHaveBeenCalledTimes(4);
      expect(warn.mock.calls.at(-1)?.[0]).toContain('Skipped 5 invalid records');
      warn.mockRestore();
    });
  });

  describe('migrateFromLocalStorage', () => {
    it('moves assessments from localStorage to IndexedDB and removes the key', async () => {
      const { migrateFromLocalStorage, getAssessments } = useHrvStorage();

      const a = makeAssessment();
      localStorage.setItem('breath-in-flow-assessments', JSON.stringify([a]));

      await migrateFromLocalStorage();

      expect(localStorage.getItem('breath-in-flow-assessments')).toBeNull();

      const results = await getAssessments();
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(a.id);
      expect(results[0].completedAt).toBeInstanceOf(Date);
    });

    it('does nothing when localStorage key is absent', async () => {
      const { migrateFromLocalStorage, getAssessments } = useHrvStorage();

      localStorage.removeItem('breath-in-flow-assessments');
      await migrateFromLocalStorage(); // should not throw

      const results = await getAssessments();
      expect(results).toHaveLength(0);
    });

    it('initializes an idempotent authoritative assessment migration without duplicating partial imports', async () => {
      const { initialize, saveAssessment, getAssessments } = useHrvStorage();
      const alreadyImported = makeAssessment();
      const legacyOnly = makeAssessment();
      await saveAssessment(alreadyImported);
      localStorage.setItem(
        'breath-in-flow-assessments',
        JSON.stringify([alreadyImported, legacyOnly])
      );

      await initialize();
      await initialize();

      const results = await getAssessments();
      expect(results.map((assessment) => assessment.id).sort()).toEqual(
        [alreadyImported.id, legacyOnly.id].sort()
      );
      expect(results.every((assessment) => assessment.completedAt instanceof Date)).toBe(true);
      expect(localStorage.getItem('breath-in-flow-assessments')).toBeNull();
      expect(localStorage.getItem('breath-in-flow-assessments-migration-v1')).toBe('complete');
    });

    it('preserves legacy source and migration marker when the IndexedDB transaction fails', async () => {
      const { migrateLegacyAssessments } = useHrvStorage();
      const legacyAssessment = makeAssessment();
      const legacySource = JSON.stringify([legacyAssessment]);
      localStorage.setItem('breath-in-flow-assessments', legacySource);
      const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
        throw new Error('simulated IndexedDB write failure');
      });

      await migrateLegacyAssessments();

      expect(localStorage.getItem('breath-in-flow-assessments')).toBe(legacySource);
      expect(localStorage.getItem('breath-in-flow-assessments-migration-v1')).toBeNull();
      put.mockRestore();
    });

    it('skips corrupt legacy records while migrating valid siblings', async () => {
      const { migrateLegacyAssessments, getAssessments } = useHrvStorage();
      const valid = makeAssessment();
      localStorage.setItem(
        'breath-in-flow-assessments',
        JSON.stringify([valid, { id: 'not-a-uuid', completedAt: 'not-a-date' }])
      );

      await migrateLegacyAssessments();

      expect(await getAssessments()).toEqual([expect.objectContaining({ id: valid.id })]);
    });
  });

  describe('empty database sensible defaults', () => {
    it('getMeasurements returns empty array', async () => {
      const { getMeasurements } = useHrvStorage();
      expect(await getMeasurements()).toEqual([]);
    });

    it('getAssessments returns empty array', async () => {
      const { getAssessments } = useHrvStorage();
      expect(await getAssessments()).toEqual([]);
    });

    it('getLatestAssessment returns null', async () => {
      const { getLatestAssessment } = useHrvStorage();
      expect(await getLatestAssessment()).toBeNull();
    });

    it('getMeasurementStats returns zeroed stats', async () => {
      const { getMeasurementStats } = useHrvStorage();
      const stats = await getMeasurementStats();
      expect(stats.count).toBe(0);
      expect(stats.avgRmssd).toBe(0);
      expect(stats.avgSdnn).toBe(0);
      expect(stats.avgLfPowerNorm).toBe(0);
      expect(stats.avgMeanHR).toBe(0);
      expect(stats.latestDate).toBeNull();
    });
  });
});
