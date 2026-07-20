import { describe, expect, it } from 'vitest';
import { finalizeMeasurement, type IBISample } from '../../src/hrv/index.js';

function detectedSamplesSpanning(durationSeconds: number): IBISample[] {
  return Array.from({ length: durationSeconds + 1 }, (_, index) => ({
    timestamp: index * 1_000,
    interval: 1_000,
    quality: 0.9,
    provenance: { source: 'ppg', method: 'peak-detected' },
  }));
}

describe('finalizeMeasurement', () => {
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
});
