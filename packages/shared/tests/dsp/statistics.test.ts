import { describe, it, expect } from 'vitest';
import {
  mean,
  standardDeviation,
  median,
  rms,
  movingAverage,
  movingStandardDeviation,
} from '../../src/dsp/statistics.js';

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

describe('mean', () => {
  it('computes the mean of a simple array', () => {
    expect(mean([1, 2, 3, 4, 5])).toBeCloseTo(3);
  });

  it('returns 0 for an empty array', () => {
    expect(mean([])).toBe(0);
  });

  it('returns the single element for a one-element array', () => {
    expect(mean([42])).toBe(42);
  });

  it('handles negative numbers', () => {
    expect(mean([-2, 0, 2])).toBeCloseTo(0);
  });
});

describe('standardDeviation', () => {
  it('computes std dev of a known dataset', () => {
    // [2, 4, 4, 4, 5, 5, 7, 9] → mean = 5, std = 2
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 1);
  });

  it('returns 0 for an empty array', () => {
    expect(standardDeviation([])).toBe(0);
  });

  it('returns 0 for a single element', () => {
    expect(standardDeviation([5])).toBe(0);
  });

  it('returns 0 for a constant array', () => {
    expect(standardDeviation([3, 3, 3, 3])).toBeCloseTo(0);
  });
});

describe('median', () => {
  it('computes median of odd-length array', () => {
    expect(median([3, 1, 4, 1, 5])).toBe(3);
  });

  it('computes median of even-length array', () => {
    expect(median([1, 2, 3, 4])).toBeCloseTo(2.5);
  });

  it('returns 0 for empty array', () => {
    expect(median([])).toBe(0);
  });

  it('returns the single element for a one-element array', () => {
    expect(median([7])).toBe(7);
  });
});

describe('rms', () => {
  it('computes RMS of a known dataset', () => {
    // [1, 1, 1, 1] → rms = 1
    expect(rms([1, 1, 1, 1])).toBeCloseTo(1);
  });

  it('computes RMS of [3, 4] → 3.535...', () => {
    expect(rms([3, 4])).toBeCloseTo(Math.sqrt(12.5));
  });

  it('returns 0 for empty array', () => {
    expect(rms([])).toBe(0);
  });

  it('handles zeros', () => {
    expect(rms([0, 0, 0])).toBe(0);
  });
});

describe('movingAverage', () => {
  it('returns same length as input', () => {
    const data = [1, 2, 3, 4, 5];
    expect(movingAverage(data, 3)).toHaveLength(5);
  });

  it('smooths a step function', () => {
    const data = [0, 0, 0, 10, 10, 10];
    const result = movingAverage(data, 3);
    // Middle values should be intermediate
    expect(result[2]).toBeLessThan(result[4]);
  });

  it('returns empty array for empty input', () => {
    expect(movingAverage([], 3)).toEqual([]);
  });

  it('uses window size correctly for small window', () => {
    const data = [1, 2, 3, 4, 5];
    const result = movingAverage(data, 1);
    // Window of 1 = no smoothing
    expect(result).toEqual(data);
  });
});

describe('movingStandardDeviation', () => {
  it('returns same length as input', () => {
    const data = [1, 2, 3, 4, 5];
    expect(movingStandardDeviation(data, 3)).toHaveLength(5);
  });

  it('returns near-zero for constant signal', () => {
    const data = [5, 5, 5, 5, 5];
    const result = movingStandardDeviation(data, 3);
    result.forEach((val) => expect(val).toBeCloseTo(0));
  });

  it('returns empty array for empty input', () => {
    expect(movingStandardDeviation([], 3)).toEqual([]);
  });
});

describe('statistical fuzz invariants', () => {
  it('keeps aggregate results finite and inside expected bounds', () => {
    const rng = createRng(0x57a72026);

    for (let trial = 0; trial < 100; trial++) {
      const data = Array.from({ length: randomInt(rng, 1, 80) }, () => rng() * 2_000 - 1_000);
      const min = Math.min(...data);
      const max = Math.max(...data);
      const avg = mean(data);
      const med = median(data);
      const std = standardDeviation(data);
      const rootMeanSquare = rms(data);

      expect(Number.isFinite(avg)).toBe(true);
      expect(Number.isFinite(med)).toBe(true);
      expect(Number.isFinite(std)).toBe(true);
      expect(Number.isFinite(rootMeanSquare)).toBe(true);
      expect(avg).toBeGreaterThanOrEqual(min);
      expect(avg).toBeLessThanOrEqual(max);
      expect(med).toBeGreaterThanOrEqual(min);
      expect(med).toBeLessThanOrEqual(max);
      expect(std).toBeGreaterThanOrEqual(0);
      expect(rootMeanSquare).toBeGreaterThanOrEqual(Math.abs(avg) - 1e-9);
    }
  });

  it('preserves translation invariants for location and spread', () => {
    const rng = createRng(0x7a1e2026);

    for (let trial = 0; trial < 80; trial++) {
      const offset = rng() * 200 - 100;
      const data = Array.from({ length: randomInt(rng, 2, 70) }, () => rng() * 500 - 250);
      const shifted = data.map((value) => value + offset);

      expect(mean(shifted)).toBeCloseTo(mean(data) + offset, 10);
      expect(median(shifted)).toBeCloseTo(median(data) + offset, 10);
      expect(standardDeviation(shifted)).toBeCloseTo(standardDeviation(data), 10);
    }
  });

  it('keeps moving-window outputs aligned and finite', () => {
    const rng = createRng(0x6d0a2026);

    for (let trial = 0; trial < 80; trial++) {
      const data = Array.from({ length: randomInt(rng, 1, 90) }, () => rng() * 200 - 100);
      const windowSize = randomInt(rng, 1, 25);
      const averages = movingAverage(data, windowSize);
      const deviations = movingStandardDeviation(data, windowSize);

      expect(averages).toHaveLength(data.length);
      expect(deviations).toHaveLength(data.length);
      averages.forEach((value) => expect(Number.isFinite(value)).toBe(true));
      deviations.forEach((value) => {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      });
    }

    expect(movingAverage([1, 2, 3], 0)).toEqual([]);
    expect(movingStandardDeviation([1, 2, 3], 0)).toEqual([]);
  });
});
