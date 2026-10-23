import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, onTestFinished, vi } from 'vitest';
import { reactive } from 'vue';
import { useHrvStorage, type HrvMeasurement } from '../../src/composables/useHrvStorage';
import type { AssessmentResult, MeasurementEligibility } from '@breath-in-flow/shared';

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

function makePreAvailabilityMeasurement(overrides: Record<string, unknown> = {}) {
  const current = makeMeasurement();
  return {
    ...current,
    breathingRateBPM: 6,
    analysis: {
      timeDomain: current.analysis.timeDomain,
      frequencyDomain: {
        available: true,
        vlfPower: 100,
        lfPower: 300,
        hfPower: 200,
        totalPower: 600,
        lfPowerNorm: 60,
        hfPowerNorm: 40,
        lfHfRatio: 1.5,
        lfPeak: 0.1,
        hfPeak: 0.25,
        spectrum: [
          { frequency: 0.1, power: 2 },
          { frequency: 0.2, power: 3 },
        ],
      },
      resonance: {
        peakToTroughAmplitude: 15,
        waveformSmoothness: 0.7,
        phaseSynchrony: 0.8,
        lfPeakCount: 1,
        lfPeakAmplitude: 50,
      },
      quality: current.analysis.quality,
      raw: {
        rrIntervals: [800, 820, 790],
        timestamps: [0, 800, 1620],
        instantaneousHR: [75, 73.2, 75.9],
      },
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
        comfortRating: 4,
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

    it('deeply unwraps Vue-reactive measurement DTOs before writing to IndexedDB', async () => {
      const { saveMeasurement, getMeasurementById } = useHrvStorage();
      const base = makeMeasurement();
      const measurement: HrvMeasurement = {
        ...base,
        acquisitionSources: ['ppg'],
        analysis: reactive(base.analysis),
        eligibility: reactive<MeasurementEligibility>({
          eligible: true,
          reasons: [],
          warnings: ['short-recording-sdnn'],
          availableMetrics: ['average-pulse', 'rmssd', 'pnn50', 'sdnn-short-recording'],
          artifactPercentage: 1,
          meanQuality: 0.9,
          detectedBeatCount: 120,
          observedDurationSeconds: 120,
          coveragePercentage: 97,
          maximumGapSeconds: 1.2,
        }),
        sampleProvenance: reactive<NonNullable<HrvMeasurement['sampleProvenance']>>({
          sources: ['ppg'],
          detectionMethods: ['peak-detected'],
        }),
      };

      await expect(saveMeasurement(measurement)).resolves.toBeUndefined();

      const stored = await getMeasurementById(measurement.id);
      expect(stored).toMatchObject({
        id: measurement.id,
        acquisitionSources: ['ppg'],
        eligibility: {
          eligible: true,
          detectedBeatCount: 120,
          coveragePercentage: 97,
          maximumGapSeconds: 1.2,
        },
        sampleProvenance: { sources: ['ppg'], detectionMethods: ['peak-detected'] },
      });
      expect(stored?.analysis).toEqual(measurement.analysis);
    });

    it('persists only validated measurement fields so transient values cannot reach IndexedDB', async () => {
      const { saveMeasurement, getMeasurementById } = useHrvStorage();
      const measurement = {
        ...makeMeasurement(),
        transientCallback: () => undefined,
      };

      await expect(saveMeasurement(measurement)).resolves.toBeUndefined();

      const stored = await getMeasurementById(measurement.id);
      expect(stored).not.toHaveProperty('transientCallback');
    });
  });

  describe('getMeasurements', () => {
    it('normalizes the exact pre-availability analysis shape without exposing absolute power', async () => {
      const { saveMeasurement, deleteMeasurement, getMeasurementById, getMeasurementStats } =
        useHrvStorage();
      const legacy = makePreAvailabilityMeasurement({ completedAt: new Date() });
      const seed = makeMeasurement();
      await saveMeasurement(seed);
      await deleteMeasurement(seed.id);
      await putRawRecord('measurements', legacy);

      const result = await getMeasurementById(legacy.id as string);

      expect(result).not.toBeNull();
      expect(result?.analysis.frequencyDomain).toEqual({
        available: true,
        value: {
          lfPowerNorm: 60,
          hfPowerNorm: 40,
          lfHfRatio: 1.5,
          lfPeak: 0.1,
          hfPeak: 0.25,
          spectrum: [
            { frequency: 0.1, power: 40 },
            { frequency: 0.2, power: 60 },
          ],
        },
      });
      expect(result?.analysis.frequencyDomain).not.toHaveProperty('lfPower');
      expect(result?.analysis.poincare).toEqual({
        available: true,
        value: {
          points: [
            { previousInterval: 800, nextInterval: 820 },
            { previousInterval: 820, nextInterval: 790 },
          ],
        },
      });
      expect(result?.analysis.resonance).toEqual({
        available: true,
        value: {
          peakToTroughAmplitude: 15,
          waveformSmoothness: 0.7,
          phaseSynchrony: 0.8,
          lfPeakCount: 1,
          lfPeakAmplitude: 40,
        },
      });
      await expect(getMeasurementStats(30)).resolves.toEqual(
        expect.objectContaining({ count: 1, avgLfPowerNorm: 60 })
      );
    });

    it('validates every optional field and bounds warnings while preserving valid siblings', async () => {
      const { saveMeasurement, getMeasurements } = useHrvStorage();
      const valid = makeMeasurement({
        breathingRateBPM: 6,
        assessmentId: 'assessment-1',
        notes: 'Morning practice',
        tags: ['morning'],
        algorithmVersion: 2,
        eligibility: {
          eligible: true,
          reasons: [],
          warnings: [],
          availableMetrics: ['average-pulse'],
          artifactPercentage: 1,
          meanQuality: 0.9,
          detectedBeatCount: 100,
          observedDurationSeconds: 120,
        },
        sampleProvenance: {
          sources: ['ppg'],
          detectionMethods: ['peak-detected'],
        },
      });
      const invalidOverrides = [
        { breathingRateBPM: Number.NaN },
        { assessmentId: 42 },
        { notes: false },
        { tags: ['valid', 7] },
        { algorithmVersion: 1.5 },
        { eligibility: { eligible: true } },
        { eligibility: { ...valid.eligibility, detectedBeatCount: 1.5 } },
        {
          sampleProvenance: {
            sources: ['synthetic'],
            detectionMethods: ['peak-detected'],
          },
        },
        {
          sampleProvenance: {
            sources: ['ppg'],
            detectionMethods: ['autocorrelation-estimate'],
          },
        },
        { acquisitionSources: [] },
      ];
      await saveMeasurement(valid);
      for (const [index, override] of invalidOverrides.entries()) {
        await putRawRecord('measurements', {
          ...makeMeasurement(),
          ...override,
          id: crypto.randomUUID(),
          completedAt: new Date(Date.now() + index + 1),
        });
      }
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      expect((await getMeasurements()).map((measurement) => measurement.id)).toEqual([valid.id]);
      expect(warn).toHaveBeenCalledTimes(4);
      expect(warn.mock.calls.at(-1)?.[0]).toContain('Skipped 10 invalid records');
      warn.mockRestore();
    });

    it('rejects availability reasons outside the current analysis contract', async () => {
      const { saveMeasurement, getMeasurements } = useHrvStorage();
      const valid = makeMeasurement();
      await saveMeasurement(valid);
      await putRawRecord('measurements', {
        ...makeMeasurement(),
        id: crypto.randomUUID(),
        analysis: {
          ...makeMeasurement().analysis,
          frequencyDomain: { available: false, reason: 'fabricated-reason' },
        },
      });

      expect((await getMeasurements()).map((measurement) => measurement.id)).toEqual([valid.id]);
    });

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
    it('deeply unwraps Vue-reactive assessment trials before writing to IndexedDB', async () => {
      const { saveAssessment, getLatestAssessment } = useHrvStorage();
      const assessment = makeAssessment({
        trials: reactive([
          {
            rate: 6,
            inhaleTime: 5,
            exhaleTime: 5,
            repetitions: 12,
            comfortRating: 4,
            symptoms: ['airHunger'],
            notes: 'Kept the breath light.',
          },
        ]) as AssessmentResult['trials'],
      });

      await expect(saveAssessment(assessment)).resolves.toBeUndefined();

      expect(await getLatestAssessment()).toMatchObject({
        id: assessment.id,
        trials: [
          {
            rate: 6,
            comfortRating: 4,
            symptoms: ['airHunger'],
            notes: 'Kept the breath light.',
          },
        ],
      });
    });

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

    it('bounds warnings while individually skipping scientifically invalid legacy assessments', async () => {
      const { migrateLegacyAssessments, getAssessments } = useHrvStorage();
      const valid = makeAssessment();
      const invalid = Array.from({ length: 5 }, (_, index) => ({
        ...makeAssessment(),
        id: crypto.randomUUID(),
        selectedRate: 4.5 + index * 0.1,
      }));
      localStorage.setItem('breath-in-flow-assessments', JSON.stringify([valid, ...invalid]));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      await migrateLegacyAssessments();

      expect(await getAssessments()).toEqual([expect.objectContaining({ id: valid.id })]);
      expect(warn).toHaveBeenCalledTimes(4);
      expect(warn.mock.calls.at(-1)?.[0]).toContain('Skipped 5 invalid records');
      warn.mockRestore();
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

  describe('snapshot repository (backup)', () => {
    it('requires migration before replacement so initialization cannot reintroduce legacy data', async () => {
      const hrv = useHrvStorage();
      localStorage.setItem('breath-in-flow-assessments', JSON.stringify([makeAssessment()]));

      await hrv.replaceHrvState({ measurements: [], assessments: [] });
      await hrv.initialize();

      expect(await hrv.getAssessments()).toEqual([]);
    });

    it('blocks export and replacement if legacy storage cannot be read', async () => {
      const hrv = useHrvStorage();
      const original = makeMeasurement();
      await hrv.saveMeasurement(original);
      const getItem = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
        throw new Error('storage access blocked');
      });
      onTestFinished(() => getItem.mockRestore());

      await expect(hrv.exportHrvState()).rejects.toThrow(/migrat/i);
      await expect(hrv.replaceHrvState({ measurements: [], assessments: [] })).rejects.toThrow(
        /migrat/i
      );
      expect(await hrv.getMeasurementById(original.id)).toEqual(original);
    });

    it.each(['measurements', 'assessments'] as const)(
      'rejects duplicate %s before replacing either store',
      async (collection) => {
        const hrv = useHrvStorage();
        const original = makeMeasurement();
        await hrv.saveMeasurement(original);
        const snapshot = { measurements: [makeMeasurement()], assessments: [makeAssessment()] };
        snapshot[collection].push(snapshot[collection][0] as never);

        await expect(hrv.replaceHrvState(snapshot)).rejects.toThrow(/ID/i);
        expect(await hrv.getMeasurements()).toEqual([original]);
        expect(await hrv.getAssessments()).toEqual([]);
      }
    );

    it.each([false, true])(
      'aborts both stores when enqueuing throws, already aborted: %s',
      async (alreadyAborted) => {
        const hrv = useHrvStorage();
        const originalMeasurement = makeMeasurement();
        const originalAssessment = makeAssessment();
        await hrv.saveMeasurement(originalMeasurement);
        await hrv.saveAssessment(originalAssessment);
        const realPut = IDBObjectStore.prototype.put;
        const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
          this: IDBObjectStore,
          value: unknown
        ) {
          if (this.name === 'assessments') {
            if (alreadyAborted) this.transaction.abort();
            throw new Error('Cannot enqueue assessment');
          }
          return realPut.call(this, value);
        });
        onTestFinished(() => put.mockRestore());

        await expect(
          hrv.replaceHrvState({
            measurements: [makeMeasurement()],
            assessments: [makeAssessment()],
          })
        ).rejects.toThrow('Cannot enqueue assessment');

        expect(await hrv.getMeasurements()).toEqual([originalMeasurement]);
        expect(await hrv.getAssessments()).toEqual([originalAssessment]);
      }
    );

    it('requires legacy cleanup to succeed before replacing assessments', async () => {
      const hrv = useHrvStorage();
      const original = makeAssessment();
      localStorage.setItem('breath-in-flow-assessments', JSON.stringify([original]));
      const remove = vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
        throw new Error('legacy cleanup blocked');
      });
      onTestFinished(() => remove.mockRestore());

      await expect(hrv.replaceHrvState({ measurements: [], assessments: [] })).rejects.toThrow(
        /migrat/i
      );
      expect(await hrv.getAssessments()).toEqual([original]);
      expect(localStorage.getItem('breath-in-flow-assessments')).not.toBeNull();

      remove.mockRestore();
      await hrv.replaceHrvState({ measurements: [], assessments: [] });
      await hrv.initialize();
      expect(await hrv.getAssessments()).toEqual([]);
    });

    it('shares in-flight migration between Lab initialization and backup reads', async () => {
      const hrv = useHrvStorage();
      const original = makeAssessment();
      localStorage.setItem('breath-in-flow-assessments', JSON.stringify([original]));
      const put = vi.spyOn(IDBObjectStore.prototype, 'put');
      onTestFinished(() => put.mockRestore());

      const [, snapshot] = await Promise.all([hrv.initialize(), hrv.exportHrvState()]);

      expect(snapshot.assessments).toEqual([original]);
      expect(put).toHaveBeenCalledTimes(1);
    });

    it('exportHrvState returns both measurements and assessments via validated readers', async () => {
      const hrv = useHrvStorage();
      await hrv.saveMeasurement(makeMeasurement());
      await hrv.saveAssessment(makeAssessment());

      const snapshot = await hrv.exportHrvState();
      expect(snapshot.measurements).toHaveLength(1);
      expect(snapshot.assessments).toHaveLength(1);
    });

    it('replaceHrvState atomically clears both stores', async () => {
      const hrv = useHrvStorage();
      await hrv.saveMeasurement(makeMeasurement());
      await hrv.saveAssessment(makeAssessment());

      const snapshot = await hrv.exportHrvState();
      expect(snapshot.measurements).toHaveLength(1);
      expect(snapshot.assessments).toHaveLength(1);

      await hrv.replaceHrvState({ measurements: [], assessments: [] });
      expect(await hrv.getMeasurements()).toEqual([]);
      expect(await hrv.getAssessments()).toEqual([]);
    });

    it('replaceHrvState swaps prior records for the provided snapshot', async () => {
      const hrv = useHrvStorage();
      await hrv.saveMeasurement(makeMeasurement());

      const replacement = makeMeasurement();
      const replacementAssessment = makeAssessment();
      await hrv.replaceHrvState({
        measurements: [replacement],
        assessments: [replacementAssessment],
      });

      expect((await hrv.getMeasurements()).map((m) => m.id)).toEqual([replacement.id]);
      expect((await hrv.getAssessments()).map((a) => a.id)).toEqual([replacementAssessment.id]);
    });

    it('rejects the replacement before opening a transaction when a record is invalid', async () => {
      const hrv = useHrvStorage();
      const original = makeMeasurement();
      await hrv.saveMeasurement(original);

      const invalid = { ...makeMeasurement(), analysis: {} } as unknown as HrvMeasurement;
      await expect(
        hrv.replaceHrvState({ measurements: [makeMeasurement(), invalid], assessments: [] })
      ).rejects.toThrow();

      expect((await hrv.getMeasurements()).map((m) => m.id)).toEqual([original.id]);
    });

    it('leaves neither store partially replaced when the transaction aborts', async () => {
      const hrv = useHrvStorage();
      const originalMeasurement = makeMeasurement();
      const originalAssessment = makeAssessment();
      await hrv.saveMeasurement(originalMeasurement);
      await hrv.saveAssessment(originalAssessment);

      const realPut = IDBObjectStore.prototype.put;
      // Abort the single transaction while writing the assessments store. If the
      // implementation used two transactions the measurements write would have
      // already committed, so this proves both stores roll back together.
      const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
        this: IDBObjectStore,
        value: unknown
      ) {
        if (this.name === 'assessments') {
          this.transaction.abort();
          return {} as IDBRequest;
        }
        return realPut.call(this, value);
      });

      let aborted = false;
      try {
        await hrv.replaceHrvState({
          measurements: [makeMeasurement()],
          assessments: [makeAssessment()],
        });
      } catch {
        aborted = true;
      }

      putSpy.mockRestore();

      expect(aborted).toBe(true);
      expect((await hrv.getMeasurements()).map((m) => m.id)).toEqual([originalMeasurement.id]);
      expect((await hrv.getAssessments()).map((a) => a.id)).toEqual([originalAssessment.id]);
    });

    it('exposes validated measurement parsing without exposing raw IndexedDB access', () => {
      const hrv = useHrvStorage();
      expect(hrv).not.toHaveProperty('openDB');
      expect(hrv.parseMeasurement(makeMeasurement())).not.toBeNull();
      expect(hrv.parseMeasurement({ id: 'not-a-measurement' })).toBeNull();
    });
  });
});
