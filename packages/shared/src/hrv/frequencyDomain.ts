import { mean } from '../dsp/statistics.js';
import { FREQUENCY_BANDS } from './types.js';
import type {
  FrequencyDomainAvailability,
  FrequencyDomainMetrics,
  FrequencyDomainUnavailableReason,
  SpectralPoint,
} from './types.js';

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
      power = 0.5 * ((cosNumer * cosNumer) / cosDenom + (sinNumer * sinNumer) / sinDenom);
    }

    // Normalize to PSD: divide by N/2 to get ms²/Hz
    result.push(power / (N / 2));
  }

  return result;
}

/**
 * Linear detrending: fit y = a + b*t via least squares and subtract.
 * Removes slow HR trends that create spurious VLF power.
 */
export function linearDetrend(values: number[], timestamps: number[]): number[] {
  const N = values.length;
  if (N < 2) return values.slice();

  // Least-squares fit: minimise sum((y_i - a - b*t_i)^2)
  let sumT = 0;
  let sumY = 0;
  let sumTT = 0;
  let sumTY = 0;

  for (let i = 0; i < N; i++) {
    sumT += timestamps[i];
    sumY += values[i];
    sumTT += timestamps[i] * timestamps[i];
    sumTY += timestamps[i] * values[i];
  }

  const denom = N * sumTT - sumT * sumT;
  if (Math.abs(denom) < 1e-12) {
    // Degenerate: all timestamps equal — just subtract mean
    const m = sumY / N;
    return values.map((v) => v - m);
  }

  const b = (N * sumTY - sumT * sumY) / denom;
  const a = (sumY - b * sumT) / N;

  return values.map((v, i) => v - (a + b * timestamps[i]));
}

/**
 * Hanning window: reduces spectral leakage for short recordings.
 * w[n] = 0.5 * (1 - cos(2π*n / (N-1)))
 */
export function hanningWindow(values: number[]): number[] {
  const N = values.length;
  if (N <= 1) return values.slice();
  return values.map((v, i) => v * 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1))));
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
export function integrateFrequencyBand(
  frequencies: number[],
  psd: number[],
  low: number,
  high: number,
  freqResolution: number,
  includeHigh: boolean
): number {
  let power = 0;
  for (let i = 0; i < frequencies.length; i++) {
    if (
      frequencies[i] >= low &&
      (includeHigh ? frequencies[i] <= high : frequencies[i] < high)
    ) {
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

function getFrequencySeriesIssue(
  rrIntervals: number[],
  timestamps: number[]
): FrequencyDomainUnavailableReason | null {
  if (rrIntervals.length !== timestamps.length) return 'invalid-series';
  if (!rrIntervals.every((rr) => Number.isFinite(rr) && rr > 0)) return 'invalid-series';
  if (!timestamps.every((timestamp) => Number.isFinite(timestamp))) return 'invalid-series';
  if (rrIntervals.length < 4) return 'insufficient-data';

  for (let i = 1; i < timestamps.length; i++) {
    if (timestamps[i] <= timestamps[i - 1]) return 'invalid-series';
  }

  return null;
}

function unavailableFrequencyDomain(
  reason: FrequencyDomainUnavailableReason
): FrequencyDomainAvailability {
  return { available: false, reason };
}

function availableFrequencyDomain(value: FrequencyDomainMetrics): FrequencyDomainAvailability {
  return { available: true, value };
}

/**
 * Computes frequency-domain HRV metrics using the Lomb-Scargle periodogram.
 *
 * Pre-processing pipeline (Bailón et al. 2010; Task Force 1996):
 *   1. Mean subtraction
 *   2. Linear detrending  — removes slow HR drift → reduces spurious VLF
 *   3. Hanning windowing  — reduces spectral leakage for short recordings
 *   4. Variance correction — preserves total power estimate after windowing
 *
 * @param rrIntervals - RR intervals in ms
 * @param timestamps  - timestamps in ms (same length as rrIntervals)
 */
export function computeFrequencyDomainMetrics(
  rrIntervals: number[],
  timestamps: number[]
): FrequencyDomainAvailability {
  const seriesIssue = getFrequencySeriesIssue(rrIntervals, timestamps);
  if (seriesIssue) return unavailableFrequencyDomain(seriesIssue);

  // Convert timestamps to seconds
  const timestampsSec = timestamps.map((t) => t / 1000);

  // ── 1. Mean subtraction ──
  const meanRR = mean(rrIntervals);
  const centeredRR = rrIntervals.map((rr) => rr - meanRR);

  // ── 2. Linear detrending ──
  const detrendedRR = linearDetrend(centeredRR, timestampsSec);

  // ── 3. Hanning windowing ──
  const windowedRR = hanningWindow(detrendedRR);

  // ── 4. Variance correction ──
  // Preserve power estimate: scale windowed signal so its variance matches
  // the detrended signal's variance before windowing.
  const detrendedVar = detrendedRR.reduce((s, v) => s + v * v, 0) / detrendedRR.length;
  if (!Number.isFinite(detrendedVar) || detrendedVar <= 1e-12) {
    return unavailableFrequencyDomain('no-variability');
  }
  const windowedVar = windowedRR.reduce((s, v) => s + v * v, 0) / windowedRR.length;
  const correctionFactor = windowedVar > 1e-12 ? Math.sqrt(detrendedVar / windowedVar) : 1;
  const processedRR = windowedRR.map((v) => v * correctionFactor);

  // Generate frequency grid: 0.003 to 0.4 Hz with 0.001 Hz step
  const FREQ_START = 0.003;
  const FREQ_END = 0.4;
  const FREQ_STEP = 0.001;
  const frequencies = generateFrequencyGrid(FREQ_START, FREQ_END, FREQ_STEP);

  // Compute Lomb-Scargle PSD
  const psd = lombScargle(timestampsSec, processedRR, frequencies);

  // Integrate band powers
  const lfPower = integrateFrequencyBand(
    frequencies,
    psd,
    FREQUENCY_BANDS.LF.low,
    FREQUENCY_BANDS.LF.high,
    FREQ_STEP,
    false
  );
  const hfPower = integrateFrequencyBand(
    frequencies,
    psd,
    FREQUENCY_BANDS.HF.low,
    FREQUENCY_BANDS.HF.high,
    FREQ_STEP,
    true
  );
  const spectrumPower = psd.reduce((sum, power) => sum + power, 0);
  if (!Number.isFinite(spectrumPower) || spectrumPower <= 1e-12) {
    return unavailableFrequencyDomain('no-variability');
  }

  const spectrum: SpectralPoint[] = frequencies.map((frequency, index) => ({
    frequency,
    power: (psd[index] / spectrumPower) * 100,
  }));

  // Normalized powers
  const lfHfSum = lfPower + hfPower;
  const lfPowerNorm = lfHfSum > 0 ? (lfPower / lfHfSum) * 100 : 0;
  const hfPowerNorm = lfHfSum > 0 ? (hfPower / lfHfSum) * 100 : 0;
  const lfHfRatio = hfPower > 0 ? lfPower / hfPower : 0;

  // Peak frequencies
  const lfPeak = findPeakFrequency(
    frequencies,
    psd,
    FREQUENCY_BANDS.LF.low,
    FREQUENCY_BANDS.LF.high
  );
  const hfPeak = findPeakFrequency(
    frequencies,
    psd,
    FREQUENCY_BANDS.HF.low,
    FREQUENCY_BANDS.HF.high
  );

  return availableFrequencyDomain({
    lfPowerNorm,
    hfPowerNorm,
    lfHfRatio,
    lfPeak,
    hfPeak,
    spectrum,
  });
}
