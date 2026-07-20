import { describe, it, expect } from 'vitest';
import { assessSignalQuality, assessIBIQuality } from '../../src/dsp/signalQuality.js';
import type { DetectedPeak } from '../../src/dsp/peakDetection.js';

/**
 * Create synthetic perfect peaks at regular intervals.
 */
function createRegularPeaks(count: number, spacing: number, amplitude = 1): DetectedPeak[] {
  return Array.from({ length: count }, (_, i) => ({
    index: (i + 1) * spacing,
    amplitude,
  }));
}

/**
 * Generate a sine wave signal of given length.
 */
function generateSine(
  frequencyHz: number,
  sampleRateHz: number,
  numSamples: number,
  amplitude = 1
): number[] {
  return Array.from(
    { length: numSamples },
    (_, n) => amplitude * Math.sin((2 * Math.PI * frequencyHz * n) / sampleRateHz)
  );
}

/**
 * Generate random noise signal.
 */
function generateNoise(numSamples: number, seed = 123): number[] {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return ((s >>> 0) / 0xffffffff) * 2 - 1;
  };
  return Array.from({ length: numSamples }, rand);
}

describe('assessSignalQuality', () => {
  it('returns high quality for perfect sine wave with regular peaks', () => {
    // Perfect sine at 1 Hz, 100 Hz sample rate
    const signal = generateSine(1, 100, 600, 1);
    // Peaks at every 100 samples (at the sine maximum)
    const peaks = createRegularPeaks(5, 100, 1.0);
    const quality = assessSignalQuality(signal, peaks);
    expect(quality).toBeGreaterThan(0.6);
  });

  it('returns low quality for random noise with irregular peak positions', () => {
    const signal = generateNoise(500);
    // Simulate irregular peaks at random positions
    const peaks: DetectedPeak[] = [
      { index: 10, amplitude: 0.5 },
      { index: 25, amplitude: 0.9 },
      { index: 100, amplitude: 0.3 },
      { index: 150, amplitude: 0.8 },
      { index: 160, amplitude: 0.4 },
    ];
    const quality = assessSignalQuality(signal, peaks);
    expect(quality).toBeLessThan(0.7);
  });

  it('returns 0 for fewer than 2 peaks', () => {
    const signal = generateSine(1, 100, 200, 1);
    expect(assessSignalQuality(signal, [])).toBe(0);
    expect(assessSignalQuality(signal, [{ index: 25, amplitude: 1 }])).toBe(0);
  });

  it('consistent amplitudes improve quality score', () => {
    const signal = generateSine(1, 100, 600, 1);

    // Regular peaks with consistent amplitudes
    const consistentPeaks = createRegularPeaks(5, 100, 1.0);

    // Regular intervals but inconsistent amplitudes
    const inconsistentPeaks: DetectedPeak[] = [
      { index: 100, amplitude: 0.1 },
      { index: 200, amplitude: 0.9 },
      { index: 300, amplitude: 0.2 },
      { index: 400, amplitude: 0.8 },
      { index: 500, amplitude: 0.1 },
    ];

    const qualityConsistent = assessSignalQuality(signal, consistentPeaks);
    const qualityInconsistent = assessSignalQuality(signal, inconsistentPeaks);

    expect(qualityConsistent).toBeGreaterThan(qualityInconsistent);
  });
});

describe('assessIBIQuality', () => {
  it('returns high quality for physiologically valid IBIs', () => {
    // Normal resting HR ~60-70 bpm = 857-1000 ms intervals
    const intervals = [900, 920, 910, 890, 930, 905, 915];
    const quality = assessIBIQuality(intervals);
    expect(quality).toBeGreaterThan(0.8);
  });

  it('returns low quality for intervals outside physiological range', () => {
    // Extreme values outside 300-2000 ms range
    const intervals = [100, 150, 2500, 3000, 50, 200];
    const quality = assessIBIQuality(intervals);
    expect(quality).toBeLessThan(0.5);
  });

  it('returns 0 for empty array', () => {
    expect(assessIBIQuality([])).toBe(0);
  });

  it('returns 1 for single physiological interval', () => {
    expect(assessIBIQuality([800])).toBe(1);
  });

  it('returns 0 for single non-physiological interval', () => {
    expect(assessIBIQuality([50])).toBe(0);
  });

  it('penalizes sudden large jumps in interval series', () => {
    // Stable series with a large artifact
    const stableIntervals = [900, 910, 890, 905, 895, 900, 910];
    const artifactIntervals = [900, 910, 500, 905, 895, 900, 910]; // 500ms is a big jump

    const stableQuality = assessIBIQuality(stableIntervals);
    const artifactQuality = assessIBIQuality(artifactIntervals);

    expect(stableQuality).toBeGreaterThan(artifactQuality);
  });

  it('handles all intervals at boundary values', () => {
    // Exactly at the boundaries (300 and 2000 ms)
    const boundaryIntervals = [300, 2000, 300, 2000];
    const quality = assessIBIQuality(boundaryIntervals);
    // Range check should pass (boundaries are inclusive)
    expect(quality).toBeGreaterThan(0);
  });
});
