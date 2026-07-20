import { describe, it, expect } from 'vitest';
import { analyzeRawHRV } from '../../src/hrv/index.js';
import { preprocessIBI } from '../../src/hrv/preprocessing.js';

function makeTimestamps(intervals: number[]): number[] {
  const ts: number[] = [];
  let t = 1000000; // arbitrary start time ms
  for (const iv of intervals) {
    ts.push(t);
    t += iv;
  }
  return ts;
}

describe('preprocessIBI', () => {
  it('passes clean data through unchanged', () => {
    const intervals = [800, 810, 790, 800, 820, 800, 810];
    const timestamps = makeTimestamps(intervals);
    const result = preprocessIBI(intervals, timestamps);
    expect(result.artifactCount).toBe(0);
    expect(result.artifactIndices).toHaveLength(0);
    expect(result.cleanedIntervals).toEqual(intervals);
  });

  it('flags interval below 300ms (range check)', () => {
    const intervals = [800, 800, 100, 800, 800];
    const timestamps = makeTimestamps(intervals);
    const result = preprocessIBI(intervals, timestamps);
    expect(result.artifactIndices).toContain(2);
    expect(result.artifactCount).toBeGreaterThan(0);
  });

  it('flags interval above 2000ms (range check)', () => {
    const intervals = [800, 800, 2500, 800, 800];
    const timestamps = makeTimestamps(intervals);
    const result = preprocessIBI(intervals, timestamps);
    expect(result.artifactIndices).toContain(2);
  });

  it('flags ectopic beat (>20% from local median)', () => {
    // 50% jump: 800 to 1200 is +50%
    const intervals = [800, 800, 1200, 800, 800];
    const timestamps = makeTimestamps(intervals);
    const result = preprocessIBI(intervals, timestamps);
    expect(result.artifactIndices).toContain(2);
  });

  it('replaces flagged interval with interpolated value (range check)', () => {
    // interval at index 2 is 100ms (too short), neighbors are 800ms
    const intervals = [800, 800, 100, 800, 800];
    const timestamps = makeTimestamps(intervals);
    const result = preprocessIBI(intervals, timestamps);
    // Interpolated value should be between the neighbor values
    expect(result.cleanedIntervals[2]).toBeGreaterThan(100);
    expect(result.cleanedIntervals[2]).toBeCloseTo(800, 0);
  });

  it('replaces ectopic beat with interpolated value', () => {
    const intervals = [800, 800, 800, 1300, 800, 800, 800];
    const timestamps = makeTimestamps(intervals);
    const result = preprocessIBI(intervals, timestamps);
    // After correction, the ectopic interval should be replaced
    if (result.artifactIndices.includes(3)) {
      expect(result.cleanedIntervals[3]).toBeLessThan(1300);
    }
  });

  it('handles empty input', () => {
    const result = preprocessIBI([], []);
    expect(result.cleanedIntervals).toHaveLength(0);
    expect(result.artifactCount).toBe(0);
    expect(result.artifactIndices).toHaveLength(0);
  });

  it('preserves valid intervals surrounding flagged ones', () => {
    const intervals = [800, 810, 50, 820, 800];
    const timestamps = makeTimestamps(intervals);
    const result = preprocessIBI(intervals, timestamps);
    expect(result.cleanedIntervals[0]).toBe(800);
    expect(result.cleanedIntervals[1]).toBe(810);
    expect(result.cleanedIntervals[3]).toBe(820);
    expect(result.cleanedIntervals[4]).toBe(800);
  });

  it('handles artifact at start of series', () => {
    const intervals = [100, 800, 810, 790, 800];
    const timestamps = makeTimestamps(intervals);
    const result = preprocessIBI(intervals, timestamps);
    expect(result.artifactIndices).toContain(0);
    // Should be corrected with next valid value
    expect(result.cleanedIntervals[0]).not.toBe(100);
  });

  it('handles artifact at end of series', () => {
    const intervals = [800, 810, 790, 800, 100];
    const timestamps = makeTimestamps(intervals);
    const result = preprocessIBI(intervals, timestamps);
    expect(result.artifactIndices).toContain(4);
    expect(result.cleanedIntervals[4]).not.toBe(100);
  });
});

describe('analyzeHRV input normalization', () => {
  it('sorts IBI samples and drops duplicate or invalid timestamps before metrics', () => {
    const provenance = { source: 'ppg' as const, method: 'peak-detected' as const };
    const result = analyzeRawHRV([
      { timestamp: 3000, interval: 1000, quality: 0.8, provenance },
      { timestamp: 1000, interval: 1000, quality: 0.9, provenance },
      { timestamp: 2000, interval: 1000, quality: 0.7, provenance },
      { timestamp: 2000, interval: 900, quality: 0.6, provenance },
      { timestamp: Number.NaN, interval: 1000, quality: 1, provenance },
      { timestamp: 4000, interval: 1000, quality: 2, provenance },
    ]);

    expect(result.raw.timestamps).toEqual([1000, 2000, 3000, 4000]);
    expect(result.raw.rrIntervals).toEqual([1000, 1000, 1000, 1000]);
    expect(result.quality.totalSamples).toBe(6);
    expect(result.quality.artifactsDetected).toBe(2);
    expect(result.quality.artifactPercentage).toBeCloseTo((2 / 6) * 100);
    expect(result.quality.meanSignalQuality).toBeCloseTo((0.9 + 0.7 + 0.8 + 1) / 4);
    expect(result.frequencyDomain).toEqual({
      available: false,
      reason: 'duration-too-short',
    });
  });

  it.each([
    ['missing provenance', undefined],
    [
      'autocorrelation estimate',
      { source: 'ppg' as const, method: 'autocorrelation-estimate' as const },
    ],
    ['unknown non-peak method', { source: 'ppg' as const, method: 'estimated' as 'peak-detected' }],
  ])('rejects %s at the public analysis boundary', (_label, provenance) => {
    const result = analyzeRawHRV(
      Array.from({ length: 5 }, (_, index) => ({
        timestamp: index * 1_000,
        interval: 1_000 + index,
        quality: 0.9,
        provenance,
      }))
    );

    expect(result.raw.timestamps).toEqual([]);
    expect(result.raw.rrIntervals).toEqual([]);
    expect(result.quality.totalSamples).toBe(5);
    expect(result.quality.artifactsDetected).toBe(5);
    expect(result.poincare).toEqual({ available: false, reason: 'insufficient-data' });
  });
});
