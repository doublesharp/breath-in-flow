import { mean } from '../dsp/statistics.js';
import { FREQUENCY_BANDS } from './types.js';
import type { FrequencyDomainMetrics, SpectralPoint } from './types.js';

/**
 * Lomb-Scargle periodogram for unevenly-sampled data.
 *
 * @param timestamps - sample times in seconds
 * @param values     - mean-subtracted RR intervals in ms
 * @param frequencies - frequencies (Hz) at which to evaluate power
 * @returns power spectral density at each frequency (ms²/Hz)
 */
export function lombScargle(
  timestamps: number[],
  values: number[],
  frequencies: number[]
): number[] {
  const N = timestamps.length;
  if (N < 2 || frequencies.length === 0) return frequencies.map(() => 0);

  const result: number[] = [];

  for (const f of frequencies) {
    const omega = 2 * Math.PI * f;

    // Compute time offset τ
    let sinSum = 0;
    let cosSum = 0;
    for (let i = 0; i < N; i++) {
      const angle = 2 * omega * timestamps[i];
      sinSum += Math.sin(angle);
      cosSum += Math.cos(angle);
    }
    const tau = Math.atan2(sinSum, cosSum) / (2 * omega);

    // Compute numerator and denominator terms
    let cosNumer = 0;
    let sinNumer = 0;
    let cosDenom = 0;
    let sinDenom = 0;

    for (let i = 0; i < N; i++) {
      const phase = omega * (timestamps[i] - tau);
      const c = Math.cos(phase);
      const s = Math.sin(phase);
      cosNumer += values[i] * c;
      sinNumer += values[i] * s;
      cosDenom += c * c;
      sinDenom += s * s;
    }

    // Normalized Lomb-Scargle power (units: ms²)
    let power = 0;
    if (cosDenom > 1e-12 && sinDenom > 1e-12) {
      power = 0.5 * (
        (cosNumer * cosNumer) / cosDenom +
        (sinNumer * sinNumer) / sinDenom
      );
    }

    // Normalize to PSD: divide by N/2 to get ms²/Hz
    result.push(power / (N / 2));
  }

  return result;
}

/**
 * Generates a uniform frequency grid from start to end (inclusive) with given step.
 */
function generateFrequencyGrid(start: number, end: number, step: number): number[] {
  const freqs: number[] = [];
  for (let f = start; f <= end + step * 0.5; f += step) {
    freqs.push(Math.round(f * 1000) / 1000); // round to avoid float drift
  }
  return freqs;
}

/**
 * Integrate power within a frequency band.
 * bandPower = sum of psd values in band * frequency_resolution
 */
function integrateBand(
  frequencies: number[],
  psd: number[],
  low: number,
  high: number,
  freqResolution: number
): number {
  let power = 0;
  for (let i = 0; i < frequencies.length; i++) {
    if (frequencies[i] >= low && frequencies[i] <= high) {
      power += psd[i] * freqResolution;
    }
  }
  return power;
}

/**
 * Find the frequency with maximum PSD within a band.
 */
function findPeakFrequency(
  frequencies: number[],
  psd: number[],
  low: number,
  high: number
): number {
  let maxPower = -Infinity;
  let peakFreq = (low + high) / 2;
  for (let i = 0; i < frequencies.length; i++) {
    if (frequencies[i] >= low && frequencies[i] <= high) {
      if (psd[i] > maxPower) {
        maxPower = psd[i];
        peakFreq = frequencies[i];
      }
    }
  }
  return peakFreq;
}

/**
 * Computes frequency-domain HRV metrics using the Lomb-Scargle periodogram.
 *
 * @param rrIntervals - RR intervals in ms
 * @param timestamps  - timestamps in ms (same length as rrIntervals)
 */
export function computeFrequencyDomainMetrics(
  rrIntervals: number[],
  timestamps: number[]
): FrequencyDomainMetrics {
  const emptySpectrum: SpectralPoint[] = [];
  const emptyResult: FrequencyDomainMetrics = {
    vlfPower: 0,
    lfPower: 0,
    hfPower: 0,
    totalPower: 0,
    lfPowerNorm: 0,
    hfPowerNorm: 0,
    lfHfRatio: 0,
    lfPeak: 0.1,
    hfPeak: 0.25,
    spectrum: emptySpectrum,
  };

  if (rrIntervals.length < 4) return emptyResult;

  // Convert timestamps to seconds
  const timestampsSec = timestamps.map((t) => t / 1000);

  // Mean-subtract RR intervals
  const meanRR = mean(rrIntervals);
  const centeredRR = rrIntervals.map((rr) => rr - meanRR);

  // Generate frequency grid: 0.003 to 0.4 Hz with 0.001 Hz step
  const FREQ_START = 0.003;
  const FREQ_END = 0.4;
  const FREQ_STEP = 0.001;
  const frequencies = generateFrequencyGrid(FREQ_START, FREQ_END, FREQ_STEP);

  // Compute Lomb-Scargle PSD
  const psd = lombScargle(timestampsSec, centeredRR, frequencies);

  // Build spectrum
  const spectrum: SpectralPoint[] = frequencies.map((f, i) => ({
    frequency: f,
    power: psd[i],
  }));

  // Integrate band powers
  const vlfPower = integrateBand(frequencies, psd, FREQUENCY_BANDS.VLF.low, FREQUENCY_BANDS.VLF.high, FREQ_STEP);
  const lfPower = integrateBand(frequencies, psd, FREQUENCY_BANDS.LF.low, FREQUENCY_BANDS.LF.high, FREQ_STEP);
  const hfPower = integrateBand(frequencies, psd, FREQUENCY_BANDS.HF.low, FREQUENCY_BANDS.HF.high, FREQ_STEP);
  const totalPower = vlfPower + lfPower + hfPower;

  // Normalized powers
  const lfHfSum = lfPower + hfPower;
  const lfPowerNorm = lfHfSum > 0 ? (lfPower / lfHfSum) * 100 : 0;
  const hfPowerNorm = lfHfSum > 0 ? (hfPower / lfHfSum) * 100 : 0;
  const lfHfRatio = hfPower > 0 ? lfPower / hfPower : 0;

  // Peak frequencies
  const lfPeak = findPeakFrequency(frequencies, psd, FREQUENCY_BANDS.LF.low, FREQUENCY_BANDS.LF.high);
  const hfPeak = findPeakFrequency(frequencies, psd, FREQUENCY_BANDS.HF.low, FREQUENCY_BANDS.HF.high);

  return {
    vlfPower,
    lfPower,
    hfPower,
    totalPower,
    lfPowerNorm,
    hfPowerNorm,
    lfHfRatio,
    lfPeak,
    hfPeak,
    spectrum,
  };
}
