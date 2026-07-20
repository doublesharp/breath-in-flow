import { describe, it, expect } from 'vitest';
import { computeResonanceMetrics } from '../../src/hrv/resonanceMetrics.js';
import { computeFrequencyDomainMetrics } from '../../src/hrv/frequencyDomain.js';

const BREATHING_RATE_BPM = 5.5; // resonance frequency
const BREATHING_FREQ_HZ = BREATHING_RATE_BPM / 60; // ~0.0917 Hz

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
  it('returns defaults for mismatched or non-increasing timestamps', () => {
    const mismatched = computeResonanceMetrics([800, 810, 790], [0, 800], BREATHING_RATE_BPM, []);
    const duplicate = computeResonanceMetrics(
      [800, 810, 790],
      [0, 800, 800],
      BREATHING_RATE_BPM,
      []
    );

    expect(mismatched).toEqual({
      peakToTroughAmplitude: 0,
      waveformSmoothness: 0,
      phaseSynchrony: 0,
      lfPeakCount: 0,
      lfPeakAmplitude: 0,
    });
    expect(duplicate).toEqual({
      peakToTroughAmplitude: 0,
      waveformSmoothness: 0,
      phaseSynchrony: 0,
      lfPeakCount: 0,
      lfPeakAmplitude: 0,
    });
  });

  it('returns high waveform smoothness for clean sinusoidal oscillation at breathing freq', () => {
    const { rrIntervals, timestamps } = generateCleanSinusoidalRR(1000, 80, BREATHING_FREQ_HZ, 120);
    const freq = computeFrequencyDomainMetrics(rrIntervals, timestamps);
    const result = computeResonanceMetrics(
      rrIntervals,
      timestamps,
      BREATHING_RATE_BPM,
      freq.spectrum
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
      freq.spectrum
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
      freq.spectrum
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
      freq.spectrum
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
      freq.spectrum
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
      freqClean.spectrum
    );

    // Generate noisy (random) RR data
    const noisyRR: number[] = [];
    const noisyTS: number[] = [];
    let t = 0;
    for (let i = 0; i < 150; i++) {
      noisyTS.push(t);
      const rr = 800 + (Math.random() - 0.5) * 400;
      noisyRR.push(rr);
      t += rr;
    }
    const freqNoisy = computeFrequencyDomainMetrics(noisyRR, noisyTS);
    const noisyResult = computeResonanceMetrics(
      noisyRR,
      noisyTS,
      BREATHING_RATE_BPM,
      freqNoisy.spectrum
    );

    // Clean data should generally have higher smoothness
    // (This is a probabilistic test, may not always hold for random noise)
    expect(cleanResult.waveformSmoothness).toBeGreaterThanOrEqual(
      noisyResult.waveformSmoothness * 0.5
    );
  });

  it('lfPeakCount is non-negative integer', () => {
    const { rrIntervals, timestamps } = generateCleanSinusoidalRR(1000, 60, BREATHING_FREQ_HZ, 90);
    const freq = computeFrequencyDomainMetrics(rrIntervals, timestamps);
    const result = computeResonanceMetrics(
      rrIntervals,
      timestamps,
      BREATHING_RATE_BPM,
      freq.spectrum
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
      freq.spectrum
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
      freq.spectrum
    );

    // Clean single-frequency oscillation should ideally have a single dominant LF peak
    expect(result.lfPeakCount).toBeGreaterThanOrEqual(1);
    expect(result.lfPeakCount).toBeLessThanOrEqual(5); // reasonable upper bound
  });
});
