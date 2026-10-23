import { describe, it, expect } from 'vitest';
import {
  BiquadFilter,
  SOSFilter,
  createLowpassFilter,
  createHighpassFilter,
  createBandpassFilter,
} from '../../src/dsp/filters.js';

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

/**
 * Generate a composite sinusoidal signal.
 * Returns N samples at the given sample rate combining multiple frequency components.
 */
function generateSineSignal(
  frequencies: number[],
  amplitudes: number[],
  sampleRateHz: number,
  numSamples: number
): number[] {
  const signal: number[] = [];
  for (let n = 0; n < numSamples; n++) {
    let sample = 0;
    for (let f = 0; f < frequencies.length; f++) {
      sample += amplitudes[f] * Math.sin((2 * Math.PI * frequencies[f] * n) / sampleRateHz);
    }
    signal.push(sample);
  }
  return signal;
}

/**
 * Compute the RMS power of a signal.
 */
function rms(signal: number[]): number {
  if (signal.length === 0) return 0;
  const sumSq = signal.reduce((acc, val) => acc + val * val, 0);
  return Math.sqrt(sumSq / signal.length);
}

describe('BiquadFilter', () => {
  it('produces output for each sample', () => {
    const filter = new BiquadFilter([1, 0, 0], [1, 0, 0]);
    expect(filter.filter(1)).toBe(1);
    expect(filter.filter(2)).toBe(2);
  });

  it('reset clears internal state', () => {
    const filter = new BiquadFilter([0.5, 0.5, 0], [1, 0, 0]);
    filter.filter(1);
    filter.filter(1);
    filter.reset();
    // After reset, behavior should match fresh filter
    const freshFilter = new BiquadFilter([0.5, 0.5, 0], [1, 0, 0]);
    const resetResult = filter.filter(1);
    const freshResult = freshFilter.filter(1);
    expect(resetResult).toBeCloseTo(freshResult);
  });
});

describe('SOSFilter', () => {
  it('filterBatch matches sequential filter() calls', () => {
    const fs = 1000;
    const filter1 = createLowpassFilter(100, fs);
    const filter2 = createLowpassFilter(100, fs);
    const signal = [1, -1, 0.5, -0.5, 0.25, -0.25, 0, 0.1, -0.1, 0];

    const batchResult = filter1.filterBatch(signal);
    const sequentialResult = signal.map((s) => filter2.filter(s));

    batchResult.forEach((val, i) => {
      expect(val).toBeCloseTo(sequentialResult[i], 10);
    });
  });

  it('reset clears state so repeated filterBatch gives same result', () => {
    const filter = createLowpassFilter(100, 1000);
    const signal = [1, 2, 3, 4, 5, 4, 3, 2, 1];

    const result1 = filter.filterBatch(signal);
    filter.reset();
    const result2 = filter.filterBatch(signal);

    result1.forEach((val, i) => {
      expect(val).toBeCloseTo(result2[i], 10);
    });
  });
});

describe('createLowpassFilter', () => {
  it.each([1, 2, 3, 4, 5, 6])('has the Butterworth magnitude response for order %i', (order) => {
    for (const frequency of [5, 10, 20]) {
      const signal = generateSineSignal([frequency], [1], 100, 2000);
      const output = createLowpassFilter(10, 100, order).filterBatch(signal);
      const warpedRatio = Math.tan((Math.PI * frequency) / 100) / Math.tan((Math.PI * 10) / 100);
      const expectedGain = 1 / Math.sqrt(1 + warpedRatio ** (2 * order));
      expect(rms(output.slice(1000)) / rms(signal.slice(1000))).toBeCloseTo(expectedGain, 8);
    }
  });

  it('attenuates high frequencies while passing low frequencies', () => {
    const fs = 1000; // 1 kHz sample rate
    const cutoff = 10; // 10 Hz cutoff
    const numSamples = 2000;

    // Signal with 1 Hz (pass) and 50 Hz (stop) components of equal amplitude
    const signal = generateSineSignal([1, 50], [1, 1], fs, numSamples);

    const filter = createLowpassFilter(cutoff, fs);
    const filtered = filter.filterBatch(signal);

    // Skip transient (first 500 samples)
    const steadyState = filtered.slice(500);

    // Generate a pure 1 Hz signal to compare against
    const lowFreqOnly = generateSineSignal([1], [1], fs, numSamples).slice(500);
    const lowFreqRms = rms(lowFreqOnly);
    const filteredRms = rms(steadyState);

    // Filtered signal should be close to 1 Hz amplitude (not much attenuation)
    // and much less than input (which had 2x amplitude)
    expect(filteredRms).toBeGreaterThan(0.5 * lowFreqRms);
    // High frequency should be significantly attenuated (filtered RMS < 75% of input RMS)
    expect(filteredRms).toBeLessThan(0.75 * rms(signal.slice(500)));
  });

  it('passes DC component largely unchanged', () => {
    const fs = 1000;
    const filter = createLowpassFilter(50, fs);
    // Process many samples of DC = 1
    const dcSignal = new Array(1000).fill(1);
    const filtered = filter.filterBatch(dcSignal);
    // Steady-state output should be close to 1
    const steadyState = filtered.slice(500);
    const avg = steadyState.reduce((a, b) => a + b, 0) / steadyState.length;
    expect(avg).toBeCloseTo(1, 1);
  });
});

describe('createHighpassFilter', () => {
  it.each([1, 2, 3, 4, 5, 6])('has the Butterworth magnitude response for order %i', (order) => {
    for (const frequency of [5, 10, 20]) {
      const signal = generateSineSignal([frequency], [1], 100, 2000);
      const output = createHighpassFilter(10, 100, order).filterBatch(signal);
      const warpedRatio = Math.tan((Math.PI * 10) / 100) / Math.tan((Math.PI * frequency) / 100);
      const expectedGain = 1 / Math.sqrt(1 + warpedRatio ** (2 * order));
      expect(rms(output.slice(1000)) / rms(signal.slice(1000))).toBeCloseTo(expectedGain, 8);
    }
  });

  it('attenuates low frequencies while passing high frequencies', () => {
    const fs = 1000;
    const cutoff = 10; // 10 Hz cutoff
    const numSamples = 2000;

    // Signal with 1 Hz (stop) and 100 Hz (pass) components of equal amplitude
    const signal = generateSineSignal([1, 100], [1, 1], fs, numSamples);

    const filter = createHighpassFilter(cutoff, fs);
    const filtered = filter.filterBatch(signal);

    const steadyState = filtered.slice(500);
    const filteredRms = rms(steadyState);

    // Generate pure 100 Hz signal
    const highFreqOnly = generateSineSignal([100], [1], fs, numSamples).slice(500);
    const highFreqRms = rms(highFreqOnly);

    // Filtered signal should preserve high frequency component
    expect(filteredRms).toBeGreaterThan(0.5 * highFreqRms);
    // Low frequency should be attenuated
    expect(filteredRms).toBeLessThan(0.75 * rms(signal.slice(500)));
  });

  it('blocks DC component', () => {
    const fs = 1000;
    const filter = createHighpassFilter(5, fs);
    const dcSignal = new Array(1000).fill(1);
    const filtered = filter.filterBatch(dcSignal);
    // Steady-state output should be near zero for DC
    const steadyState = filtered.slice(500);
    const avg = Math.abs(steadyState.reduce((a, b) => a + b, 0) / steadyState.length);
    expect(avg).toBeLessThan(0.1);
  });
});

describe('createBandpassFilter', () => {
  it.each([1, 3, 4])('uses order %i for each cascaded bandpass leg', (order) => {
    const signal = generateSineSignal([10], [1], 100, 2000);
    const output = createBandpassFilter(5, 20, 100, order).filterBatch(signal);
    const lowRatio = Math.tan((Math.PI * 5) / 100) / Math.tan((Math.PI * 10) / 100);
    const highRatio = Math.tan((Math.PI * 10) / 100) / Math.tan((Math.PI * 20) / 100);
    const expectedGain =
      1 / Math.sqrt((1 + lowRatio ** (2 * order)) * (1 + highRatio ** (2 * order)));
    expect(rms(output.slice(1000)) / rms(signal.slice(1000))).toBeCloseTo(expectedGain, 8);
  });

  it.each([0, -1, 2.5, NaN])('rejects invalid filter order %s', (order) => {
    expect(() => createLowpassFilter(10, 100, order)).toThrow(RangeError);
    expect(() => createHighpassFilter(10, 100, order)).toThrow(RangeError);
    expect(() => createBandpassFilter(5, 20, 100, order)).toThrow(RangeError);
  });

  it('passes only the target frequency band', () => {
    const fs = 1000;
    const numSamples = 3000;

    // Three frequency components: 1 Hz (below), 20 Hz (in band), 100 Hz (above)
    const signal = generateSineSignal([1, 20, 100], [1, 1, 1], fs, numSamples);

    const filter = createBandpassFilter(10, 40, fs);
    const filtered = filter.filterBatch(signal);

    const steadyState = filtered.slice(1000);
    const filteredRms = rms(steadyState);

    // Compare to only the 20 Hz component
    const bandOnly = generateSineSignal([20], [1], fs, numSamples).slice(1000);
    const bandRms = rms(bandOnly);

    // Filtered signal should capture most of the 20 Hz component
    expect(filteredRms).toBeGreaterThan(0.3 * bandRms);
    // But should be significantly less than the full 3-component signal
    expect(filteredRms).toBeLessThan(0.8 * rms(signal.slice(1000)));
  });
});

describe('filter fuzz invariants', () => {
  it('keeps randomized valid filter outputs finite and repeatable after reset', () => {
    const rng = createRng(0xf1172026);

    for (let trial = 0; trial < 50; trial++) {
      const sampleRateHz = randomInt(rng, 120, 1_200);
      const lowHz = randomInt(rng, 1, Math.floor(sampleRateHz / 10));
      const highHz = randomInt(rng, lowHz + 1, Math.floor(sampleRateHz / 3));
      const order = [2, 4, 6][randomInt(rng, 0, 2)];
      const signal = Array.from({ length: randomInt(rng, 64, 240) }, () => rng() * 4 - 2);
      const filters = [
        createLowpassFilter(highHz, sampleRateHz, order),
        createHighpassFilter(lowHz, sampleRateHz, order),
        createBandpassFilter(lowHz, highHz, sampleRateHz, order),
      ];

      for (const filter of filters) {
        const firstPass = filter.filterBatch(signal);
        filter.reset();
        const secondPass = filter.filterBatch(signal);

        expect(firstPass).toHaveLength(signal.length);
        expect(secondPass).toHaveLength(signal.length);

        firstPass.forEach((value, index) => {
          expect(Number.isFinite(value)).toBe(true);
          expect(Math.abs(value)).toBeLessThan(1_000_000);
          expect(value).toBeCloseTo(secondPass[index], 10);
        });
      }
    }
  });
});
