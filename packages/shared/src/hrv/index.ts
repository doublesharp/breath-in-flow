export * from './types.js';
export * from './preprocessing.js';
export * from './timeDomain.js';
export * from './frequencyDomain.js';
export * from './resonanceMetrics.js';
export * from './resultsFusion.js';

import { mean } from '../dsp/statistics.js';
import type { IBISample, HRVAnalysis, ResonanceMetrics } from './types.js';
import { preprocessIBI } from './preprocessing.js';
import { computeTimeDomainMetrics } from './timeDomain.js';
import { computeFrequencyDomainMetrics } from './frequencyDomain.js';
import { computeResonanceMetrics } from './resonanceMetrics.js';

/**
 * Full HRV analysis pipeline.
 *
 * @param samples           - raw IBI samples
 * @param breathingRateBPM  - optional breathing rate for resonance metrics
 */
export function analyzeHRV(
  samples: IBISample[],
  breathingRateBPM?: number
): HRVAnalysis {
  // 1. Extract intervals and timestamps
  const rawIntervals = samples.map((s) => s.interval);
  const rawTimestamps = samples.map((s) => s.timestamp);
  const signalQualities = samples.map((s) => s.quality);

  // 2. Preprocessing
  const preprocessed = preprocessIBI(rawIntervals, rawTimestamps);
  const { cleanedIntervals, cleanedTimestamps, artifactIndices } = preprocessed;

  // 3. Time-domain metrics
  const timeDomain = computeTimeDomainMetrics(cleanedIntervals);

  // 4. Frequency-domain metrics
  const frequencyDomain = computeFrequencyDomainMetrics(cleanedIntervals, cleanedTimestamps);

  // 5. Resonance metrics
  let resonance: ResonanceMetrics;
  if (breathingRateBPM != null && breathingRateBPM > 0) {
    resonance = computeResonanceMetrics(
      cleanedIntervals,
      cleanedTimestamps,
      breathingRateBPM,
      frequencyDomain.spectrum
    );
  } else {
    resonance = {
      peakToTroughAmplitude: 0,
      waveformSmoothness: 0,
      phaseSynchrony: 0,
      lfPeakCount: 0,
      lfPeakAmplitude: 0,
    };
  }

  // 6. Quality metrics
  const quality = {
    totalSamples: samples.length,
    artifactsDetected: artifactIndices.length,
    artifactPercentage: samples.length > 0
      ? (artifactIndices.length / samples.length) * 100
      : 0,
    meanSignalQuality: signalQualities.length > 0 ? mean(signalQualities) : 0,
  };

  // 7. Raw output
  const instantaneousHR = cleanedIntervals.map((rr) => 60000 / rr);

  return {
    timeDomain,
    frequencyDomain,
    resonance,
    quality,
    raw: {
      rrIntervals: cleanedIntervals,
      timestamps: cleanedTimestamps,
      instantaneousHR,
    },
  };
}
