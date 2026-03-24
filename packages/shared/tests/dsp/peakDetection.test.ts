import { describe, it, expect } from 'vitest';
import {
  detectPeaks,
  StreamingPeakDetector,
} from '../../src/dsp/peakDetection.js';

/**
 * Generate a sine wave signal.
 */
function generateSine(
  frequencyHz: number,
  sampleRateHz: number,
  numSamples: number,
  amplitude = 1,
  offset = 0,
): number[] {
  return Array.from({ length: numSamples }, (_, n) => {
    return (
      offset +
      amplitude * Math.sin((2 * Math.PI * frequencyHz * n) / sampleRateHz)
    );
  });
}

/**
 * Add random noise to a signal (using a seeded PRNG for reproducibility).
 */
function addNoise(signal: number[], amplitude: number, seed = 42): number[] {
  // Simple LCG PRNG
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return ((s >>> 0) / 0xffffffff) * 2 - 1;
  };
  return signal.map((val) => val + amplitude * rand());
}

describe('detectPeaks (batch)', () => {
  it('detects peaks in a simple sine wave', () => {
    // 1 Hz sine at 100 Hz sample rate → 100 samples per period
    const signal = generateSine(1, 100, 500, 1, 0);
    const peaks = detectPeaks(signal, {
      minPeakDistance: 50,
      thresholdFactor: 0.3,
      adaptiveWindow: 30,
    });

    // Expect approximately 4-5 peaks in 500 samples (5 periods)
    expect(peaks.length).toBeGreaterThanOrEqual(3);
    expect(peaks.length).toBeLessThanOrEqual(6);
  });

  it('peaks occur at approximately correct positions in sine wave', () => {
    // 1 Hz sine at 100 Hz sample rate, peaks at samples ~25, 125, 225, 325, 425
    const signal = generateSine(1, 100, 500, 1, 0);
    const peaks = detectPeaks(signal, {
      minPeakDistance: 50,
      thresholdFactor: 0.3,
      adaptiveWindow: 30,
    });

    // Each peak should be near the quarter-period mark
    // For sine starting at 0, peak at n = fs/4 = 25, 125, 225...
    if (peaks.length > 0) {
      const firstPeakPos = peaks[0].index;
      expect(firstPeakPos).toBeGreaterThan(20);
      expect(firstPeakPos).toBeLessThan(30);
    }
  });

  it('enforces minimum peak distance', () => {
    // High frequency sine — without min distance, would detect many peaks
    const signal = generateSine(10, 1000, 500, 1, 0);
    const minDist = 50; // Enforce 50 sample minimum
    const peaks = detectPeaks(signal, {
      minPeakDistance: minDist,
      thresholdFactor: 0.3,
    });

    for (let i = 1; i < peaks.length; i++) {
      const distance = peaks[i].index - peaks[i - 1].index;
      expect(distance).toBeGreaterThanOrEqual(minDist);
    }
  });

  it('returns no peaks for a flat (constant) signal', () => {
    const signal = new Array(100).fill(5);
    const peaks = detectPeaks(signal, { minPeakDistance: 10, thresholdFactor: 0.5 });
    expect(peaks).toHaveLength(0);
  });

  it('handles noisy sine wave and still detects main peaks', () => {
    const cleanSine = generateSine(1, 100, 400, 1, 0);
    const noisySine = addNoise(cleanSine, 0.2); // 20% noise amplitude

    const peaks = detectPeaks(noisySine, {
      minPeakDistance: 60,
      thresholdFactor: 0.4,
      adaptiveWindow: 40,
    });

    // Should detect roughly the right number of peaks (3-4 in 400 samples)
    expect(peaks.length).toBeGreaterThanOrEqual(2);
    expect(peaks.length).toBeLessThanOrEqual(6);
  });

  it('returns empty array for signal with fewer than 3 samples', () => {
    expect(detectPeaks([1, 2], { minPeakDistance: 1 })).toHaveLength(0);
    expect(detectPeaks([], { minPeakDistance: 1 })).toHaveLength(0);
  });
});

describe('StreamingPeakDetector', () => {
  it('detects peaks in a sine wave (streaming mode)', () => {
    const signal = generateSine(1, 100, 500, 1, 0);
    const detector = new StreamingPeakDetector({
      minPeakDistance: 50,
      thresholdFactor: 0.3,
      adaptiveWindow: 30,
    });

    const peaks = signal
      .map((val, idx) => detector.addSample(val, idx))
      .filter((p) => p !== null);

    expect(peaks.length).toBeGreaterThanOrEqual(3);
    expect(peaks.length).toBeLessThanOrEqual(6);
  });

  it('enforces minimum peak distance in streaming mode', () => {
    const signal = generateSine(10, 1000, 500, 1, 0);
    const minDist = 50;
    const detector = new StreamingPeakDetector({
      minPeakDistance: minDist,
      thresholdFactor: 0.3,
    });

    const peaks = signal
      .map((val) => detector.addSample(val))
      .filter((p) => p !== null);

    for (let i = 1; i < peaks.length; i++) {
      const distance = peaks[i]!.index - peaks[i - 1]!.index;
      expect(distance).toBeGreaterThanOrEqual(minDist);
    }
  });

  it('returns no peaks for a flat signal', () => {
    const signal = new Array(100).fill(5);
    const detector = new StreamingPeakDetector({ minPeakDistance: 10 });
    const peaks = signal
      .map((val) => detector.addSample(val))
      .filter((p) => p !== null);
    expect(peaks).toHaveLength(0);
  });

  it('reset clears state so re-processing gives same results', () => {
    const signal = generateSine(1, 100, 300, 1, 0);
    const detector = new StreamingPeakDetector({
      minPeakDistance: 50,
      thresholdFactor: 0.3,
      adaptiveWindow: 30,
    });

    const run1 = signal
      .map((val, idx) => detector.addSample(val, idx))
      .filter((p) => p !== null);

    detector.reset();

    const run2 = signal
      .map((val, idx) => detector.addSample(val, idx))
      .filter((p) => p !== null);

    expect(run1.length).toBe(run2.length);
    run1.forEach((peak, i) => {
      expect(peak!.index).toBe(run2[i]!.index);
    });
  });

  it('preserves timestamps when provided', () => {
    const signal = generateSine(1, 100, 300, 1, 0);
    const detector = new StreamingPeakDetector({
      minPeakDistance: 50,
      thresholdFactor: 0.3,
      adaptiveWindow: 30,
    });

    const peaks = signal
      .map((val, idx) => detector.addSample(val, idx * 10)) // 10ms per sample
      .filter((p) => p !== null);

    if (peaks.length > 0) {
      // Timestamps should be defined and correspond to sample indices
      expect(peaks[0]!.timestamp).toBeDefined();
    }
  });

  it('streaming results are consistent with batch results', () => {
    const signal = generateSine(1, 100, 500, 1, 0);
    const opts = {
      minPeakDistance: 60,
      thresholdFactor: 0.3,
      adaptiveWindow: 30,
    };

    const batchPeaks = detectPeaks(signal, opts);

    const detector = new StreamingPeakDetector(opts);
    const streamPeaks = signal
      .map((val) => detector.addSample(val))
      .filter((p) => p !== null);

    // Streaming detects peaks one sample late (needs the next sample to confirm)
    // so indices may differ by 0-1, but counts should be close
    const countDiff = Math.abs(batchPeaks.length - streamPeaks.length);
    expect(countDiff).toBeLessThanOrEqual(2);
  });
});
