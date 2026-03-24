import { describe, it, expect } from 'vitest';
import {
  mean,
  standardDeviation,
  median,
  rms,
  movingAverage,
  movingStandardDeviation,
} from '../../src/dsp/statistics.js';

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
