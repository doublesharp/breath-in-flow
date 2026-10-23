import { describe, it, expect } from 'vitest';
import { detectPeaks, StreamingPeakDetector } from '../../src/dsp/peakDetection.js';

/**
 * Generate a sine wave signal.
 */
function generateSine(
  frequencyHz: number,
  sampleRateHz: number,
  numSamples: number,
  amplitude = 1,
  offset = 0
): number[] {
  return Array.from({ length: numSamples }, (_, n) => {
    return offset + amplitude * Math.sin((2 * Math.PI * frequencyHz * n) / sampleRateHz);
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

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
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

    // For sine starting at 0, every peak is at a quarter-period offset.
    expect(peaks.map((peak) => peak.index)).toEqual([25, 125, 225, 325, 425]);
  });

  it('enforces minimum peak distance', () => {
    // High frequency sine — without min distance, would detect many peaks
    const signal = generateSine(10, 1000, 500, 1, 0);
    const minDist = 50; // Enforce 50 sample minimum
    const peaks = detectPeaks(signal, {
      minPeakDistance: minDist,
      thresholdFactor: 0.3,
    });

    expect(peaks).toHaveLength(5);
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

describe('detectPeaks (batch) — prominence filter', () => {
  it.each([
    {
      name: 'a smaller right shoulder inside the refractory period',
      signal: [0, 0, 10, 9, 9.5, 0, 0, 0, 0, 0],
      minPeakDistance: 4,
      indices: [2],
    },
    {
      name: 'a smaller rejected left shoulder before the dominant peak',
      signal: [0, 0, 9.5, 9, 10, 0, 0, 0, 0, 0],
      minPeakDistance: 4,
      indices: [4],
    },
    {
      name: 'smaller shoulders on both sides of the dominant peak',
      signal: [0, 0, 9.5, 9, 10, 9, 9.5, 0, 0, 0],
      minPeakDistance: 4,
      indices: [4],
    },
    {
      name: 'multiple smaller shoulders extending past the refractory period',
      signal: [0, 0, 10, 9, 9.5, 8, 9, 7, 8.5, 0, 0],
      minPeakDistance: 4,
      indices: [2],
    },
    {
      name: 'equal-height peaks separated by a shallow valley',
      signal: [0, 0, 10, 9, 10, 0, 0, 0],
      minPeakDistance: 1,
      indices: [2, 4],
    },
  ])('finds the full prominence despite $name', ({ signal, minPeakDistance, indices }) => {
    const peaks = detectPeaks(signal, {
      minPeakDistance,
      adaptiveWindow: 10,
      thresholdFactor: 0,
      minProminence: 0.2,
    });

    expect(peaks).toEqual(indices.map((index) => ({ index, amplitude: signal[index] })));
  });

  it('stops prominence at higher samples even when they are not peak candidates', () => {
    // The taller plateau is not a strict local maximum, but it bounds both small peaks.
    expect(
      detectPeaks([0, 2, 1, 10, 10, 1, 2, 0], {
        minPeakDistance: 1,
        adaptiveWindow: 2,
        thresholdFactor: 0,
        minProminence: 0.15,
      })
    ).toEqual([]);
  });

  it('does not let a rejected bump consume the refractory period', () => {
    expect(
      detectPeaks([0, 0.2, 0, 1, 0, 0, 0], {
        minPeakDistance: 4,
        adaptiveWindow: 10,
        thresholdFactor: 0.1,
        minProminence: 0.5,
      })
    ).toEqual([{ index: 3, amplitude: 1 }]);
  });

  it('rejects low-prominence peaks when minProminence is set', () => {
    // Construct a signal with one tall peak and one shallow bump
    // Tall peak at index 10: rises to 10 above a baseline of 0
    // Shallow bump at index 30: rises to 1 above a baseline of 0
    // Signal range ~ 10, so minProminence=0.3 → threshold = 3
    const signal: number[] = new Array(50).fill(0);
    // Tall peak
    signal[8] = 3;
    signal[9] = 7;
    signal[10] = 10;
    signal[11] = 7;
    signal[12] = 3;
    // Shallow bump (prominence ~1, below 30% of range=10 → rejected)
    signal[28] = 0.4;
    signal[29] = 0.8;
    signal[30] = 1.0;
    signal[31] = 0.8;
    signal[32] = 0.4;

    const peaksWithProminence = detectPeaks(signal, {
      minPeakDistance: 5,
      thresholdFactor: 0.1,
      adaptiveWindow: 5,
      minProminence: 0.3,
    });

    const peaksWithoutProminence = detectPeaks(signal, {
      minPeakDistance: 5,
      thresholdFactor: 0.1,
      adaptiveWindow: 5,
    });

    expect(peaksWithoutProminence.map((peak) => peak.index)).toEqual([10, 30]);
    expect(peaksWithProminence).toEqual([{ index: 10, amplitude: 10 }]);
  });

  it('accepts all peaks when minProminence is 0 (disabled)', () => {
    const signal = generateSine(1, 100, 500, 1, 0);
    const peaks = detectPeaks(signal, {
      minPeakDistance: 50,
      thresholdFactor: 0.3,
      adaptiveWindow: 30,
      minProminence: 0,
    });

    // Should behave identically to no prominence setting
    const peaksDefault = detectPeaks(signal, {
      minPeakDistance: 50,
      thresholdFactor: 0.3,
      adaptiveWindow: 30,
    });

    expect(peaks.length).toBe(peaksDefault.length);
  });
});

describe('StreamingPeakDetector', () => {
  it('recovers after an old amplitude spike leaves the adaptive window', () => {
    const detector = new StreamingPeakDetector({
      minPeakDistance: 20,
      adaptiveWindow: 30,
      thresholdFactor: 0.1,
      minProminence: 0.5,
    });
    const signal = Array.from({ length: 1000 }, (_, i) =>
      i === 10 ? 100 : i >= 60 && i % 50 === 10 ? 1 : 0
    );
    const peaks = signal
      .map((value, i) => detector.addSample(value, i * 10))
      .filter((peak) => peak !== null);
    expect(peaks).toEqual([
      { index: 10, amplitude: 100, timestamp: 100 },
      ...Array.from({ length: 19 }, (_, i) => ({
        index: 60 + i * 50,
        amplitude: 1,
        timestamp: (60 + i * 50) * 10,
      })),
    ]);
  });

  it('bounds retained samples and timestamps even when no peaks are found', () => {
    const detector = new StreamingPeakDetector({ minPeakDistance: 20, adaptiveWindow: 30 });
    for (let i = 0; i < 10_000; i++) detector.addSample(0, i);
    // Inspect only retained storage: output assertions alone cannot detect a memory leak.
    const retained = detector as unknown as { buffer: number[]; timestamps: number[] };
    expect(retained.buffer.length).toBeLessThanOrEqual(32);
    expect(retained.timestamps.length).toBe(retained.buffer.length);
  });

  it('detects peaks in a sine wave (streaming mode)', () => {
    const signal = generateSine(1, 100, 500, 1, 0);
    const detector = new StreamingPeakDetector({
      minPeakDistance: 50,
      thresholdFactor: 0.3,
      adaptiveWindow: 30,
    });

    const peaks = signal.map((val, idx) => detector.addSample(val, idx)).filter((p) => p !== null);

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

    const peaks = signal.map((val) => detector.addSample(val)).filter((p) => p !== null);

    for (let i = 1; i < peaks.length; i++) {
      const distance = peaks[i]!.index - peaks[i - 1]!.index;
      expect(distance).toBeGreaterThanOrEqual(minDist);
    }
  });

  it('returns no peaks for a flat signal', () => {
    const signal = new Array(100).fill(5);
    const detector = new StreamingPeakDetector({ minPeakDistance: 10 });
    const peaks = signal.map((val) => detector.addSample(val)).filter((p) => p !== null);
    expect(peaks).toHaveLength(0);
  });

  it('reset clears state so re-processing gives same results', () => {
    const signal = generateSine(1, 100, 300, 1, 0);
    const detector = new StreamingPeakDetector({
      minPeakDistance: 50,
      thresholdFactor: 0.3,
      adaptiveWindow: 30,
    });

    const run1 = signal.map((val, idx) => detector.addSample(val, idx)).filter((p) => p !== null);

    detector.reset();

    const run2 = signal.map((val, idx) => detector.addSample(val, idx)).filter((p) => p !== null);

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
    const streamPeaks = signal.map((val) => detector.addSample(val)).filter((p) => p !== null);

    // Streaming detects peaks one sample late (needs the next sample to confirm)
    // so indices may differ by 0-1, but counts should be close
    const countDiff = Math.abs(batchPeaks.length - streamPeaks.length);
    expect(countDiff).toBeLessThanOrEqual(2);
  });

  it('prominence filter rejects low-prominence peaks in streaming mode', () => {
    // Build signal: one tall peak, then one shallow bump, separated enough
    const signal: number[] = new Array(80).fill(0);
    // Tall peak at index 10
    signal[8] = 3;
    signal[9] = 7;
    signal[10] = 10;
    signal[11] = 7;
    signal[12] = 3;
    // Shallow bump while the tall peak is still in the adaptive window.
    signal[48] = 0.4;
    signal[49] = 0.8;
    signal[50] = 1.0;
    signal[51] = 0.8;
    signal[52] = 0.4;

    const detectorWithProminence = new StreamingPeakDetector({
      minPeakDistance: 5,
      thresholdFactor: 0.1,
      adaptiveWindow: 60,
      minProminence: 0.3,
    });

    const detectorWithout = new StreamingPeakDetector({
      minPeakDistance: 5,
      thresholdFactor: 0.1,
      adaptiveWindow: 60,
    });

    const peaksWithProminence = signal
      .map((val) => detectorWithProminence.addSample(val))
      .filter((p) => p !== null);

    const peaksWithout = signal
      .map((val) => detectorWithout.addSample(val))
      .filter((p) => p !== null);

    // Prominence filter should reduce or maintain peak count
    expect(peaksWithProminence.length).toBeLessThanOrEqual(peaksWithout.length);

    // Any remaining peaks should be the tall one
    for (const p of peaksWithProminence) {
      expect(p!.amplitude).toBeGreaterThanOrEqual(5);
    }
  });

  it('adaptive refractory adjusts based on recent peak intervals', () => {
    // Generate a 1 Hz sine (100 samples/period) — peaks ~100 samples apart
    const signal = generateSine(1, 100, 600, 1, 0);

    const detectorAdaptive = new StreamingPeakDetector({
      minPeakDistance: 20, // absolute floor: 20 samples
      thresholdFactor: 0.3,
      adaptiveWindow: 30,
      adaptiveRefractory: true,
    });

    const peaksAdaptive = signal
      .map((val, idx) => detectorAdaptive.addSample(val, idx))
      .filter((p) => p !== null);

    // Should still detect peaks at approximately 100-sample intervals
    expect(peaksAdaptive.length).toBeGreaterThanOrEqual(3);

    // Verify no two peaks are closer than the absolute floor
    for (let i = 1; i < peaksAdaptive.length; i++) {
      const dist = peaksAdaptive[i]!.index - peaksAdaptive[i - 1]!.index;
      expect(dist).toBeGreaterThanOrEqual(20);
    }
  });

  it('adaptive refractory does not alter behavior when disabled', () => {
    const signal = generateSine(1, 100, 500, 1, 0);
    const opts = {
      minPeakDistance: 50,
      thresholdFactor: 0.3,
      adaptiveWindow: 30,
    };

    const detectorFixed = new StreamingPeakDetector({ ...opts, adaptiveRefractory: false });
    const detectorAdaptive = new StreamingPeakDetector({ ...opts, adaptiveRefractory: true });

    const peaksFixed = signal
      .map((val, idx) => detectorFixed.addSample(val, idx))
      .filter((p) => p !== null);

    const peaksAdaptive = signal
      .map((val, idx) => detectorAdaptive.addSample(val, idx))
      .filter((p) => p !== null);

    // Both should find a similar number of peaks (adaptive learns from the signal)
    expect(Math.abs(peaksFixed.length - peaksAdaptive.length)).toBeLessThanOrEqual(2);
  });
});

describe('peak detection fuzz invariants', () => {
  it('matches direct prominence searches on randomized signals with ties and shoulders', () => {
    const rng = createRng(0x9eae2027);

    for (let trial = 0; trial < 100; trial++) {
      const signal = Array.from({ length: randomInt(rng, 3, 80) }, () => randomInt(rng, -5, 10));
      const minPeakDistance = randomInt(rng, 1, 8);
      const minProminence = randomInt(rng, 1, 10) / 10;
      const requiredProminence = minProminence * (Math.max(...signal) - Math.min(...signal));
      const expected: { index: number; amplitude: number }[] = [];

      for (let i = 1; i < signal.length - 1; i++) {
        const amplitude = signal[i];
        if (amplitude <= signal[i - 1] || amplitude <= signal[i + 1]) continue;

        let leftMin = amplitude;
        for (let j = i - 1; j >= 0 && signal[j] <= amplitude; j--) {
          leftMin = Math.min(leftMin, signal[j]);
        }
        let rightMin = amplitude;
        for (let j = i + 1; j < signal.length && signal[j] <= amplitude; j++) {
          rightMin = Math.min(rightMin, signal[j]);
        }

        if (amplitude - Math.max(leftMin, rightMin) < requiredProminence) continue;
        if (expected.length > 0 && i - expected[expected.length - 1].index < minPeakDistance) {
          continue;
        }
        expected.push({ index: i, amplitude });
      }

      // With a two-sample window and factor 0, every strict local maximum clears threshold.
      expect(
        detectPeaks(signal, {
          minPeakDistance,
          minProminence,
          adaptiveWindow: 2,
          thresholdFactor: 0,
        })
      ).toEqual(expected);
    }
  });

  it('detects randomized impulse trains without violating refractory distance', () => {
    const rng = createRng(0x9eae2026);

    for (let trial = 0; trial < 40; trial++) {
      const length = randomInt(rng, 180, 520);
      const minPeakDistance = randomInt(rng, 10, 36);
      const signal = Array.from({ length }, () => rng() * 0.1 - 0.05);

      for (
        let index = randomInt(rng, 5, minPeakDistance);
        index < length - 5;
        index += minPeakDistance + randomInt(rng, 4, minPeakDistance)
      ) {
        signal[index - 1] += 0.75 + rng() * 0.4;
        signal[index] += 2 + rng() * 2;
        signal[index + 1] += 0.75 + rng() * 0.4;
      }

      const opts = {
        minPeakDistance,
        thresholdFactor: 0,
        adaptiveWindow: Math.max(8, minPeakDistance),
        minProminence: 0,
      };
      const peaks = detectPeaks(signal, opts);

      expect(peaks.length).toBeGreaterThan(0);
      for (let i = 0; i < peaks.length; i++) {
        expect(Number.isInteger(peaks[i].index)).toBe(true);
        expect(peaks[i].index).toBeGreaterThanOrEqual(0);
        expect(peaks[i].index).toBeLessThan(signal.length);
        expect(Number.isFinite(peaks[i].amplitude)).toBe(true);
        if (i > 0) {
          expect(peaks[i].index - peaks[i - 1].index).toBeGreaterThanOrEqual(minPeakDistance);
        }
      }

      const detector = new StreamingPeakDetector(opts);
      const streamingPeaks = signal
        .map((value, index) => detector.addSample(value, index))
        .filter((peak) => peak !== null);

      expect(streamingPeaks.length).toBeGreaterThan(0);
      for (let i = 1; i < streamingPeaks.length; i++) {
        expect(streamingPeaks[i]!.index - streamingPeaks[i - 1]!.index).toBeGreaterThanOrEqual(
          minPeakDistance
        );
      }
    }
  });
});
