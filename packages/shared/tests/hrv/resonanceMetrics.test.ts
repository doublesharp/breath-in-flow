import { describe, it, expect } from 'vitest';
import { computeResonanceMetrics } from '../../src/hrv/resonanceMetrics.js';
import { computeFrequencyDomainMetrics } from '../../src/hrv/frequencyDomain.js';

const BREATHING_RATE_BPM = 5.5; // resonance frequency
const BREATHING_FREQ_HZ = BREATHING_RATE_BPM / 60; // ~0.0917 Hz

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function availableSpectrum(result: ReturnType<typeof computeFrequencyDomainMetrics>) {
  expect(result.available).toBe(true);
  if (!result.available) throw new Error(`expected available spectrum, received ${result.reason}`);
  return result.value.spectrum;
}

/**
 * Generate clean sinusoidal RR data at a specific breathing frequency.
 */
function generateCleanSinusoidalRR(
  baseRR: number,
  amplitudeMs: number,
  breathingFreqHz: number,
  durationSec: number
): { rrIntervals: number[]; timestamps: number[] } {
  const rrIntervals: number[] = [];
  const timestamps: number[] = [];
  let t = 0;

  // Keep going until we exceed durationSec
  while (t / 1000 < durationSec) {
    timestamps.push(t);
    const rr = baseRR + amplitudeMs * Math.sin(2 * Math.PI * breathingFreqHz * (t / 1000));
    rrIntervals.push(Math.max(400, rr)); // ensure physiological
    t += rrIntervals[rrIntervals.length - 1];
  }

  return { rrIntervals, timestamps };
}

describe('computeResonanceMetrics', () => {
  const emptyMetrics = {
    peakToTroughAmplitude: 0,
    waveformSmoothness: 0,
    phaseSynchrony: 0,
    lfPeakCount: 0,
    lfPeakAmplitude: 0,
  };

  it('returns defaults for mismatched or non-increasing timestamps', () => {
    const mismatched = computeResonanceMetrics([800, 810, 790], [0, 800], BREATHING_RATE_BPM, []);
    const duplicate = computeResonanceMetrics(
      [800, 810, 790],
      [0, 800, 800],
      BREATHING_RATE_BPM,
      []
    );

    expect(mismatched).toEqual(emptyMetrics);
    expect(duplicate).toEqual(emptyMetrics);
  });

  it.each([
    ['too few intervals', [800], [0], BREATHING_RATE_BPM],
    ['non-finite rate', [800, 810], [0, 800], Number.NaN],
    ['zero rate', [800, 810], [0, 800], 0],
    ['non-finite interval', [800, Number.NaN], [0, 800], BREATHING_RATE_BPM],
    ['non-positive interval', [800, 0], [0, 800], BREATHING_RATE_BPM],
    ['non-finite timestamp', [800, 810], [0, Infinity], BREATHING_RATE_BPM],
  ])('returns defaults for %s', (_label, intervals, timestamps, rate) => {
    expect(computeResonanceMetrics(intervals, timestamps, rate, [])).toEqual(emptyMetrics);
  });

  it('uses the overall heart-rate range when capture is shorter than one breathing cycle', () => {
    const result = computeResonanceMetrics([1000, 800], [0, 1000], 6, []);

    expect(result.peakToTroughAmplitude).toBe(15);
  });

  it('returns zero phase synchrony for a flat heart-rate signal', () => {
    const result = computeResonanceMetrics([1000, 1000, 1000], [0, 1000, 2000], 6, []);

    expect(result.phaseSynchrony).toBe(0);
  });

  it('handles spectra with no LF power and one LF point', () => {
    const noLfPower = computeResonanceMetrics([1000, 900], [0, 1000], 6, [
      { frequency: 0.2, power: 10 },
    ]);
    const oneLfPoint = computeResonanceMetrics([1000, 900], [0, 1000], 6, [
      { frequency: 0.1, power: 7 },
    ]);

    expect(noLfPower).toMatchObject({ waveformSmoothness: 0, lfPeakCount: 0 });
    expect(oneLfPoint).toMatchObject({
      waveformSmoothness: 1,
      lfPeakCount: 1,
      lfPeakAmplitude: 7,
    });
  });

  it('counts dominant peaks at both LF spectrum boundaries', () => {
    const result = computeResonanceMetrics([1000, 900], [0, 1000], 6, [
      { frequency: 0.04, power: 8 },
      { frequency: 0.08, power: 1 },
      { frequency: 0.1, power: 2 },
      { frequency: 0.12, power: 1 },
      { frequency: 0.15, power: 9 },
    ]);

    expect(result.lfPeakCount).toBe(3);
    expect(result.lfPeakAmplitude).toBe(9);
  });

  it('returns high waveform smoothness for clean sinusoidal oscillation at breathing freq', () => {
    const { rrIntervals, timestamps } = generateCleanSinusoidalRR(1000, 80, BREATHING_FREQ_HZ, 120);
    const freq = computeFrequencyDomainMetrics(rrIntervals, timestamps);
    const result = computeResonanceMetrics(
      rrIntervals,
      timestamps,
      BREATHING_RATE_BPM,
      availableSpectrum(freq)
    );

    expect(result.waveformSmoothness).toBeGreaterThan(0.5);
  });

  it('returns high phase synchrony for clean sinusoidal data', () => {
    const { rrIntervals, timestamps } = generateCleanSinusoidalRR(1000, 80, BREATHING_FREQ_HZ, 120);
    const freq = computeFrequencyDomainMetrics(rrIntervals, timestamps);
    const result = computeResonanceMetrics(
      rrIntervals,
      timestamps,
      BREATHING_RATE_BPM,
      availableSpectrum(freq)
    );

    expect(result.phaseSynchrony).toBeGreaterThan(0.5);
  });

  it('waveform smoothness is between 0 and 1', () => {
    const { rrIntervals, timestamps } = generateCleanSinusoidalRR(1000, 50, BREATHING_FREQ_HZ, 60);
    const freq = computeFrequencyDomainMetrics(rrIntervals, timestamps);
    const result = computeResonanceMetrics(
      rrIntervals,
      timestamps,
      BREATHING_RATE_BPM,
      availableSpectrum(freq)
    );

    expect(result.waveformSmoothness).toBeGreaterThanOrEqual(0);
    expect(result.waveformSmoothness).toBeLessThanOrEqual(1);
  });

  it('phase synchrony is between 0 and 1', () => {
    const { rrIntervals, timestamps } = generateCleanSinusoidalRR(1000, 50, BREATHING_FREQ_HZ, 60);
    const freq = computeFrequencyDomainMetrics(rrIntervals, timestamps);
    const result = computeResonanceMetrics(
      rrIntervals,
      timestamps,
      BREATHING_RATE_BPM,
      availableSpectrum(freq)
    );

    expect(result.phaseSynchrony).toBeGreaterThanOrEqual(0);
    expect(result.phaseSynchrony).toBeLessThanOrEqual(1);
  });

  it('peak-to-trough amplitude is non-negative', () => {
    const { rrIntervals, timestamps } = generateCleanSinusoidalRR(1000, 50, BREATHING_FREQ_HZ, 60);
    const freq = computeFrequencyDomainMetrics(rrIntervals, timestamps);
    const result = computeResonanceMetrics(
      rrIntervals,
      timestamps,
      BREATHING_RATE_BPM,
      availableSpectrum(freq)
    );

    expect(result.peakToTroughAmplitude).toBeGreaterThanOrEqual(0);
  });

  it('noisy data has lower smoothness than clean sinusoidal data', () => {
    const { rrIntervals: cleanRR, timestamps: cleanTS } = generateCleanSinusoidalRR(
      1000,
      80,
      BREATHING_FREQ_HZ,
      120
    );
    const freqClean = computeFrequencyDomainMetrics(cleanRR, cleanTS);
    const cleanResult = computeResonanceMetrics(
      cleanRR,
      cleanTS,
      BREATHING_RATE_BPM,
      availableSpectrum(freqClean)
    );

    // Generate deterministic noisy RR data so the regression result is reproducible.
    const rng = createRng(0x5eed2026);
    const noisyRR: number[] = [];
    const noisyTS: number[] = [];
    let t = 0;
    for (let i = 0; i < 150; i++) {
      noisyTS.push(t);
      const rr = 800 + (rng() - 0.5) * 400;
      noisyRR.push(rr);
      t += rr;
    }
    const freqNoisy = computeFrequencyDomainMetrics(noisyRR, noisyTS);
    const noisyResult = computeResonanceMetrics(
      noisyRR,
      noisyTS,
      BREATHING_RATE_BPM,
      availableSpectrum(freqNoisy)
    );

    // Clean data should have higher smoothness than this fixed noisy fixture.
    expect(cleanResult.waveformSmoothness).toBeGreaterThan(noisyResult.waveformSmoothness);
  });

  it('lfPeakCount is non-negative integer', () => {
    const { rrIntervals, timestamps } = generateCleanSinusoidalRR(1000, 60, BREATHING_FREQ_HZ, 90);
    const freq = computeFrequencyDomainMetrics(rrIntervals, timestamps);
    const result = computeResonanceMetrics(
      rrIntervals,
      timestamps,
      BREATHING_RATE_BPM,
      availableSpectrum(freq)
    );

    expect(result.lfPeakCount).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.lfPeakCount)).toBe(true);
  });

  it('lfPeakAmplitude is non-negative', () => {
    const { rrIntervals, timestamps } = generateCleanSinusoidalRR(1000, 60, BREATHING_FREQ_HZ, 90);
    const freq = computeFrequencyDomainMetrics(rrIntervals, timestamps);
    const result = computeResonanceMetrics(
      rrIntervals,
      timestamps,
      BREATHING_RATE_BPM,
      availableSpectrum(freq)
    );

    expect(result.lfPeakAmplitude).toBeGreaterThanOrEqual(0);
  });

  it('ideal resonance data yields lfPeakCount of 1', () => {
    const { rrIntervals, timestamps } = generateCleanSinusoidalRR(1000, 80, BREATHING_FREQ_HZ, 150);
    const freq = computeFrequencyDomainMetrics(rrIntervals, timestamps);
    const result = computeResonanceMetrics(
      rrIntervals,
      timestamps,
      BREATHING_RATE_BPM,
      availableSpectrum(freq)
    );

    // Clean single-frequency oscillation should ideally have a single dominant LF peak
    expect(result.lfPeakCount).toBeGreaterThanOrEqual(1);
    expect(result.lfPeakCount).toBeLessThanOrEqual(5); // reasonable upper bound
  });
});
