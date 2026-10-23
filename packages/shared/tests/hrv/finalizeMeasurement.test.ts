import { describe, expect, it } from 'vitest';
import { analyzeHRV, finalizeMeasurement, type IBISample } from '../../src/hrv/index.js';

function detectedSamplesSpanning(durationSeconds: number): IBISample[] {
  return Array.from({ length: durationSeconds + 1 }, (_, index) => ({
    timestamp: index * 1_000,
    interval: 1_000,
    quality: 0.9,
    provenance: { source: 'ppg', method: 'peak-detected' },
  }));
}

describe('finalizeMeasurement', () => {
  it.each([
    { index: 50, timestamp: -1_000 },
    { index: 50, timestamp: 200_000 },
    { index: 1, timestamp: 0 },
  ])('rejects non-monotonic timing before trimming can hide it: %o', ({ index, timestamp }) => {
    const samples = detectedSamplesSpanning(130);
    samples[index].timestamp = timestamp;
    const result = finalizeMeasurement(samples, 'morning-readiness', {
      settlingSeconds: 5,
      endingSeconds: 3,
    });

    expect(result.eligibility.eligible).toBe(false);
    expect(result.eligibility.reasons).toContain('non-monotonic-timestamps');
    expect(result.eligibility.availableMetrics).toEqual([]);
    expect(result.samples).toEqual(samples);
  });

  it.each([0, 50, 130])(
    'rejects an invalid timestamp at index %i before trimming can hide it',
    (index) => {
      const samples = detectedSamplesSpanning(130);
      samples[index].timestamp = NaN;
      const result = finalizeMeasurement(samples, 'morning-readiness', {
        settlingSeconds: 5,
        endingSeconds: 3,
      });
      expect(result.eligibility.eligible).toBe(false);
      expect(result.eligibility.reasons).toContain('invalid-sample');
      expect(result.eligibility.availableMetrics).toEqual([]);
      expect(result.samples).toEqual(samples);
      expect(result.analyzedDurationSeconds).toBe(0);
      const analysis = analyzeHRV(result);
      expect(analysis.quality.artifactsDetected).toBe(1);
      expect(analysis.frequencyDomain.available).toBe(false);
    }
  );

  it('returns an eligible 300-second analysis window after inclusive settling and ending trims', () => {
    const result = finalizeMeasurement(detectedSamplesSpanning(308), 'full-analysis', {
      settlingSeconds: 5,
      endingSeconds: 3,
    });

    expect(result.samples.at(0)?.timestamp).toBe(5_000);
    expect(result.samples.at(-1)?.timestamp).toBe(305_000);
    expect(result.analyzedDurationSeconds).toBe(300);
    expect(result.eligibility.eligible).toBe(true);
    expect(result.eligibility.availableMetrics).toContain('frequency-domain');
  });

  it('evaluates eligibility after trimming a nominal 300-second capture to 292 seconds', () => {
    const result = finalizeMeasurement(detectedSamplesSpanning(300), 'full-analysis', {
      settlingSeconds: 5,
      endingSeconds: 3,
    });

    expect(result.samples.at(0)?.timestamp).toBe(5_000);
    expect(result.samples.at(-1)?.timestamp).toBe(297_000);
    expect(result.analyzedDurationSeconds).toBe(292);
    expect(result.eligibility.eligible).toBe(false);
    expect(result.eligibility.reasons).toContain('duration-too-short');
    expect(result.eligibility.availableMetrics).not.toContain('frequency-domain');
  });

  it('returns an explicit ineligible result for an empty capture', () => {
    const result = finalizeMeasurement([], 'quick-check');

    expect(result.samples).toEqual([]);
    expect(result.analyzedDurationSeconds).toBe(0);
    expect(result.eligibility.eligible).toBe(false);
    expect(result.eligibility.reasons).toContain('duration-too-short');
  });

  it('returns zero analyzed duration for a retained singleton sample', () => {
    const sample = detectedSamplesSpanning(0);

    const result = finalizeMeasurement(sample, 'quick-check');

    expect(result.samples).toEqual(sample);
    expect(result.analyzedDurationSeconds).toBe(0);
    expect(result.eligibility.eligible).toBe(false);
    expect(result.eligibility.detectedBeatCount).toBe(1);
  });

  it('treats non-finite and negative trim options as zero', () => {
    const samples = detectedSamplesSpanning(60);
    const result = finalizeMeasurement(samples, 'quick-check', {
      settlingSeconds: Number.NaN,
      endingSeconds: -1,
    });

    expect(result.samples).toEqual(samples);
    expect(result.analyzedDurationSeconds).toBe(60);
    expect(result.eligibility.eligible).toBe(true);
  });
});
