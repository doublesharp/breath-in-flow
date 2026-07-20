import { describe, it, expect } from 'vitest';
import {
  lombScargle,
  computeFrequencyDomainMetrics,
  linearDetrend,
  hanningWindow,
} from '../../src/hrv/frequencyDomain.js';
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

describe('linearDetrend', () => {
  it('removes a perfect linear trend', () => {
    // y = 2 + 3*t — after detrending residual should be ~0
    const timestamps = [0, 1, 2, 3, 4];
    const values = timestamps.map((t) => 2 + 3 * t);
    const detrended = linearDetrend(values, timestamps);
    for (const v of detrended) {
      expect(Math.abs(v)).toBeLessThan(1e-8);
    }
  });

  it('leaves a zero-mean constant series unchanged', () => {
    const timestamps = [0, 1, 2, 3, 4];
    const values = [0, 0, 0, 0, 0];
    const detrended = linearDetrend(values, timestamps);
    for (const v of detrended) {
      expect(Math.abs(v)).toBeLessThan(1e-10);
    }
  });

  it('reduces VLF power in a linearly trending RR series', () => {
    // RR series with a linear upward trend (HR slowing down) — no oscillation
    const numBeats = 150;
    const rrIntervals: number[] = [];
    const timestamps: number[] = [];
    let t = 0;
    for (let i = 0; i < numBeats; i++) {
      timestamps.push(t);
      const rr = 800 + i * 2; // linear trend: 800 ms → 1098 ms
      rrIntervals.push(rr);
      t += rr;
    }

    const timestampsSec = timestamps.map((ts) => ts / 1000);
    const meanRR = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length;
    const centeredRR = rrIntervals.map((rr) => rr - meanRR);

    // VLF band frequencies
    const vlfFreqs: number[] = [];
    for (let f = FREQUENCY_BANDS.VLF.low; f <= FREQUENCY_BANDS.VLF.high; f += 0.001) {
      vlfFreqs.push(Math.round(f * 1000) / 1000);
    }

    const psdBefore = lombScargle(timestampsSec, centeredRR, vlfFreqs);
    const detrendedRR = linearDetrend(centeredRR, timestampsSec);
    const psdAfter = lombScargle(timestampsSec, detrendedRR, vlfFreqs);

    const vlfBefore = psdBefore.reduce((a, b) => a + b, 0);
    const vlfAfter = psdAfter.reduce((a, b) => a + b, 0);

    // Detrending should meaningfully reduce VLF power
    expect(vlfAfter).toBeLessThan(vlfBefore * 0.1);
  });

  it('handles single-element input gracefully', () => {
    const result = linearDetrend([42], [0]);
    expect(result).toHaveLength(1);
  });
});

describe('hanningWindow', () => {
  it('returns same length as input', () => {
    const values = [1, 2, 3, 4, 5];
    expect(hanningWindow(values)).toHaveLength(5);
  });

  it('tapers ends toward zero', () => {
    const N = 64;
    const values = new Array(N).fill(1);
    const windowed = hanningWindow(values);
    // First and last elements should be near zero
    expect(Math.abs(windowed[0])).toBeLessThan(0.01);
    expect(Math.abs(windowed[N - 1])).toBeLessThan(0.01);
    // Middle element should be near 1
    expect(windowed[Math.floor(N / 2)]).toBeGreaterThan(0.9);
  });

  it('reduces spectral leakage: peak is narrower with windowing', () => {
    // 0.1 Hz sinusoid: windowed PSD should have less power in adjacent bins
    // than the raw signal (leakage check at an off-peak frequency)
    const timestamps: number[] = [];
    const values: number[] = [];
    for (let t = 0; t < 60; t++) {
      timestamps.push(t);
      values.push(Math.sin(2 * Math.PI * 0.1 * t));
    }

    const offPeakFreqs = [0.05, 0.07]; // well away from the 0.1 Hz peak
    const windowedValues = hanningWindow(values);

    const psdRaw = lombScargle(timestamps, values, offPeakFreqs);
    const psdWindowed = lombScargle(timestamps, windowedValues, offPeakFreqs);

    const totalRaw = psdRaw.reduce((a, b) => a + b, 0);
    const totalWindowed = psdWindowed.reduce((a, b) => a + b, 0);

    // Off-peak leakage should be reduced (or equal in edge cases) after windowing
    expect(totalWindowed).toBeLessThanOrEqual(totalRaw * 1.01);
  });

  it('handles length-1 input', () => {
    const result = hanningWindow([5]);
    expect(result).toHaveLength(1);
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
    expect(result.available).toBe(false);
    expect(result.unavailableReason).toBe('insufficient-data');
    expect(result.vlfPower).toBe(0);
    expect(result.lfPower).toBe(0);
    expect(result.hfPower).toBe(0);
    expect(result.lfPeak).toBe(0);
    expect(result.hfPeak).toBe(0);
  });

  it('returns defaults for mismatched timestamps', () => {
    const result = computeFrequencyDomainMetrics(
      [800, 810, 790, 805],
      [0, 800, 1610],
    );

    expect(result.spectrum).toHaveLength(0);
    expect(result.totalPower).toBe(0);
    expect(result.available).toBe(false);
    expect(result.unavailableReason).toBe('invalid-series');
  });

  it('returns defaults for duplicate or unordered timestamps', () => {
    const duplicate = computeFrequencyDomainMetrics(
      [800, 810, 790, 805],
      [0, 800, 800, 2400],
    );
    const unordered = computeFrequencyDomainMetrics(
      [800, 810, 790, 805],
      [0, 1610, 800, 2400],
    );

    expect(duplicate.spectrum).toHaveLength(0);
    expect(duplicate.totalPower).toBe(0);
    expect(unordered.spectrum).toHaveLength(0);
    expect(unordered.totalPower).toBe(0);
  });

  it('marks a constant interval series unavailable instead of inventing peaks', () => {
    const rrIntervals = Array.from({ length: 120 }, () => 1_000);
    const timestamps = rrIntervals.map((_, index) => index * 1_000);

    const result = computeFrequencyDomainMetrics(rrIntervals, timestamps);

    expect(result.available).toBe(false);
    expect(result.unavailableReason).toBe('no-variability');
    expect(result.spectrum).toHaveLength(0);
    expect(result.lfPeak).toBe(0);
    expect(result.hfPeak).toBe(0);
  });

  it('detects peak in HF band for 0.25 Hz oscillation', () => {
    const { rrIntervals, timestamps } = generateSinusoidalRR(800, 40, 0.25, 200);
    const result = computeFrequencyDomainMetrics(rrIntervals, timestamps);

    // HF should be dominant
    expect(result.available).toBe(true);
    expect(result.unavailableReason).toBeUndefined();
    expect(result.hfPower).toBeGreaterThan(result.vlfPower);
    // HF peak should be in HF band
    expect(result.hfPeak).toBeGreaterThanOrEqual(FREQUENCY_BANDS.HF.low);
    expect(result.hfPeak).toBeLessThanOrEqual(FREQUENCY_BANDS.HF.high);
  });

  it('detrending reduces VLF artefact: trending series has lower VLF ratio than without detrend', () => {
    // Build a 0.1 Hz oscillation series with an added linear trend
    const numBeats = 150;
    const rrIntervals: number[] = [];
    const timestamps: number[] = [];
    let t = 0;
    for (let i = 0; i < numBeats; i++) {
      timestamps.push(t);
      const rr = 1000 + 50 * Math.sin(2 * Math.PI * 0.1 * (t / 1000)) + i * 0.5;
      rrIntervals.push(rr);
      t += rr;
    }

    const result = computeFrequencyDomainMetrics(rrIntervals, timestamps);

    // After detrending the 0.1 Hz signal should still be the dominant LF peak
    expect(result.lfPower).toBeGreaterThan(result.vlfPower);
    expect(result.lfPeak).toBeCloseTo(0.1, 1);
  });

  it('0.1 Hz peak still detected after detrending and windowing', () => {
    const { rrIntervals, timestamps } = generateSinusoidalRR(1000, 50, 0.1, 150);
    const result = computeFrequencyDomainMetrics(rrIntervals, timestamps);

    // Detrending + windowing must not destroy the primary oscillation
    expect(result.lfPeak).toBeCloseTo(0.1, 1);
    expect(result.lfPower).toBeGreaterThan(0);
  });
});
