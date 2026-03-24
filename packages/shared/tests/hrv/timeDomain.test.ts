import { describe, it, expect } from 'vitest';
import { computeTimeDomainMetrics } from '../../src/hrv/timeDomain.js';

describe('computeTimeDomainMetrics', () => {
  it('computes meanRR correctly', () => {
    const rr = [800, 810, 790, 800, 820];
    const result = computeTimeDomainMetrics(rr);
    expect(result.meanRR).toBeCloseTo(804, 1);
  });

  it('computes meanHR as 60000/meanRR', () => {
    const rr = [800, 810, 790, 800, 820];
    const result = computeTimeDomainMetrics(rr);
    expect(result.meanHR).toBeCloseTo(60000 / result.meanRR, 5);
  });

  it('computes sdnn (population std dev)', () => {
    const rr = [800, 810, 790, 800, 820];
    const result = computeTimeDomainMetrics(rr);
    // mean = 804, diffs = [-4, 6, -14, -4, 16], squaredDiffs sum = 16+36+196+16+256 = 520, variance = 104, sd ≈ 10.198
    expect(result.sdnn).toBeCloseTo(10.198, 1);
  });

  it('computes rmssd correctly', () => {
    const rr = [800, 810, 790, 800, 820];
    // successive diffs: 10, -20, 10, 20
    // squared: 100, 400, 100, 400 → mean = 250 → sqrt = 15.811
    const result = computeTimeDomainMetrics(rr);
    expect(result.rmssd).toBeCloseTo(15.811, 1);
  });

  it('computes pnn50 correctly — no differences > 50ms', () => {
    const rr = [800, 810, 790, 800, 820];
    const result = computeTimeDomainMetrics(rr);
    expect(result.pnn50).toBe(0);
  });

  it('computes pnn50 with differences > 50ms', () => {
    // successive diffs: 100, -100, 100 → all > 50ms
    const rr = [800, 900, 800, 900];
    const result = computeTimeDomainMetrics(rr);
    expect(result.pnn50).toBe(100);
  });

  it('computes pnn50 with mixed differences', () => {
    // diffs: 60, -10 → 1 out of 2 > 50ms → 50%
    const rr = [800, 860, 850];
    const result = computeTimeDomainMetrics(rr);
    expect(result.pnn50).toBe(50);
  });

  it('computes minHR and maxHR correctly', () => {
    const rr = [800, 810, 790, 800, 820];
    const result = computeTimeDomainMetrics(rr);
    // maxRR = 820 → minHR = 60000/820 ≈ 73.17
    // minRR = 790 → maxHR = 60000/790 ≈ 75.95
    expect(result.minHR).toBeCloseTo(60000 / 820, 2);
    expect(result.maxHR).toBeCloseTo(60000 / 790, 2);
  });

  it('computes hrRange as maxHR - minHR', () => {
    const rr = [800, 810, 790, 800, 820];
    const result = computeTimeDomainMetrics(rr);
    expect(result.hrRange).toBeCloseTo(result.maxHR - result.minHR, 5);
  });

  it('handles single interval (edge case)', () => {
    const rr = [1000];
    const result = computeTimeDomainMetrics(rr);
    expect(result.meanRR).toBe(1000);
    expect(result.sdnn).toBe(0);
    expect(result.rmssd).toBe(0);
    expect(result.pnn50).toBe(0);
    expect(result.meanHR).toBe(60);
    expect(result.minHR).toBe(60);
    expect(result.maxHR).toBe(60);
    expect(result.hrRange).toBe(0);
  });

  it('handles empty array', () => {
    const result = computeTimeDomainMetrics([]);
    expect(result.meanRR).toBe(0);
    expect(result.sdnn).toBe(0);
    expect(result.rmssd).toBe(0);
    expect(result.pnn50).toBe(0);
  });

  it('computes correct metrics for uniform intervals', () => {
    const rr = [1000, 1000, 1000, 1000, 1000];
    const result = computeTimeDomainMetrics(rr);
    expect(result.meanRR).toBe(1000);
    expect(result.sdnn).toBe(0);
    expect(result.rmssd).toBe(0);
    expect(result.pnn50).toBe(0);
    expect(result.meanHR).toBe(60);
    expect(result.hrRange).toBe(0);
  });
});
