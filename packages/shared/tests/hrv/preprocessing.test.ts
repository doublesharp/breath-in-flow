import { describe, it, expect } from 'vitest';
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
