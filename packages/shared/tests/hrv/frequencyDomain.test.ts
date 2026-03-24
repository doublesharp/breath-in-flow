import { describe, it, expect } from 'vitest';
import { lombScargle, computeFrequencyDomainMetrics } from '../../src/hrv/frequencyDomain.js';
import { FREQUENCY_BANDS } from '../../src/hrv/types.js';

/**
 * Generate synthetic RR data with sinusoidal oscillation at a known frequency.
 * RR[i] = baseRR + amplitude * sin(2π * freq * t[i])
 * Timestamps are cumulative sums of RR intervals (ms)
 */
function generateSinusoidalRR(
  baseRR: number,
  amplitude: number,
  freqHz: number,
  numBeats: number
): { rrIntervals: number[]; timestamps: number[] } {
  const rrIntervals: number[] = [];
  const timestamps: number[] = [];
  let t = 0;

  for (let i = 0; i < numBeats; i++) {
    timestamps.push(t);
    const rr = baseRR + amplitude * Math.sin(2 * Math.PI * freqHz * (t / 1000));
    rrIntervals.push(rr);
    t += rr;
  }

  return { rrIntervals, timestamps };
}

describe('lombScargle', () => {
  it('returns array of same length as frequencies input', () => {
    const timestamps = [0, 1, 2, 3, 4];
    const values = [1, -1, 1, -1, 1];
    const frequencies = [0.1, 0.2, 0.3];
    const result = lombScargle(timestamps, values, frequencies);
    expect(result).toHaveLength(3);
  });

  it('detects peak near a known sinusoidal frequency', () => {
    // Pure 0.2 Hz sinusoid sampled at 1 Hz for 30 seconds
    const timestamps: number[] = [];
    const values: number[] = [];
    for (let t = 0; t < 30; t++) {
      timestamps.push(t);
      values.push(Math.sin(2 * Math.PI * 0.2 * t));
    }
    const frequencies = [0.1, 0.15, 0.2, 0.25, 0.3];
    const psd = lombScargle(timestamps, values, frequencies);
    const peakIdx = psd.indexOf(Math.max(...psd));
    expect(peakIdx).toBe(2); // peak at 0.2 Hz
  });

  it('returns zeros for empty data', () => {
    const result = lombScargle([], [], [0.1, 0.2]);
    expect(result).toEqual([0, 0]);
  });

  it('all values non-negative', () => {
    const timestamps = [0, 1, 2, 3, 4, 5];
    const values = [10, -5, 20, -10, 5, -2];
    const frequencies = [0.1, 0.2, 0.3, 0.4];
    const psd = lombScargle(timestamps, values, frequencies);
    for (const p of psd) {
      expect(p).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('computeFrequencyDomainMetrics', () => {
  it('detects dominant LF peak for 0.1 Hz oscillation (6 BPM breathing)', () => {
    // 0.1 Hz oscillation, 150 beats at base RR 1000ms
    const { rrIntervals, timestamps } = generateSinusoidalRR(1000, 50, 0.1, 150);
    const result = computeFrequencyDomainMetrics(rrIntervals, timestamps);

    // LF should be dominant band
    expect(result.lfPower).toBeGreaterThan(result.hfPower);
    expect(result.lfPower).toBeGreaterThan(result.vlfPower);

    // LF peak should be near 0.1 Hz
    expect(result.lfPeak).toBeGreaterThan(FREQUENCY_BANDS.LF.low);
    expect(result.lfPeak).toBeLessThan(FREQUENCY_BANDS.LF.high);
    expect(result.lfPeak).toBeCloseTo(0.1, 1);
  });

  it('returns spectrum with correct structure', () => {
    const { rrIntervals, timestamps } = generateSinusoidalRR(1000, 30, 0.1, 100);
    const result = computeFrequencyDomainMetrics(rrIntervals, timestamps);

    expect(result.spectrum.length).toBeGreaterThan(0);
    // Frequencies should span from 0.003 to ~0.4 Hz
    const freqs = result.spectrum.map((p) => p.frequency);
    expect(Math.min(...freqs)).toBeCloseTo(0.003, 2);
    expect(Math.max(...freqs)).toBeCloseTo(0.4, 1);
  });

  it('computes normalized LF/HF powers that sum to 100', () => {
    const { rrIntervals, timestamps } = generateSinusoidalRR(1000, 50, 0.1, 150);
    const result = computeFrequencyDomainMetrics(rrIntervals, timestamps);

    expect(result.lfPowerNorm + result.hfPowerNorm).toBeCloseTo(100, 1);
  });

  it('lfHfRatio equals lfPower / hfPower', () => {
    const { rrIntervals, timestamps } = generateSinusoidalRR(1000, 50, 0.1, 150);
    const result = computeFrequencyDomainMetrics(rrIntervals, timestamps);

    if (result.hfPower > 0) {
      expect(result.lfHfRatio).toBeCloseTo(result.lfPower / result.hfPower, 3);
    }
  });

  it('band powers sum to total power', () => {
    const { rrIntervals, timestamps } = generateSinusoidalRR(1000, 50, 0.1, 150);
    const result = computeFrequencyDomainMetrics(rrIntervals, timestamps);

    expect(result.totalPower).toBeCloseTo(
      result.vlfPower + result.lfPower + result.hfPower,
      3
    );
  });

  it('returns sensible defaults for very short input', () => {
    const result = computeFrequencyDomainMetrics([800, 810, 790], [0, 800, 1610]);
    expect(result.vlfPower).toBe(0);
    expect(result.lfPower).toBe(0);
    expect(result.hfPower).toBe(0);
  });

  it('detects peak in HF band for 0.25 Hz oscillation', () => {
    const { rrIntervals, timestamps } = generateSinusoidalRR(800, 40, 0.25, 200);
    const result = computeFrequencyDomainMetrics(rrIntervals, timestamps);

    // HF should be dominant
    expect(result.hfPower).toBeGreaterThan(result.vlfPower);
    // HF peak should be in HF band
    expect(result.hfPeak).toBeGreaterThanOrEqual(FREQUENCY_BANDS.HF.low);
    expect(result.hfPeak).toBeLessThanOrEqual(FREQUENCY_BANDS.HF.high);
  });
});
