import { mean } from '../dsp/statistics.js';
import { FREQUENCY_BANDS } from './types.js';
import type { ResonanceMetrics, SpectralPoint } from './types.js';

/**
 * Square root of the variance explained by a joint sine/cosine fit with an
 * intercept. Irregular sampling makes the centered bases non-orthogonal, so
 * summing their independent squared correlations would double-count covariance.
 */
function sinusoidalFitCorrelation(values: number[], cosRef: number[], sinRef: number[]): number {
  const meanValue = mean(values);
  const meanCos = mean(cosRef);
  const meanSin = mean(sinRef);
  let cc = 0;
  let ss = 0;
  let cs = 0;
  let yc = 0;
  let ys = 0;
  let yy = 0;
  for (let i = 0; i < values.length; i++) {
    const y = values[i] - meanValue;
    const c = cosRef[i] - meanCos;
    const s = sinRef[i] - meanSin;
    cc += c * c;
    ss += s * s;
    cs += c * s;
    yc += y * c;
    ys += y * s;
    yy += y * y;
  }
  if (yy <= 1e-12) return 0;
  const determinant = cc * ss - cs * cs;
  let explained: number;
  if (determinant > 1e-12 * (cc + ss) ** 2) {
    explained = (ss * yc * yc - 2 * cs * yc * ys + cc * ys * ys) / determinant;
  } else {
    // At degenerate sample phases, use the single independent basis.
    const energy = Math.max(cc, ss);
    const covariance = cc >= ss ? yc : ys;
    explained = energy > 1e-12 ? (covariance * covariance) / energy : 0;
  }
  return Math.sqrt(Math.min(1, Math.max(0, explained / yy)));
}

/**
 * Computes resonance-specific HRV metrics.
 *
 * @param rrIntervals       - cleaned RR intervals in ms
 * @param timestamps        - timestamps in ms corresponding to each RR interval
 * @param breathingRateBPM  - breathing rate during session (breaths per minute)
 * @param spectrum          - spectral points from frequency domain analysis
 */
export function computeResonanceMetrics(
  rrIntervals: number[],
  timestamps: number[],
  breathingRateBPM: number,
  spectrum: SpectralPoint[]
): ResonanceMetrics {
  const emptyResult: ResonanceMetrics = {
    peakToTroughAmplitude: 0,
    waveformSmoothness: 0,
    phaseSynchrony: 0,
    lfPeakCount: 0,
    lfPeakAmplitude: 0,
  };

  if (
    rrIntervals.length < 2 ||
    rrIntervals.length !== timestamps.length ||
    !Number.isFinite(breathingRateBPM) ||
    breathingRateBPM <= 0 ||
    !rrIntervals.every((rr) => Number.isFinite(rr) && rr > 0) ||
    !timestamps.every((timestamp) => Number.isFinite(timestamp))
  ) {
    return emptyResult;
  }
  for (let i = 1; i < timestamps.length; i++) {
    if (timestamps[i] <= timestamps[i - 1]) return emptyResult;
  }

  const breathingFreqHz = breathingRateBPM / 60;
  const cycleDurationSec = 60 / breathingRateBPM;

  // Compute instantaneous HR series (BPM)
  const instantaneousHR = rrIntervals.map((rr) => 60000 / rr);
  // Subtract before converting to seconds to avoid large epoch-angle errors.
  const timestampsSec = timestamps.map((t) => (t - timestamps[0]) / 1000);

  // --- Peak-to-trough amplitude ---
  let peakToTroughAmplitude = 0;
  if (rrIntervals.length >= 2) {
    const totalDuration = timestampsSec[timestampsSec.length - 1] - timestampsSec[0];
    const numCycles = Math.floor(totalDuration / cycleDurationSec);

    if (numCycles >= 1) {
      const amplitudes: number[] = [];
      const startTime = timestampsSec[0];

      for (let c = 0; c < numCycles; c++) {
        const cycleStart = startTime + c * cycleDurationSec;
        const cycleEnd = cycleStart + cycleDurationSec;
        const cycleHR: number[] = [];

        for (let i = 0; i < timestampsSec.length; i++) {
          const t = timestampsSec[i];
          if (t >= cycleStart && t < cycleEnd) {
            cycleHR.push(instantaneousHR[i]);
          }
        }

        if (cycleHR.length >= 2) {
          // The measurement does not retain absolute pacer phase. A full-cycle
          // range is invariant to where the retained sample window starts,
          // unlike assuming that its first 40% is always inhale.
          amplitudes.push(Math.max(...cycleHR) - Math.min(...cycleHR));
        }
      }

      if (amplitudes.length > 0) {
        peakToTroughAmplitude = mean(amplitudes);
      }
    } else {
      // Fallback: use overall range if no full cycles
      peakToTroughAmplitude = Math.max(...instantaneousHR) - Math.min(...instantaneousHR);
    }
  }

  // --- Waveform smoothness ---
  // Power within ±0.015 Hz of breathing frequency / total LF power
  let waveformSmoothness = 0;
  if (spectrum.length > 0) {
    const focalLow = breathingFreqHz - 0.015;
    const focalHigh = breathingFreqHz + 0.015;

    let focalPower = 0;
    let totalLFPower = 0;

    for (const point of spectrum) {
      const f = point.frequency;
      if (f >= FREQUENCY_BANDS.LF.low && f < FREQUENCY_BANDS.LF.high) {
        totalLFPower += point.power;
        if (f >= focalLow && f <= focalHigh) {
          focalPower += point.power;
        }
      }
    }

    waveformSmoothness = totalLFPower > 0 ? Math.min(1, focalPower / totalLFPower) : 0;
  }

  // --- Phase synchrony ---
  // Absolute pacer phase is not retained. Fit both quadratures jointly so
  // their covariance cannot make synchrony depend on timestamp origin.
  let phaseSynchrony = 0;
  if (instantaneousHR.length >= 2) {
    const cosRef = timestampsSec.map((t) => Math.cos(2 * Math.PI * breathingFreqHz * t));
    const sinRef = timestampsSec.map((t) => Math.sin(2 * Math.PI * breathingFreqHz * t));
    phaseSynchrony = sinusoidalFitCorrelation(instantaneousHR, cosRef, sinRef);
  }

  // --- LF peak count ---
  // Find local maxima in LF band above 10% of max peak amplitude
  const lfPoints = spectrum.filter(
    (p) => p.frequency >= FREQUENCY_BANDS.LF.low && p.frequency < FREQUENCY_BANDS.LF.high
  );

  let lfPeakCount = 0;
  let lfPeakAmplitude = 0;

  if (lfPoints.length >= 3) {
    const maxLFPower = Math.max(...lfPoints.map((p) => p.power));
    const threshold = maxLFPower * 0.1;
    lfPeakAmplitude = maxLFPower;

    for (let i = 1; i < lfPoints.length - 1; i++) {
      const prev = lfPoints[i - 1].power;
      const curr = lfPoints[i].power;
      const next = lfPoints[i + 1].power;
      if (curr > prev && curr > next && curr > threshold) {
        lfPeakCount++;
      }
    }

    // Check boundaries
    if (lfPoints.length >= 2) {
      if (lfPoints[0].power > lfPoints[1].power && lfPoints[0].power > threshold) {
        lfPeakCount++;
      }
      const last = lfPoints.length - 1;
      if (lfPoints[last].power > lfPoints[last - 1].power && lfPoints[last].power > threshold) {
        lfPeakCount++;
      }
    }
  } else if (lfPoints.length > 0) {
    lfPeakCount = 1;
    lfPeakAmplitude = Math.max(...lfPoints.map((p) => p.power));
  }

  return {
    peakToTroughAmplitude: Math.max(0, peakToTroughAmplitude),
    waveformSmoothness,
    phaseSynchrony,
    lfPeakCount,
    lfPeakAmplitude,
  };
}
