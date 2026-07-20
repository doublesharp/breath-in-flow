export * from './types.js';
export * from './preprocessing.js';
export * from './timeDomain.js';
export * from './frequencyDomain.js';
export * from './resonanceMetrics.js';
export * from './resultsFusion.js';
export * from './eligibility.js';

import { mean } from '../dsp/statistics.js';
import type { IBISample, HRVAnalysis, ResonanceMetrics } from './types.js';
import { preprocessIBI } from './preprocessing.js';
import { computeTimeDomainMetrics } from './timeDomain.js';
import { computeFrequencyDomainMetrics } from './frequencyDomain.js';
import { computeResonanceMetrics } from './resonanceMetrics.js';

function normalizeIBISamples(samples: IBISample[]): {
  samples: IBISample[];
  discardedCount: number;
} {
  const finiteSamples = samples
    .filter(
      (sample) =>
        Number.isFinite(sample.timestamp) && Number.isFinite(sample.interval) && sample.interval > 0
    )
    .map((sample) => ({
      ...sample,
      quality: Number.isFinite(sample.quality) ? Math.min(1, Math.max(0, sample.quality)) : 0,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  const normalizedSamples: IBISample[] = [];
  let duplicateOrUnorderedCount = 0;

  for (const sample of finiteSamples) {
    const previous = normalizedSamples[normalizedSamples.length - 1];
    if (previous && sample.timestamp <= previous.timestamp) {
      duplicateOrUnorderedCount++;
      continue;
    }
    normalizedSamples.push(sample);
  }

  return {
    samples: normalizedSamples,
    discardedCount: samples.length - finiteSamples.length + duplicateOrUnorderedCount,
  };
}

/**
 * Full HRV analysis pipeline.
 *
 * @param samples           - raw IBI samples
 * @param breathingRateBPM  - optional breathing rate for resonance metrics
 */
export function analyzeHRV(samples: IBISample[], breathingRateBPM?: number): HRVAnalysis {
  const normalized = normalizeIBISamples(samples);
  const usableSamples = normalized.samples;

  // 1. Extract intervals and timestamps
  const rawIntervals = usableSamples.map((s) => s.interval);
  const rawTimestamps = usableSamples.map((s) => s.timestamp);
  const signalQualities = usableSamples.map((s) => s.quality);

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
  const artifactsDetected = artifactIndices.length + normalized.discardedCount;
  const quality = {
    totalSamples: samples.length,
    artifactsDetected,
    artifactPercentage: samples.length > 0 ? (artifactsDetected / samples.length) * 100 : 0,
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
