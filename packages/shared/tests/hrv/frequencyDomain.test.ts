import { describe, it, expect, vi } from 'vitest';
import {
  lombScargle,
  computeFrequencyDomainMetrics,
  linearDetrend,
  hanningWindow,
  integrateFrequencyBand,
} from '../../src/hrv/frequencyDomain.js';
import { analyzeRawHRV, analyzeHRV, finalizeMeasurement } from '../../src/hrv/index.js';
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

function availableFrequency(rrIntervals: number[], timestamps: number[]) {
  const result = computeFrequencyDomainMetrics(rrIntervals, timestamps);
  expect(result.available).toBe(true);
  if (!result.available) throw new Error(`expected available metrics, received ${result.reason}`);
  return result.value;
}

describe('lombScargle', () => {
  it('retains the nondegenerate cosine basis at the sampling Nyquist frequency', () => {
    // The normalized projection is sum(values²)/N = 1 even though sine is zero.
    expect(lombScargle([0, 2, 4, 6], [1, -1, 1, -1], [0.25])[0]).toBeCloseTo(1, 12);
  });

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

  it('reduces normalized sidelobes while retaining the sinusoid and window energy', () => {
    // Non-bin-centered tone. Hann broadens the main lobe but lowers sidelobes.
    const timestamps = Array.from({ length: 128 }, (_, i) => i);
    const values = timestamps.map((t) => Math.sin(2 * Math.PI * 0.103 * t));
    const frequencies = [0.103, 0.05, 0.06, 0.15, 0.17];
    const windowedValues = hanningWindow(values);
    const raw = lombScargle(timestamps, values, frequencies);
    const windowed = lombScargle(timestamps, windowedValues, frequencies);
    const rawSideRatio = raw.slice(1).reduce((sum, power) => sum + power, 0) / raw[0];
    const windowedSideRatio =
      windowed.slice(1).reduce((sum, power) => sum + power, 0) / windowed[0];
    // Coherent amplitude gain is about 1/2, hence power near 1/4.
    expect(windowed[0] / raw[0]).toBeGreaterThan(0.23);
    expect(windowedSideRatio).toBeLessThan(rawSideRatio * 0.01);
    expect(windowed[0] / raw[0]).toBeLessThan(0.27);
    const energy = (samples: number[]) => samples.reduce((sum, value) => sum + value * value, 0);
    expect(energy(windowedValues) / energy(values)).toBeGreaterThan(0.35);
    expect(energy(windowedValues) / energy(values)).toBeLessThan(0.4);
  });

  it('handles length-1 input', () => {
    const result = hanningWindow([5]);
    expect(result).toHaveLength(1);
  });
});

describe('computeFrequencyDomainMetrics', () => {
  it('excludes the 0.15 Hz HF boundary from the reported LF peak', () => {
    const timestamps = Array.from({ length: 401 }, (_, i) => i * 1000);
    const intervals = timestamps.map((t) => 1000 + 50 * Math.sin((2 * Math.PI * 0.15 * t) / 1000));
    const result = availableFrequency(intervals, timestamps);
    expect(result.hfPeak).toBe(0.15);
    expect(result.lfPeak).toBeLessThan(0.15);
    expect(result.lfPeak).toBeGreaterThanOrEqual(0.04);
  });

  it('assigns the shared 0.15 Hz boundary to HF only', () => {
    const frequencies = [0.149, 0.15, 0.151];
    const power = [1, 10, 1];

    const lf = integrateFrequencyBand(frequencies, power, 0.04, 0.15, 0.001, false);
    const hf = integrateFrequencyBand(frequencies, power, 0.15, 0.4, 0.001, true);

    expect(lf).toBeCloseTo(0.001);
    expect(hf).toBeCloseTo(0.011);
  });

  it('returns only an unavailable reason when a spectrum cannot be computed', () => {
    const result = computeFrequencyDomainMetrics([800, 810, 790], [0, 800, 1610]);

    expect(result).toEqual({ available: false, reason: 'insufficient-data' });
    expect(result).not.toHaveProperty('lfPower');
    expect(result).not.toHaveProperty('hfPower');
    expect(result).not.toHaveProperty('totalPower');
  });

  it('wraps eligible spectral summaries in an available value without absolute power fields', () => {
    const { rrIntervals, timestamps } = generateSinusoidalRR(1000, 50, 0.1, 300);
    const result = computeFrequencyDomainMetrics(rrIntervals, timestamps);

    expect(result.available).toBe(true);
    expect(result).toHaveProperty('value');
    expect(result).not.toHaveProperty('lfPower');
    expect(result).not.toHaveProperty('hfPower');
    expect(result).not.toHaveProperty('totalPower');

    if (!result.available) throw new Error('expected available frequency metrics');
    expect(result.value.lfPowerNorm + result.value.hfPowerNorm).toBeCloseTo(100, 1);
    expect(result.value.spectrum.reduce((sum, point) => sum + point.power, 0)).toBeCloseTo(100, 5);
  });

  it('makes resonance unavailable when no breathing-rate context was supplied', () => {
    const { rrIntervals, timestamps } = generateSinusoidalRR(1000, 50, 0.1, 150);
    const analysis = analyzeRawHRV(
      rrIntervals.map((interval, index) => ({
        interval,
        timestamp: timestamps[index],
        quality: 0.9,
        provenance: { source: 'ppg', method: 'peak-detected' },
      }))
    );

    expect(analysis.resonance).toEqual({
      available: false,
      reason: 'missing-breathing-rate',
    });
    expect(analysis.frequencyDomain).toEqual({
      available: false,
      reason: 'duration-too-short',
    });
  });

  it('keeps resonance unavailable when a constant trial cannot produce a spectrum', () => {
    const analysis = analyzeRawHRV(
      Array.from({ length: 121 }, (_, index) => ({
        interval: 1_000,
        timestamp: index * 1_000,
        quality: 0.9,
        provenance: { source: 'ppg' as const, method: 'peak-detected' as const },
      })),
      6
    );

    expect(analysis.frequencyDomain).toEqual({
      available: false,
      reason: 'protocol-not-supported',
    });
    expect(analysis.resonance).toEqual({
      available: false,
      reason: 'no-variability',
    });
    expect(analysis.resonance).not.toHaveProperty('value');
  });

  it('keeps resonance unavailable when a detected trial has fewer than two intervals', () => {
    const analysis = analyzeRawHRV(
      [
        {
          interval: 1_000,
          timestamp: 0,
          quality: 0.9,
          provenance: { source: 'ppg', method: 'peak-detected' },
        },
      ],
      6
    );

    expect(analysis.resonance).toEqual({ available: false, reason: 'insufficient-data' });
  });

  it('makes resonance available when a detected trial produces a valid spectrum', () => {
    const { rrIntervals, timestamps } = generateSinusoidalRR(1_000, 50, 0.1, 121);
    const analysis = analyzeRawHRV(
      rrIntervals.map((interval, index) => ({
        interval,
        timestamp: timestamps[index],
        quality: 0.9,
        provenance: { source: 'ppg' as const, method: 'peak-detected' as const },
      })),
      6
    );

    expect(analysis.resonance.available).toBe(true);
    if (!analysis.resonance.available) throw new Error('expected available resonance metrics');
    expect(analysis.resonance.value.waveformSmoothness).toBeGreaterThan(0);
    expect(analysis.resonance.value.lfPeakCount).toBeGreaterThan(0);
  });

  it('detects dominant LF peak for 0.1 Hz oscillation (6 BPM breathing)', () => {
    // 0.1 Hz oscillation, 150 beats at base RR 1000ms
    const { rrIntervals, timestamps } = generateSinusoidalRR(1000, 50, 0.1, 150);
    const result = availableFrequency(rrIntervals, timestamps);

    // LF should be dominant band
    expect(result.lfPowerNorm).toBeGreaterThan(result.hfPowerNorm);

    // LF peak should be near 0.1 Hz
    expect(result.lfPeak).toBeGreaterThan(FREQUENCY_BANDS.LF.low);
    expect(result.lfPeak).toBeLessThan(FREQUENCY_BANDS.LF.high);
    expect(result.lfPeak).toBeCloseTo(0.1, 1);
  });

  it('returns spectrum with correct structure', () => {
    const { rrIntervals, timestamps } = generateSinusoidalRR(1000, 30, 0.1, 100);
    const result = availableFrequency(rrIntervals, timestamps);

    expect(result.spectrum.length).toBeGreaterThan(0);
    // Frequencies should span from 0.003 to ~0.4 Hz
    const freqs = result.spectrum.map((p) => p.frequency);
    expect(Math.min(...freqs)).toBeCloseTo(0.003, 2);
    expect(Math.max(...freqs)).toBeCloseTo(0.4, 1);
  });

  it('computes normalized LF/HF powers that sum to 100', () => {
    const { rrIntervals, timestamps } = generateSinusoidalRR(1000, 50, 0.1, 150);
    const result = availableFrequency(rrIntervals, timestamps);

    expect(result.lfPowerNorm + result.hfPowerNorm).toBeCloseTo(100, 1);
  });

  it('lfHfRatio matches the normalized LF/HF relationship', () => {
    const { rrIntervals, timestamps } = generateSinusoidalRR(1000, 50, 0.1, 150);
    const result = availableFrequency(rrIntervals, timestamps);

    if (result.hfPowerNorm > 0) {
      expect(result.lfHfRatio).toBeCloseTo(result.lfPowerNorm / result.hfPowerNorm, 3);
    }
  });

  it('keeps normalized band percentages within their user-facing range', () => {
    const { rrIntervals, timestamps } = generateSinusoidalRR(1000, 50, 0.1, 150);
    const result = availableFrequency(rrIntervals, timestamps);

    expect(result.lfPowerNorm).toBeGreaterThanOrEqual(0);
    expect(result.lfPowerNorm).toBeLessThanOrEqual(100);
    expect(result.hfPowerNorm).toBeGreaterThanOrEqual(0);
    expect(result.hfPowerNorm).toBeLessThanOrEqual(100);
  });

  it('returns an unavailable reason for very short input', () => {
    const result = computeFrequencyDomainMetrics([800, 810, 790], [0, 800, 1610]);
    expect(result).toEqual({ available: false, reason: 'insufficient-data' });
  });

  it('returns an unavailable reason for mismatched timestamps', () => {
    const result = computeFrequencyDomainMetrics([800, 810, 790, 805], [0, 800, 1610]);

    expect(result).toEqual({ available: false, reason: 'invalid-series' });
  });

  it('returns unavailable reasons for duplicate or unordered timestamps', () => {
    const duplicate = computeFrequencyDomainMetrics([800, 810, 790, 805], [0, 800, 800, 2400]);
    const unordered = computeFrequencyDomainMetrics([800, 810, 790, 805], [0, 1610, 800, 2400]);

    expect(duplicate).toEqual({ available: false, reason: 'invalid-series' });
    expect(unordered).toEqual({ available: false, reason: 'invalid-series' });
  });

  it('marks a constant interval series unavailable instead of inventing peaks', () => {
    const rrIntervals = Array.from({ length: 120 }, () => 1_000);
    const timestamps = rrIntervals.map((_, index) => index * 1_000);

    const result = computeFrequencyDomainMetrics(rrIntervals, timestamps);

    expect(result).toEqual({ available: false, reason: 'no-variability' });
  });

  it('detects peak in HF band for 0.25 Hz oscillation', () => {
    const { rrIntervals, timestamps } = generateSinusoidalRR(800, 40, 0.25, 200);
    const result = availableFrequency(rrIntervals, timestamps);

    // HF should be dominant
    expect(result.hfPowerNorm).toBeGreaterThan(result.lfPowerNorm);
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

    const result = availableFrequency(rrIntervals, timestamps);

    // After detrending the 0.1 Hz signal should still be the dominant LF peak
    expect(result.lfPowerNorm).toBeGreaterThan(result.hfPowerNorm);
    expect(result.lfPeak).toBeCloseTo(0.1, 1);
  });

  it('0.1 Hz peak still detected after detrending and windowing', () => {
    const { rrIntervals, timestamps } = generateSinusoidalRR(1000, 50, 0.1, 150);
    const result = availableFrequency(rrIntervals, timestamps);

    // Detrending + windowing must not destroy the primary oscillation
    expect(result.lfPeak).toBeCloseTo(0.1, 1);
    expect(result.lfPowerNorm).toBeGreaterThan(0);
  });
});

describe('analysis spectrum work', () => {
  const samples = (seconds: number) =>
    Array.from({ length: seconds + 1 }, (_, i) => ({
      timestamp: i * 1000,
      interval: 1000 + 20 * Math.sin((2 * Math.PI * i) / 10),
      quality: 0.9,
      provenance: { source: 'ppg' as const, method: 'peak-detected' as const },
    }));

  it('skips trigonometry for a 61-sample quick check with no usable spectral metrics', () => {
    const input = samples(60);
    const measurement = finalizeMeasurement(input, 'quick-check');
    expect(measurement.eligibility.eligible).toBe(true);
    const sin = vi.spyOn(Math, 'sin');
    const cos = vi.spyOn(Math, 'cos');
    try {
      const raw = analyzeRawHRV(input);
      const finalized = analyzeHRV(measurement);
      expect(raw.frequencyDomain).toEqual({ available: false, reason: 'duration-too-short' });
      expect(finalized.frequencyDomain.available).toBe(false);
      expect(finalized.timeDomain).toEqual(raw.timeDomain);
      expect(sin.mock.calls.length + cos.mock.calls.length).toBe(0);
    } finally {
      sin.mockRestore();
      cos.mockRestore();
    }
  });

  it.each([undefined, 6])(
    'skips rejected protocol spectrum work with breathing rate %s',
    (rate) => {
      const measurement = finalizeMeasurement(samples(300), 'full-analysis');
      measurement.eligibility = {
        ...measurement.eligibility,
        eligible: false,
        reasons: ['sensor-error'],
        availableMetrics: [],
      };
      const sin = vi.spyOn(Math, 'sin');
      const cos = vi.spyOn(Math, 'cos');
      try {
        const result = analyzeHRV(measurement, rate);
        expect(result.frequencyDomain).toEqual({ available: false, reason: 'sensor-error' });
        expect(result.resonance).toEqual({ available: false, reason: 'sensor-error' });
        expect(sin.mock.calls.length + cos.mock.calls.length).toBe(0);
      } finally {
        sin.mockRestore();
        cos.mockRestore();
      }
    }
  );

  it('retains spectrum work needed by a short eligible resonance trial', () => {
    const result = analyzeHRV(finalizeMeasurement(samples(120), 'resonance-trial'), 6);
    expect(result.frequencyDomain.available).toBe(false);
    expect(result.resonance.available).toBe(true);
    if (!result.resonance.available) throw new Error('Expected resonance metrics');
    expect(result.resonance.value.waveformSmoothness).toBeGreaterThan(0.9);
    expect(result.resonance.value.phaseSynchrony).toBeGreaterThan(0.99);
  });
});
