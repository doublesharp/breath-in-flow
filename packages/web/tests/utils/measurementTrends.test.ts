import { describe, expect, it } from 'vitest';
import type { HrvMeasurement } from '../../src/composables/useHrvStorage';
import {
  buildWithinPersonInsights,
  getComparableMeasurements,
} from '../../src/utils/measurementTrends';

function makeMeasurement(
  id: string,
  completedAt: string,
  overrides: Partial<HrvMeasurement> = {}
): HrvMeasurement {
  const date = new Date(completedAt);
  return {
    id,
    type: 'quick-check',
    startedAt: new Date(date.getTime() - 120_000),
    completedAt: date,
    durationSeconds: 120,
    sensorMode: 'camera',
    breathingRateBPM: 5.5,
    analysis: {
      timeDomain: {
        meanRR: 900,
        sdnn: 35,
        rmssd: 30,
        pnn50: 10,
        meanHR: 67,
        minHR: 60,
        maxHR: 75,
        hrRange: 15,
      },
      frequencyDomain: { available: false, reason: 'protocol-not-supported' },
      poincare: { available: false, reason: 'protocol-not-supported' },
      resonance: { available: false, reason: 'protocol-not-supported' },
      quality: {
        totalSamples: 120,
        artifactsDetected: 1,
        artifactPercentage: 1,
        meanSignalQuality: 0.9,
      },
      raw: { rrIntervals: [], timestamps: [], instantaneousHR: [] },
    },
    eligibility: {
      eligible: true,
      reasons: [],
      warnings: [],
      availableMetrics: ['average-pulse', 'rmssd', 'pnn50', 'sdnn-short-recording'],
      artifactPercentage: 1,
      meanQuality: 0.9,
      detectedBeatCount: 120,
      observedDurationSeconds: 120,
    },
    ...overrides,
  };
}

describe('measurement trends', () => {
  it('returns all eligible comparable records in chronological order', () => {
    const anchor = makeMeasurement('anchor', '2026-07-08T08:00:00Z', {
      analysis: {
        ...makeMeasurement('base', '2026-07-01T08:00:00Z').analysis,
        timeDomain: {
          ...makeMeasurement('base', '2026-07-01T08:00:00Z').analysis.timeDomain,
          rmssd: 45,
        },
      },
    });
    const measurements = [
      anchor,
      makeMeasurement('comparable-6', '2026-07-07T08:00:00Z'),
      makeMeasurement('other-protocol', '2026-07-06T08:00:00Z', { type: 'full-analysis' }),
      makeMeasurement('ineligible', '2026-07-05T08:00:00Z', {
        eligibility: {
          ...makeMeasurement('base', '2026-07-01T08:00:00Z').eligibility!,
          eligible: false,
          reasons: ['low-signal-quality'],
          availableMetrics: [],
        },
      }),
      makeMeasurement('missing-rmssd', '2026-07-04T08:00:00Z', {
        eligibility: {
          ...makeMeasurement('base', '2026-07-01T08:00:00Z').eligibility!,
          availableMetrics: ['average-pulse'],
        },
      }),
      makeMeasurement('different-sensor', '2026-07-03T18:00:00Z', { sensorMode: 'accelerometer' }),
      makeMeasurement('different-duration', '2026-07-03T16:00:00Z', { durationSeconds: 180 }),
      makeMeasurement('different-context', '2026-07-03T12:00:00Z', { breathingRateBPM: 6 }),
      makeMeasurement('comparable-3', '2026-07-03T08:00:00Z'),
      makeMeasurement('comparable-2', '2026-07-02T08:00:00Z'),
      makeMeasurement('comparable-1', '2026-07-01T08:00:00Z'),
    ];

    expect(
      getComparableMeasurements(measurements, anchor).map((measurement) => measurement.id)
    ).toEqual(['comparable-1', 'comparable-2', 'comparable-3', 'comparable-6', 'anchor']);
  });

  it('requires three comparable measurements before producing a directional insight', () => {
    const twoComparable = [
      makeMeasurement('older', '2026-07-01T08:00:00Z'),
      makeMeasurement('latest', '2026-07-02T08:00:00Z', {
        analysis: {
          ...makeMeasurement('base', '2026-07-01T08:00:00Z').analysis,
          timeDomain: {
            ...makeMeasurement('base', '2026-07-01T08:00:00Z').analysis.timeDomain,
            rmssd: 60,
          },
        },
      }),
      makeMeasurement('other-type', '2026-07-03T08:00:00Z', { type: 'full-analysis' }),
    ];

    expect(buildWithinPersonInsights(twoComparable)).toEqual([]);

    const insights = buildWithinPersonInsights([
      ...twoComparable,
      makeMeasurement('middle', '2026-07-01T12:00:00Z'),
    ]);
    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({ id: 'rmssd-comparison', direction: 'higher' });
    expect(insights[0].message).toContain('higher than your recent comparable measurements');
    expect(insights[0].message).toContain('same protocol, duration, sensor, and conditions');
  });
});
